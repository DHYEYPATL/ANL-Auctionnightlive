"""bid_seq index for fast ranking and event_seq index

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-15
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fast bid_seq ordering for ranking query (CHG-1, HD-RT-06)
    op.create_index("ix_bids_rfq_seq", "bids", ["rfq_id", "bid_seq"])
    # Fast event_seq cursor for activity feed (HD-CON-15)
    op.create_index("ix_events_rfq_seq", "auction_events", ["rfq_id", "event_seq"])
    # Partial index for active auctions — fast worker pickup (HD-LIFE-02)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_rfqs_active_close
        ON rfqs (LEAST(current_close_at, forced_close_at))
        WHERE status IN ('SCHEDULED', 'ACTIVE')
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_rfqs_active_close")
    op.drop_index("ix_events_rfq_seq")
    op.drop_index("ix_bids_rfq_seq")
