import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuctionEvent(Base):
    __tablename__ = "auction_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    rfq_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rfqs.id"), nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    bid_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bids.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("clock_timestamp()"))
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'"))
