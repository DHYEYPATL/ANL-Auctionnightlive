import uuid
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Bid


class BidRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_idempotency(
        self, rfq_id: uuid.UUID, supplier_id: uuid.UUID, key: str
    ) -> Bid | None:
        result = await self.db.execute(
            select(Bid).where(
                Bid.rfq_id == rfq_id,
                Bid.supplier_id == supplier_id,
                Bid.idempotency_key == key,
            )
        )
        return result.scalar_one_or_none()

    async def latest_for_supplier(self, rfq_id: uuid.UUID, supplier_id: uuid.UUID) -> Bid | None:
        result = await self.db.execute(
            select(Bid)
            .where(Bid.rfq_id == rfq_id, Bid.supplier_id == supplier_id)
            .order_by(Bid.accepted_at.desc(), Bid.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def insert(self, bid: Bid) -> Bid:
        self.db.add(bid)
        await self.db.flush()
        await self.db.refresh(bid)
        return bid

    async def list_for_rfq(self, rfq_id: uuid.UUID, after_id: uuid.UUID | None, limit: int) -> list[Bid]:
        q = select(Bid).where(Bid.rfq_id == rfq_id)
        if after_id:
            subq = select(Bid.accepted_at).where(Bid.id == after_id).scalar_subquery()
            q = q.where(Bid.accepted_at < subq)
        q = q.order_by(Bid.accepted_at.desc()).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def count_for_rfq(self, rfq_id: uuid.UUID) -> int:
        result = await self.db.execute(
            text("SELECT COUNT(*) FROM bids WHERE rfq_id = :rfq_id"),
            {"rfq_id": str(rfq_id)},
        )
        return result.scalar_one()
