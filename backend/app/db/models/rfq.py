import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

RFQ_STATES = ("DRAFT", "SCHEDULED", "ACTIVE", "CLOSED", "FORCE_CLOSED", "CANCELLED")


class Rfq(Base):
    __tablename__ = "rfqs"
    __table_args__ = (
        CheckConstraint("start_at < scheduled_close_at", name="rfqs_start_before_close"),
        CheckConstraint("scheduled_close_at < forced_close_at", name="rfqs_close_before_forced"),
        CheckConstraint("current_close_at <= forced_close_at", name="rfqs_current_lte_forced"),
        UniqueConstraint("buyer_id", "reference_id", name="rfqs_buyer_ref_unique"),
        CheckConstraint(
            "status IN ('DRAFT','SCHEDULED','ACTIVE','CLOSED','FORCE_CLOSED','CANCELLED')",
            name="rfqs_status_check",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    buyer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(250), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(100), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_at: Mapped[datetime] = mapped_column(nullable=False)
    scheduled_close_at: Mapped[datetime] = mapped_column(nullable=False)
    current_close_at: Mapped[datetime] = mapped_column(nullable=False)
    forced_close_at: Mapped[datetime] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'DRAFT'"))
    published_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("clock_timestamp()"))
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("clock_timestamp()"))
