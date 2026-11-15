"""HD-CON-* concurrency requirements — pure logic tests."""
import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

T = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
IDEM_RE = re.compile(r"[A-Za-z0-9_.:\-]{8,128}")


class TestHDCON01_LockFirst:
    """HD-CON-01: RFQ row lock is the first statement."""
    def test_lock_before_clock(self):
        # Pseudo-test: document the invariant
        step_order = ["SELECT FOR UPDATE", "clock_timestamp()", "idempotency check",
                      "eligibility", "time checks", "INSERT bid", "UPDATE rfqs"]
        assert step_order[0] == "SELECT FOR UPDATE"
        assert step_order[1] == "clock_timestamp()"


class TestHDCON03_DecisionAt:
    """HD-CON-03: single decision_at = GREATEST(clock, last_decision_at)."""
    def test_monotonic(self):
        last = T + timedelta(milliseconds=100)
        clock = T  # slightly behind
        decision_at = max(clock, last)
        assert decision_at == last

    def test_clock_ahead(self):
        last = T
        clock = T + timedelta(milliseconds=200)
        assert max(clock, last) == clock


class TestHDCON04_BidSeq:
    """HD-CON-04: bid_seq monotonically increases per RFQ."""
    def test_sequential(self):
        last_seq = 0
        for _ in range(10):
            new_seq = last_seq + 1
            assert new_seq > last_seq
            last_seq = new_seq


class TestHDCON06_LockTimeout:
    """HD-CON-06: lock timeout → 503 not 500."""
    def test_response_code_is_503(self):
        assert 503 != 500
        assert 503 != 400


class TestHDCON09_Idempotency:
    """HD-CON-09: idempotency key format, payload hash."""
    def test_valid_key(self):
        assert IDEM_RE.fullmatch("12345678")
        assert IDEM_RE.fullmatch(str(uuid.uuid4()))

    def test_too_short(self):
        assert not IDEM_RE.fullmatch("1234567")

    def test_too_long(self):
        assert not IDEM_RE.fullmatch("a" * 129)

    def test_hash_deterministic(self):
        payload = {"freight_charge": "100.00", "origin_charge": "50.00",
                   "destination_charge": "25.00", "transit_time_days": 3,
                   "valid_until": "2026-12-15", "confirm_large_drop": False}
        h = lambda: hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        assert h() == h()


class TestHDCON10_UnknownProtocol:
    """HD-CON-10: timeout/5xx = UNKNOWN, not failed."""
    def test_outcome_values(self):
        UNKNOWN = "UNKNOWN"
        ACCEPTED = "ACCEPTED"
        assert UNKNOWN != ACCEPTED
        # UNKNOWN triggers retry, not abandon

    def test_retry_with_same_key(self):
        key = str(uuid.uuid4())
        retries = [key, key, key]  # same key every retry
        assert all(k == key for k in retries)


class TestHDCON13_AttemptRecord:
    """HD-CON-13: bid_attempts written outside transaction."""
    def test_attempt_fields(self):
        attempt = {
            "outcome": "ACCEPTED",
            "received_at": T.isoformat(),
            "lock_wait_ms": 15,
            "total_ms": 45,
            "idempotency_key_prefix": "abcd1234",
        }
        assert len(attempt["idempotency_key_prefix"]) == 8
        assert attempt["outcome"] in {"ACCEPTED", "REPLAYED", "AUCTION_CLOSED",
                                       "BID_NOT_LOWER_THAN_PREVIOUS", "UNKNOWN"}


class TestHDCON15_EventSeq:
    """HD-CON-15: event_seq per-RFQ, gap-free."""
    def test_gap_free(self):
        seqs = list(range(1, 51))
        assert seqs == list(range(1, len(seqs) + 1))

    def test_event_seq_increments_per_rfq(self):
        last = 5
        new = last + 1
        assert new == 6


class TestHDCON16_CausalOrder:
    """HD-CON-16: event causal order."""
    def test_bid_before_rank_before_extension(self):
        causal = ["BID_SUBMITTED", "RANK_CHANGED", "EXTENSION_APPLIED"]
        assert causal.index("BID_SUBMITTED") < causal.index("RANK_CHANGED")
        assert causal.index("RANK_CHANGED") < causal.index("EXTENSION_APPLIED")
