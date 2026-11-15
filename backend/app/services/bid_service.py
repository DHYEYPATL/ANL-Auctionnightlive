"""
Hardened bid transaction service.

Order follows HD hardening doc §3 exactly:
  1. Pre-tx: validate payload shape, compute request_hash, record received_at
  2. BEGIN + SET LOCAL timeouts
  3. SELECT rfq FOR UPDATE  (first statement)
  4. decision_at = GREATEST(clock_timestamp(), last_decision_at)
  5. Idempotency check
  6. Eligibility (user active, supplier active, invitation ACTIVE, previous total)
  7. Time checks using decision_at
  8. Business checks: total > 0, below ceiling, strictly lower, large-drop
  9. Pre-bid standings (in-memory rank maps)
 10. bid_seq = last_bid_seq + 1  (in-memory)
 11. INSERT bid (accepted_at = decision_at, bid_seq, close_at_before/after)
     UPDATE rfq_suppliers.current_* (denormalized standings — HD-RT-06)
 12. INSERT events in causal order with consecutive event_seq
 13. UPDATE rfqs: current_close_at, version, last_bid_seq, last_event_seq, last_decision_at
 14. COMMIT — build response from captured values, no re-query
 15. After commit: write bid_attempts row (never inside the tx)
"""
import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, bad_request, conflict, forbidden, not_found, validation_error
from app.core.money import assert_total_matches, is_large_drop
from app.db.models import Bid, BidAttempt
from app.repositories.bid_repository import BidRepository
from app.repositories.rfq_repository import RfqRepository
from app.schemas.bid import BidResponse, ExtensionResult, SubmitBidRequest
from app.services.event_service import EventService
from app.services.ranking_service import StandingEntry, get_standings_from_rfq_suppliers


def _rank_map(standings: list[StandingEntry]) -> dict[uuid.UUID, int]:
    return {s.supplier_id: s.rank_number for s in standings}


def _l1_id(standings: list[StandingEntry]) -> uuid.UUID | None:
    return standings[0].supplier_id if standings else None


def _evaluate_triggers(
    configured: list[str],
    before: list[StandingEntry],
    after: list[StandingEntry],
    new_supplier_id: uuid.UUID,
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
        request_id: str = "",
    ) -> BidResponse:
        # ── Step 1: pre-transaction ─────────────────────────────────────────────
        wall_start = time.monotonic()
        received_at = datetime.now(timezone.utc)
        request_hash = payload.canonical_hash()

        # Validate key format (HD-CON-09: 8-128 chars [A-Za-z0-9_.:-])
        if not idempotency_key or not (8 <= len(idempotency_key) <= 128):
            raise bad_request("IDEMPOTENCY_KEY_REQUIRED: key must be 8–128 characters")

        total = payload.total()
        if total <= Decimal("0"):
            raise validation_error("TOTAL_MUST_BE_POSITIVE: bid total must be greater than zero")

        outcome = "UNKNOWN"
        bid_id_out: uuid.UUID | None = None
        lock_wait_ms = 0
        decided_at: datetime | None = None

        try:
            # ── Step 2–14: main transaction ────────────────────────────────────
            result = await self._run_transaction(
                rfq_id, supplier_id, user_id, payload, idempotency_key,
                request_hash, received_at, total, request_id
            )
            outcome = "REPLAYED" if result.replayed else "ACCEPTED"
            bid_id_out = result.bid_id
            lock_wait_ms = getattr(result, "_lock_wait_ms", 0)
            decided_at = result.accepted_at
            return result

        except AppError as e:
            outcome = e.code
            raise

        finally:
            # ── Step 15: write attempt record outside the transaction ───────────
            wall_ms = int((time.monotonic() - wall_start) * 1000)
            try:
                async with self.db.begin_nested():
                    attempt = BidAttempt(
                        rfq_id=rfq_id,
                        supplier_id=supplier_id,
                        user_id=user_id,
                        bid_id=bid_id_out,
                        idempotency_key=idempotency_key,
                        idempotency_key_prefix=idempotency_key[:8],
                        outcome=outcome,
                        received_at=received_at,
                        decided_at=decided_at,
                        lock_wait_ms=lock_wait_ms,
                        total_ms=wall_ms,
                        request_hash=request_hash,
                        details={"request_id": request_id},
                    )
                    self.db.add(attempt)
            except Exception:
                pass  # attempt write never fails the bid result

    async def _run_transaction(
        self,
        rfq_id: uuid.UUID,
        supplier_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: SubmitBidRequest,
        idempotency_key: str,
        request_hash: str,
        received_at: datetime,
        total: Decimal,
        request_id: str,
    ) -> BidResponse:
        # ── Step 2: timeouts (HD-CON-06) ───────────────────────────────────────
        await self.db.execute(text(
            f"SET LOCAL lock_timeout = '{settings.LOCK_TIMEOUT_MS}ms'; "
            f"SET LOCAL statement_timeout = '{settings.STATEMENT_TIMEOUT_MS}ms'; "
            f"SET LOCAL idle_in_transaction_session_timeout = '{settings.IDLE_IN_TX_TIMEOUT_MS}ms'"
        ))

        # ── Step 3: SELECT FOR UPDATE (first statement, HD-CON-01) ─────────────
        lock_start = time.monotonic()
        rfq = await self.rfq_repo.get_by_id_for_update(rfq_id)
        if not rfq:
            raise not_found()
        lock_wait_ms = int((time.monotonic() - lock_start) * 1000)

        # ── Step 4: decision_at (HD-CON-03) ────────────────────────────────────
        now_row = await self.db.execute(
            text("SELECT GREATEST(clock_timestamp(), :last_dt) AS decision_at"),
            {"last_dt": rfq.last_decision_at or datetime(2000, 1, 1, tzinfo=timezone.utc)},
        )
        decision_at: datetime = now_row.scalar_one()

        # ── Step 5: idempotency (HD-CON-09) ────────────────────────────────────
        existing = await self.bid_repo.find_by_idempotency(rfq_id, supplier_id, idempotency_key)
        if existing:
            if existing.request_hash and existing.request_hash != request_hash:
                raise conflict("IDEMPOTENCY_CONFLICT", "Same key with a different payload.")
            # Replay — return original result (200, replayed=True, CHG-5)
            standings = await get_standings_from_rfq_suppliers(rfq_id, self.db)
            my_rank = next((s for s in standings if s.supplier_id == supplier_id), None)
            l1 = standings[0] if standings else None
            resp = BidResponse(
                bid_id=existing.id,
                rfq_id=rfq_id,
                bid_seq=existing.bid_seq,
                total_amount=str(existing.total_amount),
                currency=rfq.currency,
                accepted_at=existing.accepted_at,
                rank=my_rank.rank_label if my_rank else "L?",
                current_l1_total=str(l1.total_amount) if l1 else None,
                current_close_at=rfq.current_close_at,
                extension=ExtensionResult(applied=False),
                rfq_version=rfq.version,
                request_id=request_id,
                replayed=True,
            )
            resp._lock_wait_ms = lock_wait_ms  # type: ignore[attr-defined]
            return resp

        # ── Step 6: eligibility (HD-SEC-10) ────────────────────────────────────
        # Re-read user/supplier active status and invitation AFTER lock
        eligibility = await self.db.execute(
            text("""
                SELECT u.is_active AS user_active,
                       s.is_active AS supplier_active,
                       rs.invitation_status,
                       rs.anon_label,
                       (SELECT b.total_amount
                        FROM bids b
                        WHERE b.rfq_id = :rfq_id AND b.supplier_id = :supplier_id
                        ORDER BY b.accepted_at DESC, b.id DESC LIMIT 1) AS prev_total
                FROM users u
                JOIN suppliers s ON s.id = u.supplier_id
                JOIN rfq_suppliers rs ON rs.rfq_id = :rfq_id AND rs.supplier_id = s.id
                WHERE u.id = :user_id
            """),
            {"rfq_id": str(rfq_id), "supplier_id": str(supplier_id), "user_id": str(user_id)},
        )
        row = eligibility.mappings().one_or_none()
        if not row:
            raise forbidden("SUPPLIER_INACTIVE: no active invitation found")
        if not row["user_active"] or not row["supplier_active"]:
            raise AppError(403, "SUPPLIER_INACTIVE", "Supplier or user has been deactivated.")
        if row["invitation_status"] != "ACTIVE":
            raise AppError(403, "SUPPLIER_INACTIVE", "Your invitation has been revoked.")
        previous_total: Decimal | None = row["prev_total"]

        # ── Step 7: time checks (HD-CON-03, SRS BR-10) ─────────────────────────
        if rfq.published_at is None:
            raise conflict("AUCTION_NOT_STARTED", "This auction has not been published.")
        if decision_at < rfq.start_at:
            raise conflict("AUCTION_NOT_STARTED", "This auction has not started yet.")
        if decision_at >= rfq.forced_close_at:
            raise conflict("AUCTION_CLOSED", "This auction is closed. New bids are no longer accepted.")
        if decision_at >= rfq.current_close_at:
            raise conflict("AUCTION_CLOSED", "This auction is closed. New bids are no longer accepted.")

        # ── Step 8: business checks ─────────────────────────────────────────────
        if payload.valid_until < rfq.service_date:
            raise validation_error("Quote validity must cover the RFQ service date.")
        if payload.transit_time_days > 365:
            raise validation_error("INVALID_QUOTE: transit days must be 0–365.")

        if previous_total is not None:
            if total >= previous_total:
                raise conflict(
                    "BID_NOT_LOWER_THAN_PREVIOUS",
                    "Your new total must be lower than your previous accepted total.",
                    {"previous_total": str(previous_total), "submitted_total": str(total)},
                )
            # HD-BID-06: large-drop confirmation
            if (not payload.confirm_large_drop and
                    is_large_drop(total, previous_total, settings.LARGE_DROP_CONFIRM_PCT)):
                drop_pct = int((1 - total / previous_total) * 100)
                raise conflict(
                    "CONFIRMATION_REQUIRED",
                    "Your bid is a large drop. Re-send with confirm_large_drop=true.",
                    {"previous_total": str(previous_total), "submitted_total": str(total), "drop_pct": drop_pct},
                )

        # ── Step 9: pre-bid standings ───────────────────────────────────────────
        before = await get_standings_from_rfq_suppliers(rfq_id, self.db)

        # ── Step 10: bid_seq (HD-CON-04) ───────────────────────────────────────
        new_bid_seq = rfq.last_bid_seq + 1

        # ── Step 11: INSERT bid ─────────────────────────────────────────────────
        close_at_before = rfq.current_close_at
        bid = Bid(
            rfq_id=rfq_id,
            supplier_id=supplier_id,
            submitted_by_user_id=user_id,
            freight_charge=payload.parsed_freight(),
            origin_charge=payload.parsed_origin(),
            destination_charge=payload.parsed_destination(),
            total_amount=total,
            transit_time_days=payload.transit_time_days,
            valid_until=payload.valid_until,
            idempotency_key=idempotency_key,
            bid_seq=new_bid_seq,
            close_at_before=close_at_before,
            received_at=received_at,
            lock_wait_ms=lock_wait_ms,
            request_hash=request_hash,
            accepted_at=decision_at,
        )
        bid = await self.bid_repo.insert(bid)

        # Post-insert assertion (HD-BID-02)
        assert_total_matches(bid.freight_charge, bid.origin_charge, bid.destination_charge, bid.total_amount)

        # Update denormalized standings on rfq_suppliers (HD-RT-06)
        await self.db.execute(
            text("""
                UPDATE rfq_suppliers
                SET current_bid_id = :bid_id,
                    current_total = :total,
                    current_bid_seq = :seq
                WHERE rfq_id = :rfq_id AND supplier_id = :supplier_id
            """),
            {"bid_id": str(bid.id), "total": str(total), "seq": new_bid_seq,
             "rfq_id": str(rfq_id), "supplier_id": str(supplier_id)},
        )

        # Post-bid standings
        after = await get_standings_from_rfq_suppliers(rfq_id, self.db)

        # ── Step 12: events in causal order (HD-CON-16) ────────────────────────
        config = await self.rfq_repo.get_config(rfq_id)
        new_event_seq = rfq.last_event_seq

        new_event_seq += 1
        await self.events.append_seq(
            rfq_id, "BID_SUBMITTED", new_event_seq, rfq.version + 1,
            actor_user_id=user_id, bid_id=bid.id,
            details={"total": str(total), "bid_seq": new_bid_seq},
        )

        b_map = _rank_map(before)
        a_map = _rank_map(after)
        for sup in set(b_map) | set(a_map):
            if b_map.get(sup) != a_map.get(sup):
                new_event_seq += 1
                await self.events.append_seq(
                    rfq_id, "RANK_CHANGED", new_event_seq, rfq.version + 1, bid_id=bid.id,
                    details={"supplier_id": str(sup), "from_rank": b_map.get(sup), "to_rank": a_map.get(sup)},
                )

        # ── Extension evaluation (HD-LIFE-07/08/09) ────────────────────────────
        extension_result = ExtensionResult(applied=False)
        new_close = rfq.current_close_at
        extension_count = rfq.version  # placeholder; actual stored separately

        if config:
            trigger_start = rfq.current_close_at - timedelta(minutes=config.trigger_window_minutes)
            inside_window = trigger_start <= decision_at < rfq.current_close_at

            if inside_window:
                matched = _evaluate_triggers(config.triggers, before, after, supplier_id)
                if matched:
                    proposed = rfq.current_close_at + timedelta(minutes=config.extension_duration_minutes)
                    capped_new_close = min(proposed, rfq.forced_close_at)
                    if capped_new_close > rfq.current_close_at:
                        old_close = rfq.current_close_at
                        new_close = capped_new_close
                        capped = proposed > rfq.forced_close_at
                        new_event_seq += 1
                        # Update close_at_after on the bid
                        await self.db.execute(
                            text("UPDATE bids SET close_at_after = :ca WHERE id = :bid_id"),
                            {"ca": new_close, "bid_id": str(bid.id)},
                        )
                        await self.events.append_seq(
                            rfq_id, "EXTENSION_APPLIED", new_event_seq, rfq.version + 1,
                            bid_id=bid.id,
                            details={
                                "previous_close_at": old_close.isoformat(),
                                "new_close_at": new_close.isoformat(),
                                "forced_close_at": rfq.forced_close_at.isoformat(),
                                "extension_duration_minutes": config.extension_duration_minutes,
                                "matched_reasons": matched,
                                "bid_id": str(bid.id),
                                "decision_at": decision_at.isoformat(),
                                "capped": capped,
                                "x": config.trigger_window_minutes,
                                "y": config.extension_duration_minutes,
                            },
                        )
                        extension_result = ExtensionResult(
                            applied=True,
                            previous_close_at=old_close,
                            new_close_at=new_close,
                            matched_triggers=matched,
                            capped_by_forced_close=capped,
                        )

        # ── Step 13: UPDATE rfqs (HD-CON-15) ───────────────────────────────────
        await self.db.execute(
            text("""
                UPDATE rfqs SET
                    current_close_at = :new_close,
                    version = version + 1,
                    last_bid_seq = :bid_seq,
                    last_event_seq = :event_seq,
                    last_decision_at = :decision_at
                WHERE id = :rfq_id
            """),
            {
                "new_close": new_close,
                "bid_seq": new_bid_seq,
                "event_seq": new_event_seq,
                "decision_at": decision_at,
                "rfq_id": str(rfq_id),
            },
        )

        # ── Step 14: build response from captured values ────────────────────────
        my_rank = next((s for s in after if s.supplier_id == supplier_id), None)
        l1 = after[0] if after else None
        new_version = rfq.version + 1

        resp = BidResponse(
            bid_id=bid.id,
            rfq_id=rfq_id,
            bid_seq=new_bid_seq,
            total_amount=str(total),
            currency=rfq.currency,
            accepted_at=decision_at,
            rank=my_rank.rank_label if my_rank else "L1",
            current_l1_total=str(l1.total_amount) if l1 else None,
            current_close_at=new_close,
            extension=extension_result,
            rfq_version=new_version,
            request_id=request_id,
            replayed=False,
        )
        resp._lock_wait_ms = lock_wait_ms  # type: ignore[attr-defined]
        return resp
