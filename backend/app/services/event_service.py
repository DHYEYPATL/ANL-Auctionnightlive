import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuctionEvent
from app.repositories.event_repository import EventRepository


class EventService:
    def __init__(self, db: AsyncSession):
        self.repo = EventRepository(db)

    async def append(
        self,
        rfq_id: uuid.UUID,
        event_type: str,
        actor_user_id: uuid.UUID | None = None,
        bid_id: uuid.UUID | None = None,
        details: dict | None = None,
    ) -> AuctionEvent:
        event = AuctionEvent(
            rfq_id=rfq_id,
            actor_user_id=actor_user_id,
            bid_id=bid_id,
            event_type=event_type,
            details=details or {},
        )
        return await self.repo.append(event)
