"""HD-LIFE-01: effective_status pure function covers all SRS §5.3 transitions."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.services.auction_service import evaluate_state

NOW = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)


def rfq(status, start_offset, close_offset, forced_offset, published=True):
    r = MagicMock()
    r.status = status
    r.start_at = NOW + timedelta(minutes=start_offset)
    r.current_close_at = NOW + timedelta(minutes=close_offset)
    r.forced_close_at = NOW + timedelta(minutes=forced_offset)
    r.published_at = NOW - timedelta(hours=1) if published else None
    return r


@pytest.mark.parametrize("status", ["DRAFT", "CANCELLED"])
def test_terminal_statuses_unchanged(status):
    r = rfq(status, -60, 60, 120)
    assert evaluate_state(r, NOW) == status


def test_active_state():
    assert evaluate_state(rfq("ACTIVE", -30, 60, 120), NOW) == "ACTIVE"


def test_scheduled_state():
    assert evaluate_state(rfq("SCHEDULED", 30, 90, 120), NOW) == "SCHEDULED"


def test_closed_when_current_close_passed():
    assert evaluate_state(rfq("ACTIVE", -120, -1, 60), NOW) == "CLOSED"


def test_force_closed_before_normal_close():
    # forced_close has passed, so FORCE_CLOSED wins
    assert evaluate_state(rfq("ACTIVE", -120, 30, -1), NOW) == "FORCE_CLOSED"


def test_both_closes_passed_force_wins():
    assert evaluate_state(rfq("ACTIVE", -120, -60, -30), NOW) == "FORCE_CLOSED"


def test_exact_forced_close_boundary():
    r = rfq("ACTIVE", -60, 60, 0)  # forced_close_at == NOW
    assert evaluate_state(r, NOW) == "FORCE_CLOSED"


def test_exact_current_close_boundary():
    r = rfq("ACTIVE", -60, 0, 60)  # current_close_at == NOW
    assert evaluate_state(r, NOW) == "CLOSED"


def test_one_second_before_close_active():
    r = rfq("ACTIVE", -60, 0, 60)
    assert evaluate_state(r, NOW - timedelta(seconds=1)) == "ACTIVE"
