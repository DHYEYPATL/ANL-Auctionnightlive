"""Unit tests for auction state evaluation."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.services.auction_service import evaluate_state


def make_rfq(status, start_offset, close_offset, forced_offset, published=True):
    now = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)
    rfq = MagicMock()
    rfq.status = status
    rfq.start_at = now + timedelta(minutes=start_offset)
    rfq.current_close_at = now + timedelta(minutes=close_offset)
    rfq.forced_close_at = now + timedelta(minutes=forced_offset)
    rfq.published_at = now - timedelta(hours=1) if published else None
    return rfq, now


def test_draft_unchanged():
    rfq, now = make_rfq("DRAFT", -60, 60, 120)
    assert evaluate_state(rfq, now) == "DRAFT"


def test_cancelled_unchanged():
    rfq, now = make_rfq("CANCELLED", -60, 60, 120)
    assert evaluate_state(rfq, now) == "CANCELLED"


def test_active_before_close():
    rfq, now = make_rfq("ACTIVE", -30, 60, 120)
    assert evaluate_state(rfq, now) == "ACTIVE"


def test_closed_when_current_close_passed():
    rfq, now = make_rfq("ACTIVE", -60, -1, 60)
    assert evaluate_state(rfq, now) == "CLOSED"


def test_force_closed_takes_precedence():
    # current_close_at also passed, but forced_close also passed → FORCE_CLOSED
    rfq, now = make_rfq("ACTIVE", -120, -60, -30)
    assert evaluate_state(rfq, now) == "FORCE_CLOSED"


def test_scheduled_before_start():
    rfq, now = make_rfq("SCHEDULED", 30, 90, 120)
    assert evaluate_state(rfq, now) == "SCHEDULED"


def test_forced_wins_over_normal_close():
    """Forced close must be evaluated before current close."""
    rfq, now = make_rfq("ACTIVE", -120, -5, -1)
    state = evaluate_state(rfq, now)
    assert state == "FORCE_CLOSED"
