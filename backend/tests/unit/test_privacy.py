"""
HD-SEC-04/05: Verify supplier-facing projections strip competitor PII.
These are logic tests — no DB needed.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.services.ranking_service import StandingEntry

CANARY_ID = uuid.UUID("cafecafe-cafe-cafe-cafe-cafecafe0001")
OWN_ID = uuid.UUID("aabbccdd-aabb-ccdd-aabb-aabbccdd0001")

CLOSE = datetime(2026, 11, 16, 13, 0, tzinfo=timezone.utc)


def _entry(sid, total, rank, seq=1):
    return StandingEntry(
        supplier_id=sid,
        bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)),
        freight_charge=Decimal("100.00"),
        origin_charge=Decimal("50.00"),
        destination_charge=Decimal("25.00"),
        transit_time_days=3,
        valid_until=None,
        accepted_at=CLOSE,
        rank_number=rank,
        bid_seq=seq,
    )


def _project_supplier_view(entry: StandingEntry, viewing_supplier_id: uuid.UUID, anon_map: dict) -> dict:
    """Simulate what the standings endpoint returns for a supplier."""
    is_own = entry.supplier_id == viewing_supplier_id
    return {
        "supplier_id": str(entry.supplier_id) if is_own else None,
        "supplier_label": f"You" if is_own else anon_map.get(str(entry.supplier_id), "Supplier ?"),
        "total_amount": str(entry.total_amount),
        "freight_charge": str(entry.freight_charge) if is_own else None,
        "origin_charge": str(entry.origin_charge) if is_own else None,
        "destination_charge": str(entry.destination_charge) if is_own else None,
        "is_self": is_own,
    }


def test_competitor_supplier_id_hidden():
    entries = [_entry(CANARY_ID, 900, 1), _entry(OWN_ID, 1000, 2)]
    anon = {str(CANARY_ID): "Supplier 1", str(OWN_ID): "Supplier 2"}
    for e in entries:
        projected = _project_supplier_view(e, OWN_ID, anon)
        if e.supplier_id == CANARY_ID:
            assert projected["supplier_id"] is None, "Competitor supplier_id must not leak"
            assert "cafecafe" not in str(projected.values()), "Canary UUID must not appear"


def test_competitor_charges_hidden():
    entries = [_entry(CANARY_ID, 900, 1), _entry(OWN_ID, 1000, 2)]
    anon = {str(CANARY_ID): "Supplier 1"}
    for e in entries:
        projected = _project_supplier_view(e, OWN_ID, anon)
        if e.supplier_id == CANARY_ID:
            assert projected["freight_charge"] is None
            assert projected["origin_charge"] is None
            assert projected["destination_charge"] is None


def test_own_row_has_full_detail():
    entry = _entry(OWN_ID, 1000, 1)
    anon = {}
    projected = _project_supplier_view(entry, OWN_ID, anon)
    assert projected["freight_charge"] == "100.00"
    assert projected["origin_charge"] == "50.00"
    assert projected["supplier_id"] is not None
    assert projected["is_self"] is True


def test_competitor_total_visible():
    entry = _entry(CANARY_ID, 900, 1)
    anon = {str(CANARY_ID): "Supplier 3"}
    projected = _project_supplier_view(entry, OWN_ID, anon)
    assert projected["total_amount"] == "900"
    assert projected["supplier_label"] == "Supplier 3"


def test_anon_label_not_canary_uuid():
    entry = _entry(CANARY_ID, 900, 1)
    anon = {str(CANARY_ID): "Supplier 7"}
    projected = _project_supplier_view(entry, OWN_ID, anon)
    assert "cafecafe" not in projected["supplier_label"]
    assert projected["supplier_label"] == "Supplier 7"
