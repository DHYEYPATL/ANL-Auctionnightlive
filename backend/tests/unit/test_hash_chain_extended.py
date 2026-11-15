"""Extended hash chain tests for event integrity HD-SEC-13."""
import hashlib
import json
from datetime import datetime, timedelta, timezone

T = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)


def h(prev, event_type, ts, details):
    canon = json.dumps({"prev_hash": prev or "", "event_type": event_type,
                        "occurred_at": ts.isoformat(), "details": details},
                       sort_keys=True, default=str)
    return hashlib.sha256(canon.encode()).hexdigest()


def test_chain_of_10_events_all_different():
    hashes = []
    prev = None
    for i in range(10):
        event_hash = h(prev, "BID_SUBMITTED", T + timedelta(seconds=i), {"seq": i})
        hashes.append(event_hash)
        prev = event_hash
    assert len(set(hashes)) == 10


def test_genesis_null_prev_deterministic():
    h1 = h(None, "PUBLISHED", T, {"status": "ACTIVE"})
    h2 = h(None, "PUBLISHED", T, {"status": "ACTIVE"})
    assert h1 == h2


def test_hash_is_hex_64_chars():
    result = h(None, "PUBLISHED", T, {})
    assert len(result) == 64
    assert all(c in "0123456789abcdef" for c in result)


def test_different_details_different_hash():
    h1 = h(None, "BID_SUBMITTED", T, {"total": "1000.00"})
    h2 = h(None, "BID_SUBMITTED", T, {"total": "999.00"})
    assert h1 != h2


def test_replay_attack_detected():
    """Inserting same event twice at different sequence breaks the chain."""
    h0 = h(None, "PUBLISHED", T, {})
    h1 = h(h0, "BID_SUBMITTED", T + timedelta(seconds=1), {"seq": 1})
    # Attacker tries to replay h1 as if it came after h1
    h1_replay = h(h1, "BID_SUBMITTED", T + timedelta(seconds=1), {"seq": 1})
    # The replay hash is different from h1 (different prev_hash)
    assert h1_replay != h1


def test_inserting_between_events_breaks_chain():
    h0 = h(None, "PUBLISHED", T, {})
    h1 = h(h0, "BID_SUBMITTED", T + timedelta(seconds=1), {"seq": 1})
    h2 = h(h1, "RANK_CHANGED", T + timedelta(seconds=2), {"rank": 1})
    # Attacker inserts a fake event between h1 and h2
    h_fake = h(h1, "FAKE_EVENT", T + timedelta(seconds=1, microseconds=500000), {})
    h2_after_fake = h(h_fake, "RANK_CHANGED", T + timedelta(seconds=2), {"rank": 1})
    assert h2_after_fake != h2  # chain broken
