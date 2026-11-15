from datetime import datetime

from app.db.models import Rfq


def evaluate_state(rfq: Rfq, now: datetime) -> str:
    """Pure function: derive current auction state from timestamps. Forced close wins."""
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
