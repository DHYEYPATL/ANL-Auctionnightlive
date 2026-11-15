"""Unit tests for ranking logic."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.services.ranking_service import StandingEntry


def make_entry(supplier_id, total, accepted_offset_seconds=0, rank=1):
    base_time = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)
    return StandingEntry(
        supplier_id=supplier_id,
        bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)),
        freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"),
        destination_charge=Decimal("0"),
        transit_time_days=1,
        valid_until=None,
        accepted_at=base_time.replace(second=accepted_offset_seconds),
        rank_number=rank,
    )


def test_rank_label():
    e = make_entry(uuid.uuid4(), 100, rank=1)
    assert e.rank_label == "L1"
    e2 = make_entry(uuid.uuid4(), 200, rank=3)
    assert e2.rank_label == "L3"


def test_lower_total_wins():
    s1 = uuid.uuid4()
    s2 = uuid.uuid4()
    e1 = make_entry(s1, 1000, rank=1)
    e2 = make_entry(s2, 2000, rank=2)
    # Lower total = L1
    assert e1.rank_number < e2.rank_number


def test_tie_resolved_by_time():
    s1 = uuid.uuid4()
    s2 = uuid.uuid4()
    # Same total, s1 submitted earlier → s1 wins
    e1 = make_entry(s1, 1000, accepted_offset_seconds=1, rank=1)
    e2 = make_entry(s2, 1000, accepted_offset_seconds=5, rank=2)
    assert e1.rank_number < e2.rank_number
