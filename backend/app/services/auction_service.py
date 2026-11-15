"""
Auction state service — HD-LIFE-01: single pure function for all state derivation.
HD-LIFE-06: persisted status may lag; derived status is what the API returns.
"""
from datetime import datetime

from app.db.models import Rfq


def evaluate_state(rfq: Rfq, now: datetime) -> str:
    """
    Derive effective auction state from timestamps.
    This is the ONLY place state is derived — SRS §5.3 order exactly.
    1. DRAFT and CANCELLED are sticky.
    2. forced_close_at check runs BEFORE current_close_at.
    3. start_at determines ACTIVE vs SCHEDULED.
    """
    if rfq.status in ("DRAFT", "CANCELLED"):
        return rfq.status
    if now >= rfq.forced_close_at:
        return "FORCE_CLOSED"
    if now >= rfq.current_close_at:
        return "CLOSED"
    if rfq.published_at and now >= rfq.start_at:
        return "ACTIVE"
    if rfq.published_at:
        return "SCHEDULED"
    return rfq.status


def effective_status_sql() -> str:
    """
    SQL CASE expression for HD-LIFE-01 — used in listing queries.
    Prevents stale persisted status from being shown.
    """
    return """
        CASE
          WHEN status IN ('DRAFT', 'CANCELLED') THEN status
          WHEN clock_timestamp() >= forced_close_at THEN 'FORCE_CLOSED'
          WHEN clock_timestamp() >= current_close_at THEN 'CLOSED'
          WHEN clock_timestamp() >= start_at AND published_at IS NOT NULL THEN 'ACTIVE'
          WHEN published_at IS NOT NULL THEN 'SCHEDULED'
          ELSE status
        END
    """
