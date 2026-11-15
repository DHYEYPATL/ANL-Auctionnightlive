"""Full SRS §5.3 state machine — all 6 states, all transitions."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
import pytest

from app.services.auction_service import evaluate_state

T = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)


def _r(status, start_off, close_off, forced_off, pub=True):
    r = MagicMock()
    r.status = status
    r.start_at = T + timedelta(minutes=start_off)
    r.current_close_at = T + timedelta(minutes=close_off)
    r.forced_close_at = T + timedelta(minutes=forced_off)
    r.published_at = T - timedelta(hours=1) if pub else None
    return r


@pytest.mark.parametrize("status,start_off,close_off,forced_off,pub,expected", [
    # DRAFT always stays DRAFT
    ("DRAFT", -60, 60, 120, False, "DRAFT"),
    ("DRAFT", -60, 60, 120, True, "DRAFT"),
    # CANCELLED always stays CANCELLED
    ("CANCELLED", -60, 60, 120, True, "CANCELLED"),
    # Published, start in future → SCHEDULED
    ("SCHEDULED", 30, 90, 150, True, "SCHEDULED"),
    # Published, in window → ACTIVE
    ("ACTIVE", -30, 60, 120, True, "ACTIVE"),
    # Normal close passed → CLOSED
    ("ACTIVE", -60, -1, 60, True, "CLOSED"),
    # Forced close passed → FORCE_CLOSED
    ("ACTIVE", -60, 30, -1, True, "FORCE_CLOSED"),
    # Both closes passed → FORCE_CLOSED wins
    ("ACTIVE", -120, -60, -30, True, "FORCE_CLOSED"),
    # Exactly at start → ACTIVE
    ("SCHEDULED", 0, 60, 120, True, "ACTIVE"),
    # Exactly at current_close → CLOSED
    ("ACTIVE", -60, 0, 60, True, "CLOSED"),
    # Exactly at forced_close → FORCE_CLOSED
    ("ACTIVE", -60, 60, 0, True, "FORCE_CLOSED"),
])
def test_state_matrix(status, start_off, close_off, forced_off, pub, expected):
    rfq = _r(status, start_off, close_off, forced_off, pub)
    assert evaluate_state(rfq, T) == expected
