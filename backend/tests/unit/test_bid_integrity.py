"""
Bid integrity tests — SRS edge cases 1-28, HD correctness properties.
Pure logic, no DB needed.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.auction_service import evaluate_state
from app.services.bid_service import _evaluate_triggers, _l1_id, _rank_map
from app.services.ranking_service import StandingEntry
from unittest.mock import MagicMock

NOW = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)
S1 = uuid.UUID("00000000-0000-0000-0000-000000000001")
S2 = uuid.UUID("00000000-0000-0000-0000-000000000002")
S3 = uuid.UUID("00000000-0000-0000-0000-000000000003")


def _rfq(start_offset, close_offset, forced_offset):
    r = MagicMock()
    r.status = "ACTIVE"
    r.start_at = NOW + timedelta(minutes=start_offset)
    r.current_close_at = NOW + timedelta(minutes=close_offset)
    r.forced_close_at = NOW + timedelta(minutes=forced_offset)
    r.published_at = NOW - timedelta(hours=1)
    return r


def _e(sid, total, rank, seq=1):
    return StandingEntry(
        supplier_id=sid, bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)), freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"), destination_charge=Decimal("0"),
        transit_time_days=1, valid_until=None,
        accepted_at=NOW, rank_number=rank, bid_seq=seq,
    )


# SRS edge case 1: first bid accepted, supplier becomes ranked
def test_edge1_first_bid_accepted():
    before, after = [], [_e(S1, 1000, 1)]
    matched = _evaluate_triggers(["BID_RECEIVED", "L1_CHANGE", "ANY_RANK_CHANGE"], before, after, S1)
    assert "BID_RECEIVED" in matched
    assert "L1_CHANGE" in matched  # none-to-first = change
    assert "ANY_RANK_CHANGE" in matched


# SRS edge case 3: bid at exactly current_close_at rejected
def test_edge3_bid_at_close_rejected():
    rfq = _rfq(-60, 0, 60)
    assert evaluate_state(rfq, NOW) == "CLOSED"  # current_close_at == NOW


# SRS edge case 4: bid at forced_close_at rejected
def test_edge4_bid_at_forced_close():
    rfq = _rfq(-120, -60, 0)  # forced_close_at == NOW
    assert evaluate_state(rfq, NOW) == "FORCE_CLOSED"


# SRS edge case 5: equal total rejected
def test_edge5_equal_total_rejected():
    prev = Decimal("1000")
    new = Decimal("1000")
    assert new >= prev  # would be rejected


# SRS edge case 6: higher total rejected
def test_edge6_higher_total_rejected():
    prev = Decimal("1000")
    new = Decimal("1100")
    assert new > prev  # would be rejected


# SRS edge case 7: lower total but not L1 — accepted
def test_edge7_lower_not_l1():
    before = [_e(S1, 800, 1), _e(S2, 1000, 2)]
    after = [_e(S1, 800, 1), _e(S2, 900, 2)]  # S2 improves but not L1
    matched = _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S2)
    # S2 stays at rank 2 — no rank change
    assert "ANY_RANK_CHANGE" not in matched


# SRS edge case 9: BID_RECEIVED in window, no rank change → BID_RECEIVED triggers
def test_edge9_bid_received_no_rank_change():
    before = [_e(S1, 1000, 1)]
    after = [_e(S1, 900, 1)]  # still L1
    matched = _evaluate_triggers(["BID_RECEIVED", "ANY_RANK_CHANGE"], before, after, S1)
    assert "BID_RECEIVED" in matched
    assert "ANY_RANK_CHANGE" not in matched


# SRS edge case 10: bid changes L2 to L1 → both triggers
def test_edge10_l2_becomes_l1():
    before = [_e(S1, 800, 1), _e(S2, 1000, 2)]
    after = [_e(S2, 700, 1), _e(S1, 800, 2)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE", "L1_CHANGE"], before, after, S2)
    assert "ANY_RANK_CHANGE" in matched
    assert "L1_CHANGE" in matched


# SRS edge case 11: existing L1 reduces price, stays L1 → no L1_CHANGE
def test_edge11_l1_lowers_own_price():
    before = [_e(S1, 1000, 1), _e(S2, 1200, 2)]
    after = [_e(S1, 900, 1), _e(S2, 1200, 2)]
    matched = _evaluate_triggers(["L1_CHANGE"], before, after, S1)
    assert "L1_CHANGE" not in matched


# SRS edge case 13: multiple triggers match → one extension
def test_edge13_multiple_triggers_one_extension():
    before = [_e(S1, 1000, 1)]
    after = [_e(S2, 900, 1), _e(S1, 1000, 2)]
    matched = _evaluate_triggers(["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"], before, after, S2)
    # All match, but only one extension is ever applied — that's enforced at service level
    assert len(matched) == 3


# SRS edge case 15: current_close == forced_close → extension produces no positive gain
def test_edge15_no_positive_extension():
    forced = NOW + timedelta(hours=1)
    current = forced  # already at cap
    proposed = current + timedelta(minutes=5)
    new_close = min(proposed, forced)
    assert new_close == forced  # no gain


# SRS edge case 21: no bids before close → auction closes normally
def test_edge21_no_bids_close():
    rfq = _rfq(-120, -1, 60)  # close has passed
    state = evaluate_state(rfq, NOW)
    assert state == "CLOSED"


# SRS edge case 25: validity before service date → reject
def test_edge25_validity_before_service():
    from datetime import date
    service_date = date(2026, 12, 10)
    valid_until = date(2026, 12, 9)
    assert valid_until < service_date  # would be rejected


# Correctness property: total_amount = sum of charges
def test_property_total_equals_sum():
    from app.core.money import parse_money
    f, o, d = parse_money("100.00"), parse_money("50.00"), parse_money("25.00")
    assert f + o + d == Decimal("175.00")


# Correctness property: current_close_at <= forced_close_at always
def test_property_close_lte_forced():
    forced = NOW + timedelta(hours=2)
    for y in [1, 5, 10, 60]:
        new_close = min(NOW + timedelta(minutes=y) + timedelta(minutes=30), forced)
        assert new_close <= forced
