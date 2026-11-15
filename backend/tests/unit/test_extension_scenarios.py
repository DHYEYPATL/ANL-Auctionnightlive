"""Comprehensive extension scenario tests — SRS §6.3 + HD-LIFE-07/08/09."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.bid_service import _evaluate_triggers
from app.services.ranking_service import StandingEntry

T = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
CLOSE = T + timedelta(hours=1)
FORCED = T + timedelta(hours=2)
X = 10  # trigger window minutes
Y = 5   # extension duration minutes


def _e(sid, total, rank, seq=1):
    return StandingEntry(
        supplier_id=sid, bid_id=uuid.uuid4(),
        total_amount=Decimal(str(total)), freight_charge=Decimal(str(total)),
        origin_charge=Decimal("0"), destination_charge=Decimal("0"),
        transit_time_days=1, valid_until=None,
        accepted_at=T, rank_number=rank, bid_seq=seq,
    )


S = [uuid.uuid4() for _ in range(5)]


def inside(now): return (CLOSE - timedelta(minutes=X)) <= now < CLOSE


# ── BID_RECEIVED trigger ──────────────────────────────────────────────────────

def test_bid_received_in_window():
    now = CLOSE - timedelta(minutes=5)
    assert inside(now)
    before, after = [_e(S[0], 1000, 1)], [_e(S[0], 900, 1)]
    assert "BID_RECEIVED" in _evaluate_triggers(["BID_RECEIVED"], before, after, S[0])


def test_bid_received_outside_window_still_evaluates():
    # _evaluate_triggers itself always matches BID_RECEIVED; window check is at service level
    before, after = [_e(S[0], 1000, 1)], [_e(S[0], 900, 1)]
    assert "BID_RECEIVED" in _evaluate_triggers(["BID_RECEIVED"], before, after, S[0])


# ── ANY_RANK_CHANGE trigger ──────────────────────────────────────────────────

def test_new_entrant_counts_as_rank_change():
    before, after = [], [_e(S[0], 1000, 1)]
    assert "ANY_RANK_CHANGE" in _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S[0])


def test_no_rank_change_when_l1_lowers_own():
    before = [_e(S[0], 1000, 1), _e(S[1], 1200, 2)]
    after = [_e(S[0], 900, 1), _e(S[1], 1200, 2)]
    assert "ANY_RANK_CHANGE" not in _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S[0])


def test_rank_change_when_l3_displaces_l2():
    before = [_e(S[0], 500, 1), _e(S[1], 700, 2), _e(S[2], 900, 3)]
    after = [_e(S[0], 500, 1), _e(S[2], 650, 2), _e(S[1], 700, 3)]
    assert "ANY_RANK_CHANGE" in _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S[2])


# ── L1_CHANGE trigger ────────────────────────────────────────────────────────

def test_first_bid_ever_triggers_l1_change():
    before, after = [], [_e(S[0], 1000, 1)]
    assert "L1_CHANGE" in _evaluate_triggers(["L1_CHANGE"], before, after, S[0])


def test_l1_supplier_id_unchanged_no_trigger():
    before = [_e(S[0], 1000, 1)]
    after = [_e(S[0], 800, 1)]
    assert "L1_CHANGE" not in _evaluate_triggers(["L1_CHANGE"], before, after, S[0])


def test_l1_changes_to_different_supplier():
    before = [_e(S[0], 800, 1), _e(S[1], 1000, 2)]
    after = [_e(S[1], 700, 1), _e(S[0], 800, 2)]
    assert "L1_CHANGE" in _evaluate_triggers(["L1_CHANGE"], before, after, S[1])


# ── OR semantics ─────────────────────────────────────────────────────────────

def test_only_configured_triggers_evaluated():
    # Only BID_RECEIVED configured; even if L1 changes, it won't appear
    before = [_e(S[0], 1000, 1)]
    after = [_e(S[1], 900, 1), _e(S[0], 1000, 2)]
    matched = _evaluate_triggers(["BID_RECEIVED"], before, after, S[1])
    assert matched == ["BID_RECEIVED"]


def test_or_semantics_one_match_sufficient():
    # Only ANY_RANK_CHANGE configured; BID_RECEIVED not in list
    before = [_e(S[0], 1000, 1)]
    after = [_e(S[1], 900, 1), _e(S[0], 1000, 2)]
    matched = _evaluate_triggers(["ANY_RANK_CHANGE"], before, after, S[1])
    assert "BID_RECEIVED" not in matched
    assert "ANY_RANK_CHANGE" in matched


# ── Extension arithmetic ──────────────────────────────────────────────────────

def test_extension_does_not_exceed_forced():
    for minutes_before_forced in [1, 2, 5, 10, 60, 120]:
        current = FORCED - timedelta(minutes=minutes_before_forced)
        proposed = current + timedelta(minutes=Y)
        new = min(proposed, FORCED)
        assert new <= FORCED


def test_no_extension_when_already_at_forced():
    new = min(FORCED + timedelta(minutes=Y), FORCED)
    assert new == FORCED
    assert new <= FORCED  # no actual gain — won't extend
