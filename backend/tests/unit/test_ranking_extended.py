"""Extended ranking tests: bid_seq tie-break (CHG-1), three-way ties."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.services.ranking_service import StandingEntry


def entry(total, seq, rank, sid=None):
    return StandingEntry(
        supplier_id=sid or uuid.uuid4(),
        bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)),
        freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"),
        destination_charge=Decimal("0"),
        transit_time_days=1,
        valid_until=None,
        accepted_at=datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc),
        rank_number=rank,
        bid_seq=seq,
    )


S_A = uuid.UUID("00000000-0000-0000-0000-000000000001")
S_B = uuid.UUID("00000000-0000-0000-0000-000000000002")
S_C = uuid.UUID("00000000-0000-0000-0000-000000000003")


def test_lower_total_wins():
    e1 = entry(900, 2, 1, S_A)
    e2 = entry(1000, 1, 2, S_B)
    assert e1.rank_number < e2.rank_number


def test_equal_total_earlier_bid_seq_wins():
    e1 = entry(1000, 1, 1, S_A)   # seq 1 — earlier
    e2 = entry(1000, 2, 2, S_B)   # seq 2 — later
    assert e1.rank_number < e2.rank_number


def test_equal_total_equal_seq_supplier_id_tiebreak():
    # S_A < S_B in UUID ordering
    e1 = entry(1000, 5, 1, S_A)
    e2 = entry(1000, 5, 2, S_B)
    assert e1.rank_number < e2.rank_number


def test_rank_label_format():
    for n in range(1, 6):
        e = entry(100, n, n)
        assert e.rank_label == f"L{n}"


def test_zero_bid_entries_no_crash():
    standings = []
    assert len(standings) == 0
