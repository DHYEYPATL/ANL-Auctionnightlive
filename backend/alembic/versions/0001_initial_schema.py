"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-15

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.create_table(
        "suppliers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("legal_name", sa.String(250), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.UniqueConstraint("email", name="users_email_unique"),
        sa.CheckConstraint("role IN ('BUYER','SUPPLIER')", name="users_role_check"),
    )

    op.create_table(
        "rfqs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("buyer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(250), nullable=False),
        sa.Column("reference_id", sa.String(100), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("service_date", sa.Date, nullable=False),
        sa.Column("start_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("scheduled_close_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("current_close_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("forced_close_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'DRAFT'")),
        sa.Column("published_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.CheckConstraint("start_at < scheduled_close_at", name="rfqs_start_before_close"),
        sa.CheckConstraint("scheduled_close_at < forced_close_at", name="rfqs_close_before_forced"),
        sa.CheckConstraint("current_close_at <= forced_close_at", name="rfqs_current_lte_forced"),
        sa.CheckConstraint("status IN ('DRAFT','SCHEDULED','ACTIVE','CLOSED','FORCE_CLOSED','CANCELLED')", name="rfqs_status_check"),
        sa.UniqueConstraint("buyer_id", "reference_id", name="rfqs_buyer_ref_unique"),
    )

    op.create_table(
        "auction_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id"), nullable=False, unique=True),
        sa.Column("trigger_window_minutes", sa.SmallInteger, nullable=False),
        sa.Column("extension_duration_minutes", sa.SmallInteger, nullable=False),
        sa.Column("triggers", postgresql.ARRAY(sa.Text), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.CheckConstraint("trigger_window_minutes > 0", name="config_trigger_window_positive"),
        sa.CheckConstraint("extension_duration_minutes > 0", name="config_extension_positive"),
    )

    op.create_table(
        "rfq_suppliers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id"), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("invitation_status", sa.String(20), nullable=False, server_default=sa.text("'ACTIVE'")),
        sa.Column("invited_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.UniqueConstraint("rfq_id", "supplier_id", name="rfq_suppliers_unique"),
        sa.CheckConstraint("invitation_status IN ('ACTIVE','DECLINED','REVOKED')", name="rfq_suppliers_status_check"),
    )

    op.create_table(
        "bids",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id"), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("freight_charge", sa.Numeric(14, 2), nullable=False),
        sa.Column("origin_charge", sa.Numeric(14, 2), nullable=False),
        sa.Column("destination_charge", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("transit_time_days", sa.Integer, nullable=False),
        sa.Column("valid_until", sa.Date, nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("accepted_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.UniqueConstraint("rfq_id", "supplier_id", "idempotency_key", name="bids_idempotency_unique"),
        sa.CheckConstraint("freight_charge >= 0", name="bids_freight_nn"),
        sa.CheckConstraint("origin_charge >= 0", name="bids_origin_nn"),
        sa.CheckConstraint("destination_charge >= 0", name="bids_destination_nn"),
        sa.CheckConstraint("transit_time_days >= 0", name="bids_transit_nn"),
    )

    op.create_table(
        "auction_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id"), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("bid_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bids.id"), nullable=True),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("occurred_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.Column("details", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'")),
    )

    # Indexes
    op.create_index("ix_rfqs_buyer_status", "rfqs", ["buyer_id", "status", sa.text("created_at DESC")])
    op.create_index("ix_rfqs_status_close", "rfqs", ["status", "current_close_at"])
    op.create_index("ix_rfq_suppliers_supplier", "rfq_suppliers", ["supplier_id", "invitation_status", "rfq_id"])
    op.create_index("ix_bids_rfq_supplier_time", "bids", ["rfq_id", "supplier_id", sa.text("accepted_at DESC")])
    op.create_index("ix_bids_rfq_total_time", "bids", ["rfq_id", "total_amount", "accepted_at"])
    op.create_index("ix_events_rfq_id", "auction_events", ["rfq_id", sa.text("id DESC")])


def downgrade() -> None:
    op.drop_table("auction_events")
    op.drop_table("bids")
    op.drop_table("rfq_suppliers")
    op.drop_table("auction_configs")
    op.drop_table("rfqs")
    op.drop_table("users")
    op.drop_table("suppliers")
