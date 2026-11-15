import uuid
from datetime import datetime

from sqlalchemy import ARRAY, CheckConstraint, ForeignKey, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuctionConfig(Base):
    __tablename__ = "auction_configs"
    __table_args__ = (
        CheckConstraint("trigger_window_minutes > 0", name="config_trigger_window_positive"),
        CheckConstraint("extension_duration_minutes > 0", name="config_extension_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    rfq_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rfqs.id"), nullable=False, unique=True)
    trigger_window_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    extension_duration_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    triggers: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("clock_timestamp()"))
