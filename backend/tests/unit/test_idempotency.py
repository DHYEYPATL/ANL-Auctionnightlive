"""HD-CON-09: Idempotency key validation and canonical hash logic."""
import hashlib
import json
import re
import pytest

IDEM_RE = re.compile(r"[A-Za-z0-9_.:\-]{8,128}")


def test_valid_key_uuid_style():
    key = "550e8400-e29b-41d4-a716-446655440000"
    assert IDEM_RE.fullmatch(key)


def test_valid_key_min_length():
    assert IDEM_RE.fullmatch("abcd1234")


def test_too_short_rejected():
    assert not IDEM_RE.fullmatch("abc1234")  # 7 chars


def test_too_long_rejected():
    assert not IDEM_RE.fullmatch("a" * 129)


def test_space_rejected():
    assert not IDEM_RE.fullmatch("abc def0")


def test_hash_covers_confirm_field():
    """Different confirm_large_drop values must produce different hashes."""
    def _hash(confirm: bool) -> str:
        payload = {
            "freight_charge": "100.00",
            "origin_charge": "50.00",
            "destination_charge": "25.00",
            "transit_time_days": 3,
            "valid_until": "2026-12-15",
            "confirm_large_drop": confirm,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    assert _hash(False) != _hash(True)


def test_hash_stable_on_same_payload():
    payload = {
        "freight_charge": "100.00",
        "origin_charge": "50.00",
        "destination_charge": "25.00",
        "transit_time_days": 3,
        "valid_until": "2026-12-15",
        "confirm_large_drop": False,
    }
    h1 = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    h2 = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    assert h1 == h2


def test_hash_changes_on_amount():
    def _hash(freight: str) -> str:
        payload = {
            "freight_charge": freight,
            "origin_charge": "50.00",
            "destination_charge": "25.00",
            "transit_time_days": 3,
            "valid_until": "2026-12-15",
            "confirm_large_drop": False,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    assert _hash("100.00") != _hash("99.00")
