"""HD-SEC-13: Event hash chain integrity."""
import hashlib
import json
from datetime import datetime, timezone


def _hash(prev, event_type, occurred_at, details):
    canonical = json.dumps({
        "prev_hash": prev or "",
        "event_type": event_type,
        "occurred_at": occurred_at.isoformat(),
        "details": details,
    }, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


NOW = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)


def test_genesis_event_hash_deterministic():
    h1 = _hash(None, "PUBLISHED", NOW, {"status": "ACTIVE"})
    h2 = _hash(None, "PUBLISHED", NOW, {"status": "ACTIVE"})
    assert h1 == h2


def test_chain_breaks_on_tamper():
    h0 = _hash(None, "PUBLISHED", NOW, {"status": "ACTIVE"})
    h1 = _hash(h0, "BID_SUBMITTED", NOW, {"total": "1000.00"})
    h1_tampered = _hash(h0, "BID_SUBMITTED", NOW, {"total": "900.00"})  # different amount
    assert h1 != h1_tampered


def test_chain_is_sequential():
    h0 = _hash(None, "PUBLISHED", NOW, {})
    h1 = _hash(h0, "BID_SUBMITTED", NOW, {"total": "1000.00"})
    h2 = _hash(h1, "RANK_CHANGED", NOW, {"from_rank": None, "to_rank": 1})
    h3 = _hash(h2, "EXTENSION_APPLIED", NOW, {"y": 5})
    # Each hash depends on the previous
    assert len({h0, h1, h2, h3}) == 4


def test_changing_prev_hash_breaks_chain():
    h0 = _hash(None, "PUBLISHED", NOW, {})
    h1_correct = _hash(h0, "BID_SUBMITTED", NOW, {"total": "1000.00"})
    h1_wrong_prev = _hash("deadbeef", "BID_SUBMITTED", NOW, {"total": "1000.00"})
    assert h1_correct != h1_wrong_prev


def test_hash_includes_event_type():
    h_bid = _hash(None, "BID_SUBMITTED", NOW, {})
    h_rank = _hash(None, "RANK_CHANGED", NOW, {})
    assert h_bid != h_rank


def test_hash_includes_timestamp():
    from datetime import timedelta
    t2 = NOW + timedelta(seconds=1)
    h1 = _hash(None, "BID_SUBMITTED", NOW, {})
    h2 = _hash(None, "BID_SUBMITTED", t2, {})
    assert h1 != h2
