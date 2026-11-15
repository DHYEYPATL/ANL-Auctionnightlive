"""RFQ validation — time ordering, extension config, timezone requirement."""
import pytest
from pydantic import ValidationError
from app.schemas.rfq import CreateRfqRequest, AuctionConfigSchema


BASE = {
    "name": "Test RFQ",
    "reference_id": "R001",
    "currency": "USD",
    "service_date": "2026-12-10",
    "start_at": "2026-11-16T10:00:00+05:30",
    "scheduled_close_at": "2026-11-16T18:00:00+05:30",
    "forced_close_at": "2026-11-16T18:30:00+05:30",
    "supplier_ids": ["550e8400-e29b-41d4-a716-446655440000"],
    "auction_config": {
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
        "triggers": ["BID_RECEIVED"],
    },
}


def test_valid_rfq():
    req = CreateRfqRequest(**BASE)
    assert req.name == "Test RFQ"


def test_start_after_close_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "start_at": "2026-11-16T20:00:00+05:30"})


def test_close_after_forced_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "scheduled_close_at": "2026-11-16T19:00:00+05:30"})


def test_trigger_window_zero_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "auction_config": {
            "trigger_window_minutes": 0,
            "extension_duration_minutes": 5,
            "triggers": ["BID_RECEIVED"],
        }})


def test_extension_duration_zero_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "auction_config": {
            "trigger_window_minutes": 10,
            "extension_duration_minutes": 0,
            "triggers": ["BID_RECEIVED"],
        }})


def test_empty_triggers_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "auction_config": {
            "trigger_window_minutes": 10,
            "extension_duration_minutes": 5,
            "triggers": [],
        }})


def test_invalid_trigger_name_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "auction_config": {
            "trigger_window_minutes": 10,
            "extension_duration_minutes": 5,
            "triggers": ["INVALID_TRIGGER"],
        }})


def test_empty_supplier_list_rejected():
    with pytest.raises(ValidationError):
        CreateRfqRequest(**{**BASE, "supplier_ids": []})


def test_all_three_triggers_valid():
    req = CreateRfqRequest(**{**BASE, "auction_config": {
        "trigger_window_minutes": 10,
        "extension_duration_minutes": 5,
        "triggers": ["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"],
    }})
    assert len(req.auction_config.triggers) == 3


def test_negative_trigger_window_rejected():
    with pytest.raises(ValidationError):
        AuctionConfigSchema(trigger_window_minutes=-1, extension_duration_minutes=5, triggers=["BID_RECEIVED"])
