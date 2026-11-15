"""Pure-logic tests for bid service helpers — no DB needed."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.bid_service import _evaluate_triggers, _l1_id, _rank_map
from app.services.ranking_service import StandingEntry

T = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
S = [uuid.uuid4() for _ in range(6)]


def _e(idx, total, rank, seq=1):
    return StandingEntry(
        supplier_id=S[idx], bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)), freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"), destination_charge=Decimal("0"),
        transit_time_days=1, valid_until=None,
        accepted_at=T, rank_number=rank, bid_seq=seq,
    )


# _rank_map
def test_rank_map_empty():
    assert _rank_map([]) == {}


def test_rank_map_single():
    e = _e(0, 1000, 1)
    m = _rank_map([e])
    assert m[S[0]] == 1


def test_rank_map_multiple():
    entries = [_e(0, 500, 1), _e(1, 700, 2), _e(2, 900, 3)]
    m = _rank_map(entries)
    assert m[S[0]] == 1
    assert m[S[1]] == 2
    assert m[S[2]] == 3


# _l1_id
def test_l1_id_empty():
    assert _l1_id([]) is None


def test_l1_id_single():
    assert _l1_id([_e(0, 1000, 1)]) == S[0]


def test_l1_id_multiple():
    entries = [_e(2, 500, 1), _e(0, 700, 2)]
    assert _l1_id(entries) == S[2]


# _evaluate_triggers edge matrix
@pytest.mark.parametrize("triggers,before_desc,after_desc,expected_has,expected_not", [
    # BID_RECEIVED always fires when configured
    (["BID_RECEIVED"], [(0, 1000, 1)], [(0, 900, 1)], ["BID_RECEIVED"], []),
    # ANY_RANK_CHANGE: same ranks — no change
    (["ANY_RANK_CHANGE"], [(0, 1000, 1), (1, 1200, 2)], [(0, 900, 1), (1, 1200, 2)], [], ["ANY_RANK_CHANGE"]),
    # ANY_RANK_CHANGE: supplier enters fresh
    (["ANY_RANK_CHANGE"], [], [(0, 1000, 1)], ["ANY_RANK_CHANGE"], []),
    # L1_CHANGE: none → first
    (["L1_CHANGE"], [], [(0, 1000, 1)], ["L1_CHANGE"], []),
    # L1_CHANGE: same L1 lowers
    (["L1_CHANGE"], [(0, 1000, 1)], [(0, 900, 1)], [], ["L1_CHANGE"]),
    # L1_CHANGE: different supplier becomes L1
    (["L1_CHANGE"], [(0, 1000, 1), (1, 1200, 2)], [(1, 800, 1), (0, 1000, 2)], ["L1_CHANGE"], []),
    # No triggers configured
    ([], [(0, 1000, 1)], [(0, 900, 1)], [], ["BID_RECEIVED", "L1_CHANGE", "ANY_RANK_CHANGE"]),
    # All three triggers, all matching
    (["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"], [], [(0, 1000, 1)],
     ["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"], []),
])
def test_evaluate_triggers_matrix(triggers, before_desc, after_desc, expected_has, expected_not):
    before = [_e(i, t, r) for i, t, r in before_desc]
    after = [_e(i, t, r) for i, t, r in after_desc]
    supplier_id = S[after_desc[0][0]] if after_desc else S[0]
    matched = _evaluate_triggers(triggers, before, after, supplier_id)
    for t in expected_has:
        assert t in matched, f"Expected {t} in {matched}"
    for t in expected_not:
        assert t not in matched, f"Did not expect {t} in {matched}"
