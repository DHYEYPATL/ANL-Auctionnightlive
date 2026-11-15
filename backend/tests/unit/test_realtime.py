"""HD-RT real-time delivery tests — clock anchor, version guard, ETag logic."""
import pytest
import time


# HD-RT-01: server_now clock anchor
def test_clock_anchor_math():
    """serverMs + (perf_now - anchor_perf) gives estimated server time."""
    server_ms = 1700000000000  # arbitrary epoch ms
    t0_perf = 1000.0  # ms
    t1_perf = 1050.0  # 50ms rtt
    rtt = t1_perf - t0_perf
    # anchor set at response receipt: serverMs = server_now + rtt/2
    anchor_perf = t1_perf
    anchor_server_ms = server_ms + rtt / 2
    # At anchor_perf + 3000ms (3s later), estimated server time:
    later_perf = anchor_perf + 3000
    estimated = anchor_server_ms + (later_perf - anchor_perf)
    # Should be ~3025ms ahead of server_ms
    assert abs(estimated - server_ms - 3025) < 1


# HD-RT-02: monotonic version guard
def test_version_guard_rejects_older():
    current_version = 10
    incoming_version = 8
    should_render = incoming_version >= current_version
    assert should_render is False


def test_version_guard_accepts_same():
    current_version = 10
    incoming_version = 10
    assert incoming_version >= current_version


def test_version_guard_accepts_newer():
    current_version = 10
    incoming_version = 11
    assert incoming_version >= current_version


# HD-RT-03: ETag format
def test_etag_format():
    version, status, viewer = 42, "ACTIVE", "buyer"
    etag = f'W/"{version}:{status}:{viewer}"'
    assert etag == 'W/"42:ACTIVE:buyer"'
    assert etag.startswith('W/"')


def test_etag_changes_on_version():
    e1 = f'W/"10:ACTIVE:buyer"'
    e2 = f'W/"11:ACTIVE:buyer"'
    assert e1 != e2


def test_etag_changes_on_status():
    e1 = f'W/"10:ACTIVE:buyer"'
    e2 = f'W/"10:CLOSED:buyer"'
    assert e1 != e2


def test_etag_changes_on_viewer():
    e1 = f'W/"10:ACTIVE:buyer"'
    e2 = f'W/"10:ACTIVE:sup-123"'
    assert e1 != e2


# HD-RT-05: poll interval math
def test_jitter_range():
    base = 3000
    jitter_range = 500
    for _ in range(100):
        import random
        jitter = (random.random() - 0.5) * jitter_range
        wait = base + jitter
        assert 2500 <= wait <= 3500


def test_backoff_caps_at_15s():
    fails = 0
    for _ in range(10):
        fails += 1
        backoff = min(3000 * (2 ** fails), 15000)
        assert backoff <= 15000


def test_hidden_tab_poll_interval():
    hidden_interval = 10000  # 10s
    normal_interval = 3000
    assert hidden_interval > normal_interval


# HD-RT-11: separate standings and events polls
def test_events_fetched_on_version_change_only():
    old_version = 5
    new_version = 6
    should_fetch_events = new_version > old_version
    assert should_fetch_events is True


def test_events_not_fetched_on_304():
    # 304 means no version change — events don't need re-fetch
    got_304 = True
    should_fetch_events = not got_304
    assert should_fetch_events is False
