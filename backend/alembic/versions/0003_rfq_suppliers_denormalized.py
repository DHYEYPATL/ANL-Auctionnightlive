"""rfq_suppliers denormalized current bid columns for HD-RT-06

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-15
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("rfq_suppliers", sa.Column(
        "current_bid_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("bids.id"), nullable=True
    ))
    op.add_column("rfq_suppliers", sa.Column(
        "current_total", sa.Numeric(14, 2), nullable=True
    ))
    op.add_column("rfq_suppliers", sa.Column(
        "current_bid_seq", sa.Integer, nullable=True
    ))
    op.create_index(
        "ix_rfq_suppliers_standings",
        "rfq_suppliers",
        ["rfq_id", "current_total", "current_bid_seq", "supplier_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_rfq_suppliers_standings")
    op.drop_column("rfq_suppliers", "current_bid_seq")
    op.drop_column("rfq_suppliers", "current_total")
    op.drop_column("rfq_suppliers", "current_bid_id")
