"""
RFQ service — hardened per HD doc.
HD-LIFE-10: publish is compare-and-set under RFQ lock; assigns anon_labels.
HD-BID-03: currency whitelist enforced at create.
HD-BID-11: datetime must carry offset.
"""
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.money import validate_currency
from app.db.models import AuctionConfig, Rfq, RfqSupplier, Supplier
from app.repositories.rfq_repository import RfqRepository
from app.schemas.rfq import CreateRfqRequest, PatchRfqRequest
from app.services.event_service import EventService


def _require_offset_aware(dt: datetime, field: str) -> None:
    """HD-BID-11: reject naive datetimes."""
    if dt.tzinfo is None:
        raise bad_request(f"TIMESTAMP_TIMEZONE_REQUIRED: {field} must include a timezone offset")


def _assign_anon_labels(supplier_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """HD-SEC-05: random permutation, never derived from order or UUID."""
    n = len(supplier_ids)
    nums = random.sample(range(1, n + 1), n)
    return {sid: f"Supplier {nums[i]}" for i, sid in enumerate(supplier_ids)}


class RfqService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = RfqRepository(db)
        self.events = EventService(db)

    async def create(self, buyer_id: uuid.UUID, req: CreateRfqRequest) -> Rfq:
        _require_offset_aware(req.start_at, "start_at")
        _require_offset_aware(req.scheduled_close_at, "scheduled_close_at")
        _require_offset_aware(req.forced_close_at, "forced_close_at")

        try:
            currency = validate_currency(req.currency)
        except ValueError as e:
            raise bad_request(str(e))

        existing = await self.db.execute(
            select(Rfq).where(Rfq.buyer_id == buyer_id, Rfq.reference_id == req.reference_id.strip())
        )
        if existing.scalar_one_or_none():
            raise bad_request("Reference ID already exists for this account.")

        for sid in req.supplier_ids:
            s = await self.db.execute(select(Supplier).where(Supplier.id == sid, Supplier.is_active == True))
            if not s.scalar_one_or_none():
                raise bad_request(f"Supplier {sid} not found or inactive.")

        rfq = Rfq(
            buyer_id=buyer_id,
            name=req.name.strip(),
            reference_id=req.reference_id.strip(),
            currency=currency,
            service_date=req.service_date,
            start_at=req.start_at,
            scheduled_close_at=req.scheduled_close_at,
            current_close_at=req.scheduled_close_at,
            forced_close_at=req.forced_close_at,
            status="DRAFT",
        )
        await self.repo.create(rfq)

        config = AuctionConfig(
            rfq_id=rfq.id,
            trigger_window_minutes=req.auction_config.trigger_window_minutes,
            extension_duration_minutes=req.auction_config.extension_duration_minutes,
            triggers=list(req.auction_config.triggers),
        )
        self.db.add(config)

        for sid in req.supplier_ids:
            self.db.add(RfqSupplier(rfq_id=rfq.id, supplier_id=sid, invitation_status="ACTIVE"))

        await self.db.flush()
        return rfq

    async def publish(self, rfq_id: uuid.UUID, buyer_id: uuid.UUID) -> Rfq:
        rfq = await self.repo.get_by_id_for_update(rfq_id)
        if not rfq:
            raise not_found()
        if rfq.buyer_id != buyer_id:
            raise not_found()

        # Second publish returns 200 with current state (HD-LIFE-10 idempotent)
        if rfq.status not in ("DRAFT",):
            return rfq

        now_row = await self.db.execute(text("SELECT clock_timestamp()"))
        now: datetime = now_row.scalar_one()

        if now >= rfq.forced_close_at:
            raise bad_request("Cannot publish: forced close is already in the past.")

        inv_count = await self.db.execute(
            text("SELECT COUNT(*) FROM rfq_suppliers WHERE rfq_id = :id AND invitation_status = 'ACTIVE'"),
            {"id": str(rfq_id)},
        )
        if inv_count.scalar_one() == 0:
            raise bad_request("At least one active supplier must be invited before publishing.")

        # HD-SEC-05: assign anon labels before publish
        invitees_q = await self.db.execute(
            text("SELECT supplier_id FROM rfq_suppliers WHERE rfq_id = :id AND invitation_status = 'ACTIVE'"),
            {"id": str(rfq_id)},
        )
        supplier_ids = [uuid.UUID(str(r[0])) for r in invitees_q.fetchall()]
        label_map = _assign_anon_labels(supplier_ids)
        for sid, label in label_map.items():
            await self.db.execute(
                text("UPDATE rfq_suppliers SET anon_label = :label WHERE rfq_id = :rfq AND supplier_id = :sup"),
                {"label": label, "rfq": str(rfq_id), "sup": str(sid)},
            )

        new_status = "ACTIVE" if now >= rfq.start_at else "SCHEDULED"
        rfq.status = new_status
        rfq.published_at = now
        rfq.version = rfq.version + 1
        await self.db.flush()
        await self.events.append(rfq.id, "PUBLISHED", actor_user_id=buyer_id, details={"status": new_status})
        return rfq

    async def cancel(self, rfq_id: uuid.UUID, buyer_id: uuid.UUID) -> Rfq:
        rfq = await self.repo.get_by_id_for_update(rfq_id)
        if not rfq:
            raise not_found()
        if rfq.buyer_id != buyer_id:
            raise not_found()
        if rfq.status not in ("DRAFT", "SCHEDULED"):
            raise conflict("RFQ_IMMUTABLE", "Only draft or scheduled auctions can be cancelled.")
        rfq.status = "CANCELLED"
        rfq.version = rfq.version + 1
        await self.db.flush()
        await self.events.append(rfq.id, "AUCTION_CANCELLED", actor_user_id=buyer_id)
        return rfq

    async def patch(self, rfq_id: uuid.UUID, buyer_id: uuid.UUID, req: PatchRfqRequest) -> Rfq:
        rfq = await self.repo.get_by_id_for_update(rfq_id)
        if not rfq:
            raise not_found()
        if rfq.buyer_id != buyer_id:
            raise not_found()
        if rfq.status != "DRAFT":
            raise conflict("RFQ_IMMUTABLE", "Published RFQs cannot be edited.")

        if req.name is not None:
            rfq.name = req.name.strip()
        if req.reference_id is not None:
            rfq.reference_id = req.reference_id.strip()
        if req.service_date is not None:
            rfq.service_date = req.service_date

        if req.supplier_ids is not None:
            await self.db.execute(
                text("DELETE FROM rfq_suppliers WHERE rfq_id = :rfq_id"),
                {"rfq_id": str(rfq_id)},
            )
            for sid in req.supplier_ids:
                self.db.add(RfqSupplier(rfq_id=rfq_id, supplier_id=sid, invitation_status="ACTIVE"))

        if req.auction_config is not None:
            config = await self.repo.get_config(rfq_id)
            if config:
                config.trigger_window_minutes = req.auction_config.trigger_window_minutes
                config.extension_duration_minutes = req.auction_config.extension_duration_minutes
                config.triggers = list(req.auction_config.triggers)

        await self.db.flush()
        return rfq
