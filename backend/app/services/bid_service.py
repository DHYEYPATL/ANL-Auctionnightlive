import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, bad_request, conflict, forbidden, not_found, validation_error
from app.db.models import Bid
from app.repositories.bid_repository import BidRepository
from app.repositories.rfq_repository import RfqRepository
from app.schemas.bid import BidResponse, ExtensionResult, SubmitBidRequest
from app.services.event_service import EventService
from app.services.ranking_service import StandingEntry, get_standings


def _rank_map(standings: list[StandingEntry]) -> dict[uuid.UUID, int]:
    return {s.supplier_id: s.rank_number for s in standings}


def _l1_id(standings: list[StandingEntry]) -> uuid.UUID | None:
    if not standings:
        return None
    return standings[0].supplier_id


def _evaluate_triggers(
    configured: list[str],
    before: list[StandingEntry],
    after: list[StandingEntry],
    new_bid: Bid,
) -> list[str]:
    matched: list[str] = []

    if "BID_RECEIVED" in configured:
        matched.append("BID_RECEIVED")

    if "ANY_RANK_CHANGE" in configured:
        b_map = _rank_map(before)
        a_map = _rank_map(after)
        all_suppliers = set(b_map) | set(a_map)
        if any(b_map.get(s) != a_map.get(s) for s in all_suppliers):
            matched.append("ANY_RANK_CHANGE")

    if "L1_CHANGE" in configured:
        if _l1_id(before) != _l1_id(after):
            matched.append("L1_CHANGE")

    return matched


class BidService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.rfq_repo = RfqRepository(db)
        self.bid_repo = BidRepository(db)
        self.events = EventService(db)

    async def submit(
        self,
        rfq_id: uuid.UUID,
        supplier_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: SubmitBidRequest,
        idempotency_key: str,
    ) -> BidResponse:
        # Everything inside ONE transaction (called by router which manages the session)
        rfq = await self.rfq_repo.get_by_id_for_update(rfq_id)
        if not rfq:
            raise not_found()

        # DB clock — read AFTER acquiring lock
        now_row = await self.db.execute(text("SELECT clock_timestamp()"))
        now: datetime = now_row.scalar_one()

        # Idempotency check
        existing = await self.bid_repo.find_by_idempotency(rfq_id, supplier_id, idempotency_key)
        if existing:
            # Same key + same supplier → return original
            standings = await get_standings(rfq_id, self.db)
            my_rank = next((s for s in standings if s.supplier_id == supplier_id), None)
            l1 = standings[0] if standings else None
            return BidResponse(
                bid_id=existing.id,
                rfq_id=rfq_id,
                total_amount=str(existing.total_amount),
                currency=rfq.currency,
                accepted_at=existing.accepted_at,
                rank=my_rank.rank_label if my_rank else "L?",
                current_l1_total=str(l1.total_amount) if l1 else None,
                current_close_at=rfq.current_close_at,
                extension=ExtensionResult(applied=False),
            )

        # Active invitation check
        is_invitee = await self.rfq_repo.is_active_invitee(rfq_id, supplier_id)
        if not is_invitee:
            raise forbidden("You are not an active invitee of this RFQ.")

        # Auction window checks
        if rfq.published_at is None:
            raise conflict("AUCTION_NOT_STARTED", "This auction has not been published.")
        if now < rfq.start_at:
            raise conflict("AUCTION_NOT_STARTED", "This auction has not started yet.")
        if now >= rfq.forced_close_at:
            raise conflict("AUCTION_CLOSED", "This auction is closed.")
        if now >= rfq.current_close_at:
            raise conflict("AUCTION_CLOSED", "This auction is closed.")

        # Quote validation
        total = payload.freight_charge + payload.origin_charge + payload.destination_charge
        if payload.valid_until < rfq.service_date:
            raise validation_error("Quote validity must cover the RFQ service date.")

        # Previous bid check
        previous = await self.bid_repo.latest_for_supplier(rfq_id, supplier_id)
        if previous and total >= previous.total_amount:
            raise conflict(
                "BID_NOT_LOWER_THAN_PREVIOUS",
                "Your new total must be lower than your previous accepted total.",
                {"previous_total": str(previous.total_amount), "submitted_total": str(total)},
            )

        # Pre-bid standings
        before = await get_standings(rfq_id, self.db)

        # Insert immutable bid
        bid = Bid(
            rfq_id=rfq_id,
            supplier_id=supplier_id,
            submitted_by_user_id=user_id,
            freight_charge=payload.freight_charge,
            origin_charge=payload.origin_charge,
            destination_charge=payload.destination_charge,
            total_amount=total,
            transit_time_days=payload.transit_time_days,
            valid_until=payload.valid_until,
            idempotency_key=idempotency_key,
        )
        bid = await self.bid_repo.insert(bid)

        # Post-bid standings
        after = await get_standings(rfq_id, self.db)

        # Events
        await self.events.append(rfq_id, "BID_SUBMITTED", actor_user_id=user_id, bid_id=bid.id,
                                  details={"total": str(total)})

        # Rank change events
        b_map = _rank_map(before)
        a_map = _rank_map(after)
        all_sups = set(b_map) | set(a_map)
        for sup in all_sups:
            if b_map.get(sup) != a_map.get(sup):
                await self.events.append(
                    rfq_id, "RANK_CHANGED", bid_id=bid.id,
                    details={
                        "supplier_id": str(sup),
                        "from_rank": b_map.get(sup),
                        "to_rank": a_map.get(sup),
                    },
                )

        # Extension evaluation
        config = await self.rfq_repo.get_config(rfq_id)
        extension_result = ExtensionResult(applied=False)

        if config:
            trigger_start = rfq.current_close_at - timedelta(minutes=config.trigger_window_minutes)
            inside_window = trigger_start <= now < rfq.current_close_at

            if inside_window:
                matched = _evaluate_triggers(config.triggers, before, after, bid)
                if matched:
                    proposed = rfq.current_close_at + timedelta(minutes=config.extension_duration_minutes)
                    new_close = min(proposed, rfq.forced_close_at)
                    if new_close > rfq.current_close_at:
                        old_close = rfq.current_close_at
                        await self.rfq_repo.update_current_close(rfq_id, new_close)
                        rfq.current_close_at = new_close  # update local reference
                        capped = (proposed > rfq.forced_close_at)
                        await self.events.append(
                            rfq_id, "EXTENSION_APPLIED", bid_id=bid.id,
                            details={
                                "previous_close": old_close.isoformat(),
                                "new_close": new_close.isoformat(),
                                "forced_close": rfq.forced_close_at.isoformat(),
                                "extension_duration_minutes": config.extension_duration_minutes,
                                "matched_reasons": matched,
                                "capped_by_forced_close": capped,
                            },
                        )
                        extension_result = ExtensionResult(
                            applied=True,
                            previous_close_at=old_close,
                            new_close_at=new_close,
                            matched_triggers=matched,
                            capped_by_forced_close=capped,
                        )

        my_rank = next((s for s in after if s.supplier_id == supplier_id), None)
        l1 = after[0] if after else None

        return BidResponse(
            bid_id=bid.id,
            rfq_id=rfq_id,
            total_amount=str(total),
            currency=rfq.currency,
            accepted_at=bid.accepted_at,
            rank=my_rank.rank_label if my_rank else "L1",
            current_l1_total=str(l1.total_amount) if l1 else None,
            current_close_at=rfq.current_close_at,
            extension=extension_result,
        )
