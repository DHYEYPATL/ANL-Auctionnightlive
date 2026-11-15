import uuid
from datetime import datetime

from pydantic import BaseModel


class EventItem(BaseModel):
    id: int
    rfq_id: uuid.UUID
    event_type: str
    occurred_at: datetime
    details: dict
    actor_display_name: str | None = None
    bid_id: uuid.UUID | None = None


class EventsResponse(BaseModel):
    events: list[EventItem]
    next_cursor: int | None = None
