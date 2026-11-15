"""HD-SEC-07: Pydantic extra=forbid rejects injected fields."""
import pytest
from pydantic import ValidationError

from app.schemas.bid import SubmitBidRequest
from app.schemas.rfq import CreateRfqRequest, AuctionConfigSchema


def _base_bid():
    return dict(
        freight_charge="100.00",
        origin_charge="50.00",
        destination_charge="25.00",
        transit_time_days=3,
        valid_until="2026-12-15",
    )


def test_total_amount_injection_rejected():
    """Client-provided total_amount must be ignored — extra=forbid raises."""
    with pytest.raises(ValidationError):
        SubmitBidRequest(**_base_bid(), total_amount="175.00")


def test_supplier_id_injection_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**_base_bid(), supplier_id="some-uuid")


def test_rank_injection_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**_base_bid(), rank="L1")


def test_accepted_at_injection_rejected():
    with pytest.raises(ValidationError):
        SubmitBidRequest(**_base_bid(), accepted_at="2026-11-16T12:00:00Z")


def test_valid_bid_accepted():
    req = SubmitBidRequest(**_base_bid())
    assert req.transit_time_days == 3


def test_rfq_extra_field_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(
            name="Test",
            reference_id="R001",
            currency="USD",
            service_date="2026-12-10",
            start_at="2026-11-16T10:00:00+05:30",
            scheduled_close_at="2026-11-16T18:00:00+05:30",
            forced_close_at="2026-11-16T18:30:00+05:30",
            supplier_ids=["550e8400-e29b-41d4-a716-446655440000"],
            auction_config={
                "trigger_window_minutes": 10,
                "extension_duration_minutes": 5,
                "triggers": ["BID_RECEIVED"],
            },
            status="ACTIVE",  # injected — should be rejected
        )
