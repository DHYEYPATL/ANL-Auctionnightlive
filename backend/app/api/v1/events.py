"""
Events router — HD-CON-15: cursor uses event_seq (gap-free per-RFQ).
HD-RT-11: separate poll endpoint, not bundled with standings.
"""
import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.errors import not_found
from app.db.models import AuctionEvent, User
from app.db.session import get_db
from app.repositories.rfq_repository import RfqRepository
from app.schemas.event import EventItem, EventsResponse

router = APIRouter()


@router.get("/rfqs/{rfq_id}/events", response_model=EventsResponse)
async def get_events(
    rfq_id: uuid.UUID,
    after_seq: int | None = None,  # HD-CON-15: use event_seq cursor
    after_id: int | None = None,   # legacy fallback
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
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
    cursor = after_seq or after_id

    q = select(AuctionEvent).where(AuctionEvent.rfq_id == rfq_id)
    if cursor:
        # Prefer event_seq if available, fall back to id
        q = q.where(
            (AuctionEvent.event_seq > cursor) |
            ((AuctionEvent.event_seq == None) & (AuctionEvent.id > cursor))
        )
    q = q.order_by(AuctionEvent.id.asc()).limit(limit)
    result = await db.execute(q)
    events = result.scalars().all()

    # HD-SEC-04: supplier events don't reveal competitor supplier_id
    items = []
    for e in events:
        details = dict(e.details)
        if user.role == "SUPPLIER" and "supplier_id" in details:
            del details["supplier_id"]
        items.append(EventItem(
            id=e.id,
            rfq_id=e.rfq_id,
            event_type=e.event_type,
            occurred_at=e.occurred_at,
            details=details,
            bid_id=e.bid_id,
        ))

    next_cursor = items[-1].id if len(items) == limit else None

    if response:
        response.headers["Cache-Control"] = "no-store"

    return EventsResponse(events=items, next_cursor=next_cursor)
