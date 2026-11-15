import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuctionEvent


class EventRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def append(self, event: AuctionEvent) -> AuctionEvent:
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_for_rfq(
        self, rfq_id: uuid.UUID, after_id: int | None, limit: int
    ) -> list[AuctionEvent]:
        q = select(AuctionEvent).where(AuctionEvent.rfq_id == rfq_id)
        if after_id:
            q = q.where(AuctionEvent.id > after_id)
        q = q.order_by(AuctionEvent.id.asc()).limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def count_by_type(self, rfq_id: uuid.UUID, event_type: str) -> int:
        from sqlalchemy import func, select as sel
        result = await self.db.execute(
            sel(func.count()).select_from(AuctionEvent).where(
                AuctionEvent.rfq_id == rfq_id,
                AuctionEvent.event_type == event_type,
            )
        )
        return result.scalar_one()

    async def has_terminal_event(self, rfq_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(AuctionEvent).where(
                AuctionEvent.rfq_id == rfq_id,
                AuctionEvent.event_type.in_(["AUCTION_CLOSED", "AUCTION_FORCE_CLOSED"]),
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None
