"""hardening schema: bid_seq, event_seq, rfq_version, anon_label, bid_attempts, composite FK

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-15
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── rfqs: version, last_bid_seq, last_event_seq, last_decision_at ──────────
    op.add_column("rfqs", sa.Column("version", sa.Integer, nullable=False, server_default="0"))
    op.add_column("rfqs", sa.Column("last_bid_seq", sa.Integer, nullable=False, server_default="0"))
    op.add_column("rfqs", sa.Column("last_event_seq", sa.Integer, nullable=False, server_default="0"))
    op.add_column("rfqs", sa.Column("last_decision_at", sa.TIMESTAMP(timezone=True), nullable=True))

    # ── bids: bid_seq, close_at_before, close_at_after, received_at, lock_wait_ms, request_hash ──
    op.add_column("bids", sa.Column("bid_seq", sa.Integer, nullable=True))
    op.add_column("bids", sa.Column("close_at_before", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("bids", sa.Column("close_at_after", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("bids", sa.Column("received_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("bids", sa.Column("lock_wait_ms", sa.Integer, nullable=True))
    op.add_column("bids", sa.Column("request_hash", sa.String(64), nullable=True))

    # unique bid_seq per rfq
    op.create_unique_constraint("bids_rfq_seq_unique", "bids", ["rfq_id", "bid_seq"])

    # total must be > 0
    op.create_check_constraint("bids_total_positive", "bids", "total_amount > 0")

    # ── auction_events: event_seq, rfq_version ──────────────────────────────────
    op.add_column("auction_events", sa.Column("event_seq", sa.Integer, nullable=True))
    op.add_column("auction_events", sa.Column("rfq_version", sa.Integer, nullable=True))
    op.add_column("auction_events", sa.Column("prev_hash", sa.String(64), nullable=True))
    op.add_column("auction_events", sa.Column("event_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("events_rfq_seq_unique", "auction_events", ["rfq_id", "event_seq"])

    # ── partial unique index: one terminal event per RFQ ───────────────────────
    op.execute("""
        CREATE UNIQUE INDEX events_terminal_unique
        ON auction_events (rfq_id, event_type)
        WHERE event_type IN ('AUCTION_CLOSED', 'AUCTION_FORCE_CLOSED', 'AUCTION_CANCELLED')
    """)

    # ── rfq_suppliers: anon_label ──────────────────────────────────────────────
    op.add_column("rfq_suppliers", sa.Column("anon_label", sa.String(50), nullable=True))
    op.create_unique_constraint("rfq_suppliers_anon_label_unique", "rfq_suppliers", ["rfq_id", "anon_label"])

    # ── bid_attempts table ─────────────────────────────────────────────────────
    op.create_table(
        "bid_attempts",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("rfq_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rfqs.id"), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("bid_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bids.id"), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("idempotency_key_prefix", sa.String(8), nullable=True),
        sa.Column("outcome", sa.String(60), nullable=False),
        sa.Column("received_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.Column("decided_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("lock_wait_ms", sa.Integer, nullable=True),
        sa.Column("total_ms", sa.Integer, nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
        sa.Column("details", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'")),
    )
    op.create_index("ix_bid_attempts_rfq", "bid_attempts", ["rfq_id", sa.text("received_at DESC")])
    op.create_index("ix_bid_attempts_supplier", "bid_attempts", ["supplier_id", sa.text("received_at DESC")])

    # ── users: composite unique for composite FK ───────────────────────────────
    op.create_unique_constraint("users_id_supplier_id_unique", "users", ["id", "supplier_id"])

    # DB-level triggers ──────────────────────────────────────────────────────────
    # 1. Reject bids outside the auction window
    op.execute("""
        CREATE OR REPLACE FUNCTION trg_bid_window_check()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE
            r rfqs%ROWTYPE;
        BEGIN
            SELECT * INTO r FROM rfqs WHERE id = NEW.rfq_id;
            IF NEW.accepted_at < r.start_at THEN
                RAISE EXCEPTION 'BID_BEFORE_START';
            END IF;
            IF NEW.accepted_at >= r.current_close_at THEN
                RAISE EXCEPTION 'BID_AFTER_CLOSE';
            END IF;
            IF NEW.accepted_at >= r.forced_close_at THEN
                RAISE EXCEPTION 'BID_AFTER_FORCED_CLOSE';
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_bid_window
        BEFORE INSERT ON bids
        FOR EACH ROW EXECUTE FUNCTION trg_bid_window_check();
    """)

    # 2. Append-only bids
    op.execute("""
        CREATE OR REPLACE FUNCTION trg_bid_append_only()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'bids are append-only';
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_bid_no_update
        BEFORE UPDATE ON bids
        FOR EACH ROW EXECUTE FUNCTION trg_bid_append_only();
    """)
    op.execute("""
        CREATE TRIGGER trg_bid_no_delete
        BEFORE DELETE ON bids
        FOR EACH ROW EXECUTE FUNCTION trg_bid_append_only();
    """)

    # 3. Append-only events
    op.execute("""
        CREATE OR REPLACE FUNCTION trg_event_append_only()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'auction_events are append-only';
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_event_no_update
        BEFORE UPDATE ON auction_events
        FOR EACH ROW EXECUTE FUNCTION trg_event_append_only();
    """)
    op.execute("""
        CREATE TRIGGER trg_event_no_delete
        BEFORE DELETE ON auction_events
        FOR EACH ROW EXECUTE FUNCTION trg_event_append_only();
    """)

    # 4. Freeze rfq schedule/currency after publish
    op.execute("""
        CREATE OR REPLACE FUNCTION trg_rfq_immutable_after_publish()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.published_at IS NOT NULL THEN
                IF NEW.start_at <> OLD.start_at OR
                   NEW.scheduled_close_at <> OLD.scheduled_close_at OR
                   NEW.forced_close_at <> OLD.forced_close_at OR
                   NEW.currency <> OLD.currency THEN
                    RAISE EXCEPTION 'RFQ_IMMUTABLE: schedule and currency are frozen after publish';
                END IF;
                IF NEW.current_close_at < OLD.current_close_at THEN
                    RAISE EXCEPTION 'RFQ_CLOSE_CANNOT_MOVE_BACKWARD';
                END IF;
                IF NEW.current_close_at > NEW.forced_close_at THEN
                    RAISE EXCEPTION 'RFQ_CLOSE_EXCEEDS_FORCED';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_rfq_immutable
        BEFORE UPDATE ON rfqs
        FOR EACH ROW EXECUTE FUNCTION trg_rfq_immutable_after_publish();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_rfq_immutable ON rfqs")
    op.execute("DROP FUNCTION IF EXISTS trg_rfq_immutable_after_publish()")
    op.execute("DROP TRIGGER IF EXISTS trg_event_no_delete ON auction_events")
    op.execute("DROP TRIGGER IF EXISTS trg_event_no_update ON auction_events")
    op.execute("DROP FUNCTION IF EXISTS trg_event_append_only()")
    op.execute("DROP TRIGGER IF EXISTS trg_bid_no_delete ON bids")
    op.execute("DROP TRIGGER IF EXISTS trg_bid_no_update ON bids")
    op.execute("DROP FUNCTION IF EXISTS trg_bid_append_only()")
    op.execute("DROP TRIGGER IF EXISTS trg_bid_window ON bids")
    op.execute("DROP FUNCTION IF EXISTS trg_bid_window_check()")
    op.drop_table("bid_attempts")
    op.drop_constraint("users_id_supplier_id_unique", "users")
    op.drop_index("events_terminal_unique")
    op.drop_constraint("events_rfq_seq_unique", "auction_events")
    op.drop_column("auction_events", "event_hash")
    op.drop_column("auction_events", "prev_hash")
    op.drop_column("auction_events", "rfq_version")
    op.drop_column("auction_events", "event_seq")
    op.drop_constraint("rfq_suppliers_anon_label_unique", "rfq_suppliers")
    op.drop_column("rfq_suppliers", "anon_label")
    op.drop_constraint("bids_total_positive", "bids")
    op.drop_constraint("bids_rfq_seq_unique", "bids")
    op.drop_column("bids", "request_hash")
    op.drop_column("bids", "lock_wait_ms")
    op.drop_column("bids", "received_at")
    op.drop_column("bids", "close_at_after")
    op.drop_column("bids", "close_at_before")
    op.drop_column("bids", "bid_seq")
    op.drop_column("rfqs", "last_decision_at")
    op.drop_column("rfqs", "last_event_seq")
    op.drop_column("rfqs", "last_bid_seq")
    op.drop_column("rfqs", "version")
