import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (
        UniqueConstraint("rfq_id", "supplier_id", "idempotency_key", name="bids_idempotency_unique"),
        CheckConstraint("freight_charge >= 0", name="bids_freight_nn"),
        CheckConstraint("origin_charge >= 0", name="bids_origin_nn"),
        CheckConstraint("destination_charge >= 0", name="bids_destination_nn"),
        CheckConstraint("transit_time_days >= 0", name="bids_transit_nn"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    rfq_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rfqs.id"), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    freight_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    origin_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    destination_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # total_amount is computed at application level (not GENERATED ALWAYS due to asyncpg limitations)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    transit_time_days: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("clock_timestamp()"))
