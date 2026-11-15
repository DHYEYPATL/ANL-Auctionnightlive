"""SubmitBidRequest: canonical hash stability, confirm_large_drop field."""
import pytest
from pydantic import ValidationError
from app.schemas.bid import SubmitBidRequest


def _make(**kwargs):
    base = dict(
        freight_charge="100.00",
        origin_charge="50.00",
        destination_charge="25.00",
        transit_time_days=3,
        valid_until="2026-12-15",
    )
    base.update(kwargs)
    return base


def test_canonical_hash_stable():
    req = SubmitBidRequest(**_make())
    assert req.canonical_hash() == req.canonical_hash()


def test_canonical_hash_changes_on_amount():
    r1 = SubmitBidRequest(**_make(freight_charge="100.00"))
    r2 = SubmitBidRequest(**_make(freight_charge="101.00"))
    assert r1.canonical_hash() != r2.canonical_hash()


def test_canonical_hash_changes_on_confirm():
    r1 = SubmitBidRequest(**_make(confirm_large_drop=False))
    r2 = SubmitBidRequest(**_make(confirm_large_drop=True))
    assert r1.canonical_hash() != r2.canonical_hash()


def test_json_number_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**_make(freight_charge=100.0))


def test_total_computed_correctly():
    from decimal import Decimal
    req = SubmitBidRequest(**_make(freight_charge="100.00", origin_charge="50.00", destination_charge="25.00"))
    assert req.total() == Decimal("175.00")


def test_transit_days_upper_bound():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**_make(transit_time_days=366))


def test_transit_days_zero_allowed():
    req = SubmitBidRequest(**_make(transit_time_days=0))
    assert req.transit_time_days == 0
