"""Unit tests for extension trigger evaluation logic."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services.bid_service import _evaluate_triggers, _l1_id, _rank_map
from app.services.ranking_service import StandingEntry


def make_entry(supplier_id, total, rank, accepted_offset=0):
    base = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)
    return StandingEntry(
        supplier_id=supplier_id,
        bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)),
        freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"),
        destination_charge=Decimal("0"),
        transit_time_days=1,
        valid_until=None,
        accepted_at=base + timedelta(seconds=accepted_offset),
        rank_number=rank,
    )


S1 = uuid.uuid4()
S2 = uuid.uuid4()
S3 = uuid.uuid4()


def test_bid_received_always_matches():
    before = [make_entry(S1, 1000, 1)]
    after = [make_entry(S1, 900, 1)]
    matched = _evaluate_triggers(["BID_RECEIVED"], before, after, None)
    assert "BID_RECEIVED" in matched


def test_any_rank_change_new_supplier():
    before = [make_entry(S1, 1000, 1)]
    after = [make_entry(S2, 900, 1), make_entry(S1, 1000, 2)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, None)
    assert "ANY_RANK_CHANGE" in matched


def test_any_rank_change_no_change():
    before = [make_entry(S1, 1000, 1), make_entry(S2, 2000, 2)]
    after = [make_entry(S1, 900, 1), make_entry(S2, 2000, 2)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, None)
    assert "ANY_RANK_CHANGE" not in matched


def test_l1_change_detected():
    before = [make_entry(S1, 1000, 1)]
    after = [make_entry(S2, 800, 1), make_entry(S1, 1000, 2)]
    matched = _evaluate_triggers(["L1_CHANGE"], before, after, None)
    assert "L1_CHANGE" in matched


def test_l1_same_supplier_no_change():
    before = [make_entry(S1, 1000, 1)]
    after = [make_entry(S1, 900, 1)]
    matched = _evaluate_triggers(["L1_CHANGE"], before, after, None)
    assert "L1_CHANGE" not in matched


def test_l1_from_no_bids_counts():
    before = []
    after = [make_entry(S1, 1000, 1)]
    matched = _evaluate_triggers(["L1_CHANGE"], before, after, None)
    assert "L1_CHANGE" in matched


def test_multiple_triggers_all_reported():
    before = [make_entry(S1, 1000, 1)]
    after = [make_entry(S2, 800, 1), make_entry(S1, 1000, 2)]
    matched = _evaluate_triggers(["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"], before, after, None)
    assert set(matched) == {"BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"}


def test_no_trigger_outside_window():
    # This is enforced at service level; here we just confirm trigger eval itself
    # returns empty when no triggers configured
    before = [make_entry(S1, 1000, 1)]
    after = [make_entry(S1, 900, 1)]
    matched = _evaluate_triggers([], before, after, None)
    assert matched == []
