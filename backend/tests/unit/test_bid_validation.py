"""Unit tests for bid validation logic."""
import pytest
from decimal import Decimal
from pydantic import ValidationError

from app.schemas.bid import SubmitBidRequest


def make_valid_bid(**overrides):
    base = {
        "freight_charge": "100.00",
        "origin_charge": "50.00",
        "destination_charge": "25.00",
        "transit_time_days": 3,
        "valid_until": "2026-12-15",
    }
    base.update(overrides)
    return base


def test_valid_bid_total():
    req = SubmitBidRequest(**make_valid_bid())
    assert req.freight_charge + req.origin_charge + req.destination_charge == Decimal("175.00")


def test_negative_charge_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**make_valid_bid(freight_charge="-1.00"))


def test_too_many_decimals_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**make_valid_bid(origin_charge="10.001"))


def test_negative_transit_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**make_valid_bid(transit_time_days=-1))


def test_zero_transit_allowed():
    req = SubmitBidRequest(**make_valid_bid(transit_time_days=0))
    assert req.transit_time_days == 0


def test_zero_charge_allowed():
    req = SubmitBidRequest(**make_valid_bid(freight_charge="0.00"))
    assert req.freight_charge == Decimal("0.00")
