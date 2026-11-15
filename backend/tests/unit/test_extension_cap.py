"""Extension cap logic: new_close never exceeds forced_close."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest


def compute_new_close(current_close, y_minutes, forced_close):
    """Replicates the cap logic from bid_service."""
    proposed = current_close + timedelta(minutes=y_minutes)
    return min(proposed, forced_close)


FORCED = datetime(2026, 11, 16, 14, 0, 0, tzinfo=timezone.utc)


def test_extension_within_cap():
    current = datetime(2026, 11, 16, 13, 50, 0, tzinfo=timezone.utc)
    new = compute_new_close(current, 5, FORCED)
    assert new == datetime(2026, 11, 16, 13, 55, 0, tzinfo=timezone.utc)
    assert new <= FORCED


def test_extension_capped_at_forced():
    current = datetime(2026, 11, 16, 13, 55, 0, tzinfo=timezone.utc)
    new = compute_new_close(current, 10, FORCED)
    assert new == FORCED


def test_already_at_forced_no_extension():
    current = FORCED
    new = compute_new_close(current, 5, FORCED)
    assert new == FORCED
    # no extension should be applied (new == current)
    assert new <= current or new == current


def test_extension_never_exceeds_forced():
    for y in [1, 5, 10, 60, 1440]:
        current = FORCED - timedelta(minutes=1)
        new = compute_new_close(current, y, FORCED)
        assert new <= FORCED, f"y={y}: new_close {new} > forced {FORCED}"
