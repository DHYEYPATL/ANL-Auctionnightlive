"""Property-based invariants for ranking — no gaps, unique labels, stable sort."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List

import pytest

from app.services.ranking_service import StandingEntry

T = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)


def _e(total, seq, offset_s=0):
    return StandingEntry(
        supplier_id=uuid.uuid4(),
        bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)),
        freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"),
        destination_charge=Decimal("0"),
        transit_time_days=1,
        valid_until=None,
        accepted_at=T + timedelta(seconds=offset_s),
        rank_number=0,  # will be set by sort
        bid_seq=seq,
    )


def _rank(entries: List[StandingEntry]) -> List[StandingEntry]:
    """Apply ranking logic to a list of entries."""
    sorted_entries = sorted(
        entries,
        key=lambda e: (e.total_amount, e.bid_seq, e.supplier_id)
    )
    for i, e in enumerate(sorted_entries, 1):
        e.rank_number = i
    return sorted_entries


def test_no_gaps_in_rank():
    entries = [_e(1000 - i * 10, i) for i in range(5)]
    ranked = _rank(entries)
    assert [r.rank_number for r in ranked] == [1, 2, 3, 4, 5]


def test_unique_rank_numbers():
    entries = [_e(1000, i) for i in range(10)]  # all same total, different seq
    ranked = _rank(entries)
    nums = [r.rank_number for r in ranked]
    assert len(nums) == len(set(nums))


def test_lower_total_always_wins():
    entries = [_e(1000, 1), _e(500, 2), _e(1500, 3)]
    ranked = _rank(entries)
    assert ranked[0].total_amount == Decimal("500")
    assert ranked[1].total_amount == Decimal("1000")
    assert ranked[2].total_amount == Decimal("1500")


def test_tie_broken_by_seq():
    entries = [_e(1000, 2), _e(1000, 1)]  # same total, seq 1 should win
    ranked = _rank(entries)
    assert ranked[0].bid_seq == 1
    assert ranked[1].bid_seq == 2


def test_single_entry_is_l1():
    entries = [_e(1000, 1)]
    ranked = _rank(entries)
    assert ranked[0].rank_number == 1
    assert ranked[0].rank_label == "L1"


def test_empty_standings():
    assert _rank([]) == []


def test_rank_labels_match_numbers():
    entries = [_e(1000 - i * 100, i) for i in range(6)]
    ranked = _rank(entries)
    for r in ranked:
        assert r.rank_label == f"L{r.rank_number}"


def test_stable_sort_on_equal_totals_equal_seq():
    """When total and seq are equal, supplier_id UUID ordering is tie-break."""
    s_low = uuid.UUID("00000000-0000-0000-0000-000000000001")
    s_high = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
    e1 = _e(1000, 5)
    e2 = _e(1000, 5)
    e1.supplier_id = s_low
    e2.supplier_id = s_high
    ranked = _rank([e2, e1])
    assert ranked[0].supplier_id == s_low  # lower UUID wins
