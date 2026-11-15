"""HD-LIFE-07/08/09/10: lifecycle and extension rule tests."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest

# ── Extension math HD-LIFE-07 ────────────────────────────────────────────────

def ext_new_close(current, y, forced):
    from datetime import timedelta
    return min(current + timedelta(minutes=y), forced)

NOW = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
FORCED = NOW + timedelta(hours=2)


def test_extension_advances_close():
    current = NOW + timedelta(hours=1)
    new = ext_new_close(current, 10, FORCED)
    assert new == current + timedelta(minutes=10)


def test_extension_capped():
    current = FORCED - timedelta(minutes=5)
    new = ext_new_close(current, 15, FORCED)
    assert new == FORCED


def test_extension_at_forced_no_change():
    new = ext_new_close(FORCED, 5, FORCED)
    assert new == FORCED


# ── Window boundary HD-LIFE-09 ────────────────────────────────────────────────

def inside_window(now, close, x):
    return (close - timedelta(minutes=x)) <= now < close

def test_window_inclusive_start():
    close = NOW + timedelta(hours=1)
    assert inside_window(close - timedelta(minutes=10), close, 10)

def test_window_exclusive_end():
    close = NOW + timedelta(hours=1)
    assert not inside_window(close, close, 10)

def test_outside_window_before():
    close = NOW + timedelta(hours=1)
    assert not inside_window(close - timedelta(minutes=11), close, 10)


# ── Trigger evaluation edge cases HD-LIFE-08 ─────────────────────────────────

from app.services.bid_service import _evaluate_triggers
from app.services.ranking_service import StandingEntry

S1 = uuid.uuid4()
S2 = uuid.uuid4()
S3 = uuid.uuid4()

def _e(sid, total, rank, seq=1):
    return StandingEntry(
        supplier_id=sid, bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)), freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"), destination_charge=Decimal("0"),
        transit_time_days=1, valid_until=None,
        accepted_at=NOW, rank_number=rank, bid_seq=seq,
    )

def test_one_supplier_first_bid_l1_change():
    before, after = [], [_e(S1, 1000, 1)]
    matched = _evaluate_triggers(["L1_CHANGE"], before, after, S1)
    assert "L1_CHANGE" in matched

def test_one_supplier_first_bid_rank_change():
    before, after = [], [_e(S1, 1000, 1)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S1)
    assert "ANY_RANK_CHANGE" in matched

def test_two_suppliers_no_l1_change():
    # S1 is L1 and lowers own price — no L1 change
    before = [_e(S1, 1000, 1), _e(S2, 1200, 2)]
    after = [_e(S1, 900, 1), _e(S2, 1200, 2)]
    matched = _evaluate_triggers(["L1_CHANGE"], before, after, S1)
    assert "L1_CHANGE" not in matched

def test_three_suppliers_tie_broken():
    before = [_e(S1, 1000, 1, 1), _e(S2, 1000, 2, 2), _e(S3, 1200, 3)]
    # S3 bids lower to become L2 — changes rank of everyone
    after = [_e(S1, 1000, 1, 1), _e(S3, 999, 2, 3), _e(S2, 1000, 3, 2)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE", "L1_CHANGE"], before, after, S3)
    assert "ANY_RANK_CHANGE" in matched
    assert "L1_CHANGE" not in matched  # S1 still L1
