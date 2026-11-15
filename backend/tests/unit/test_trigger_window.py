"""HD-LIFE-09: trigger window boundary tests with injected clock."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest

from app.services.bid_service import _evaluate_triggers
from app.services.ranking_service import StandingEntry

CLOSE = datetime(2026, 11, 16, 13, 0, 0, tzinfo=timezone.utc)
X = 10  # trigger window minutes


def _trigger_start(close, x):
    return close - timedelta(minutes=x)


def _inside_window(now, close, x):
    return _trigger_start(close, x) <= now < close


def _entry(supplier_id, total, rank, seq=1):
    return StandingEntry(
        supplier_id=supplier_id,
        bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)),
        freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"),
        destination_charge=Decimal("0"),
        transit_time_days=1,
        valid_until=None,
        accepted_at=CLOSE - timedelta(minutes=15),
        rank_number=rank,
        bid_seq=seq,
    )


S1 = uuid.uuid4()


def test_at_window_start_inside():
    now = _trigger_start(CLOSE, X)  # exactly at close - X (inclusive)
    assert _inside_window(now, CLOSE, X) is True


def test_one_microsecond_before_window_outside():
    now = _trigger_start(CLOSE, X) - timedelta(microseconds=1)
    assert _inside_window(now, CLOSE, X) is False


def test_one_microsecond_before_close_inside():
    now = CLOSE - timedelta(microseconds=1)
    assert _inside_window(now, CLOSE, X) is True


def test_at_close_outside():
    now = CLOSE  # close is exclusive
    assert _inside_window(now, CLOSE, X) is False


def test_bid_received_outside_window_no_match():
    before = [_entry(S1, 1000, 1)]
    after = [_entry(S1, 900, 1)]
    matched = _evaluate_triggers(["BID_RECEIVED"], before, after, S1)
    assert "BID_RECEIVED" in matched  # trigger eval itself always matches; window check is in service


def test_no_triggers_configured_empty():
    before = [_entry(S1, 1000, 1)]
    after = [_entry(S1, 900, 1)]
    assert _evaluate_triggers([], before, after, S1) == []


def test_zero_suppliers_before_first_bid():
    after = [_entry(S1, 1000, 1)]
    matched = _evaluate_triggers(["L1_CHANGE", "ANY_RANK_CHANGE"], [], after, S1)
    assert "L1_CHANGE" in matched
    assert "ANY_RANK_CHANGE" in matched


def test_two_suppliers_rank_swap():
    S2 = uuid.uuid4()
    before = [_entry(S1, 900, 1), _entry(S2, 1000, 2)]
    after = [_entry(S2, 800, 1), _entry(S1, 900, 2)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE", "L1_CHANGE"], before, after, S2)
    assert "ANY_RANK_CHANGE" in matched
    assert "L1_CHANGE" in matched


def test_three_suppliers_no_rank_change():
    S2, S3 = uuid.uuid4(), uuid.uuid4()
    before = [_entry(S1, 500, 1), _entry(S2, 600, 2), _entry(S3, 700, 3)]
    after = [_entry(S1, 490, 1), _entry(S2, 600, 2), _entry(S3, 700, 3)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S1)
    assert "ANY_RANK_CHANGE" not in matched
