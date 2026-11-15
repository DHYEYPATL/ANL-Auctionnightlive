import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.errors import not_found
from app.db.models import AuctionEvent, User
from app.db.session import get_db
from app.repositories.event_repository import EventRepository
from app.repositories.rfq_repository import RfqRepository
from app.schemas.event import EventItem, EventsResponse

router = APIRouter()


@router.get("/rfqs/{rfq_id}/events", response_model=EventsResponse)
async def get_events(
    rfq_id: uuid.UUID,
    after_id: int | None = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventsResponse:
    repo = RfqRepository(db)
    rfq = await repo.get_by_id(rfq_id)
    if not rfq:
        raise not_found()

    if user.role == "BUYER" and rfq.buyer_id != user.id:
        raise not_found()
    if user.role == "SUPPLIER":
        if not user.supplier_id:
            raise not_found()
        if not await repo.is_active_invitee(rfq_id, user.supplier_id):
            raise not_found()

    limit = min(limit, 100)
    evt_repo = EventRepository(db)
    events = await evt_repo.list_for_rfq(rfq_id, after_id, limit)

    items = [
        EventItem(
            id=e.id,
            rfq_id=e.rfq_id,
            event_type=e.event_type,
            occurred_at=e.occurred_at,
            details=e.details,
            bid_id=e.bid_id,
        )
        for e in events
    ]
    next_cursor = items[-1].id if len(items) == limit else None
    return EventsResponse(events=items, next_cursor=next_cursor)
