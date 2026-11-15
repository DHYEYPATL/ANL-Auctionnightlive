import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal

from app.db.base import Base


class RfqSupplier(Base):
    __tablename__ = "rfq_suppliers"
    __table_args__ = (
        UniqueConstraint("rfq_id", "supplier_id", name="rfq_suppliers_unique"),
        UniqueConstraint("rfq_id", "anon_label", name="rfq_suppliers_anon_label_unique"),
        CheckConstraint(
            "invitation_status IN ('ACTIVE','DECLINED','REVOKED')",
            name="rfq_suppliers_status_check",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    rfq_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rfqs.id"), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    invitation_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'ACTIVE'"))
    anon_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Denormalized current bid (HD-RT-06)
    current_bid_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bids.id"), nullable=True)
    current_total: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    current_bid_seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    invited_at: Mapped[datetime] = mapped_column(nullable=False, server_default=text("clock_timestamp()"))
