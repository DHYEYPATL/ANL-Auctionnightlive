# British Auction RFQ — Production Hardening: Top 20 Failure Modes + SRS Additions

Nov 15, 2026 · @dhyey

## 1. How to use this doc

This doc adds testable hardening requirements (`HD-*`) on top of your SRS v1.0. Each one is tagged **P0** (build today), **P1** (build if time allows) or **P2** (write into the README as roadmap, don't build). Follow it top to bottom; section 12 gives the build order with timeboxes.

**Interview reality check.** No HTTP + PostgreSQL system gives zero-microsecond latency, and nobody will expect it. What you can guarantee and demo is: (1) every bid is decided at one serialized instant on the database clock, (2) that decision is final, idempotent and auditable, (3) there is a stated p99 target and an alarm when it is missed. Say this in R2 before they ask.

### Changes to SRS v1.0

SRS v1.0 stays the baseline. Every place this doc changes it is marked **CHG-n**. With default settings, acceptance tests AT-01 to AT-10 pass unchanged.

| ID | Change | Replaces |
| --- | --- | --- |
| CHG-1 | Ranking tie-break uses a per-RFQ `bid_seq` instead of `accepted_at` (same meaning: earlier bid wins, but immune to clock ties and clock steps). | BR-12, FR-RANK-03, §9.4 |
| CHG-2 | `accepted_at` is written explicitly from the single decision timestamp, not from the column default. | §9.2 `bids` |
| CHG-3 | Unknown RFQ and not-allowed RFQ return the same 404. 403 is kept only for role mismatch on a route. | BR-05, SEC-10 |
| CHG-4 | A bid total must be greater than zero (individual charges may still be zero). | FR-BID-03 |
| CHG-5 | An idempotent replay returns 200 with `replayed: true`; 201 is only for a newly accepted bid. | §8.3 |
| CHG-6 | New columns, tables and triggers (section 9) and new error codes (section 10). | §8.5, §9 |

### Priority tiers

| Tier | Meaning | Rule |
| --- | --- | --- |
| P0 | Build today | Cheap to build and directly prevents wrong, lost or leaked bids. A reviewer testing edge cases will hit these. |
| P1 | Build if time allows | Strong signal of production thinking, but the assignment works without it. |
| P2 | Document only | Put it in the README roadmap with one line on how you would build it. |

### Conventions

- IDs are `HD-<AREA>-<nn>`: CON (concurrency), BID (bid integrity), LIFE (lifecycle), RT (real-time), SEC (security), REL/OBS/TEST (operations).
- "Shall" means testable. Each requirement maps to a test row `E-nn` in section 11, numbered after the 28 edge cases already in SRS §13.
- **Do not hard-reject short auctions or X longer than the auction.** Evaluators will create 3-minute demo auctions. Warn in the UI instead, and keep an `ALLOW_SHORT_AUCTIONS=true` setting for development and demo.

## 2. The 20 things teams miss

Your SRS already covers the core (row lock, DB clock, idempotency, forced cap, privacy). These 20 are what it does not cover, and what breaks real auction platforms. They are sorted by blast radius, not by section; the last column says where the fix lives.

| # | Failure in production | What goes wrong | Fix | Requirements | Pri |
| --- | --- | --- | --- | --- | --- |
| 1 | Decision made on stale data | ORM object or snapshot loaded before the lock; bid judged against an old close time or old standings; extension lost | Lock first, read after; READ COMMITTED; refresh the locked row | HD-CON-01, 02 | P0 |
| 2 | Two clocks for one decision | Time used to decide differs from time stored; microsecond ties; an NTP step reorders bids | One decision timestamp, stored as-is; per-RFQ `bid_seq`; monotonic guard | HD-CON-03, 04, 05 | P0 |
| 3 | Hot-row lock pile-up | Final-minute burst queues on one RFQ, the pool drains, every other auction stalls | `lock_timeout`, no I/O inside the transaction, pool isolation, 503 `AUCTION_BUSY` | HD-CON-06, 07, 08 | P0 |
| 4 | Unknown outcome, weak idempotency | Timeout after commit; retry double-books or reports "failed" for a bid that is in; replay after close is rejected | Payload-hash idempotency, replay works after close, UNKNOWN protocol, lookup endpoint | HD-CON-09, 10 | P0 |
| 5 | Disputes with no evidence | Supplier says "I bid in time"; rejected attempts left no trace because the transaction rolled back | `bid_attempts` written outside the transaction, receipts, `received_at`, `lock_wait_ms` | HD-CON-12, 13, 14 | P0 |
| 6 | Irreversible fat-finger bids | Bids are strictly decreasing and immutable, so 100 instead of 1000 locks the supplier in; "1.250,50" parsed as 1.25 | Review step, large-drop confirmation, ceiling price, strict number parsing | HD-BID-05, 06, 07, 08 | P0 |
| 7 | Extension abuse | Penny bids or bots keep the auction alive to forced close | Minimum decrement, per-supplier rate limit, optional max extensions | HD-BID-05, 09, 10 | P1 |
| 8 | Money and number edge cases | JSON floats, `NaN`, `1e3`, overflow, zero total, 0- and 3-decimal currencies | String-only decimals, bounds, currency whitelist, integer minor units in the UI | HD-BID-01, 02, 03, 04 | P0 |
| 9 | Time input edge cases | Naive timestamps, DST gaps, wrong timezone, a close time rounded up in the UI | Offset required, UTC preview, truncate never round | HD-BID-11, 12, 13, 14 | P0 |
| 10 | Non-deterministic or slow ranking | Ties flip between polls; every poll scans all bids | `bid_seq` tie-break, denormalized current bid, indexes | HD-CON-04, HD-RT-06 | P0 / P1 |
| 11 | Event feed that loses events | A global BIGSERIAL cursor skips rows that commit out of order | Per-RFQ `event_seq` assigned under the RFQ lock; version counter | HD-CON-15, 16 | P0 |
| 12 | Worker races | Close written from a stale read, twice, or just after an extension committed; two Beat instances | Lock, re-check, `SKIP LOCKED`, unique terminal event, logical close time | HD-LIFE-01 to 06, HD-REL-01 | P0 |
| 13 | Polling herd and stale UI | 2,000 clients every 3 s; out-of-order responses; countdown from the browser clock; throttled hidden tabs | ETag/304, jitter, version guard, `server_now` offset, refetch on focus | HD-RT-01 to 05, 11 | P0 |
| 14 | Session expiry mid-auction | Token expires in the last 30 seconds; bid lost and form wiped | Keep form and key on 401, refresh flow, clock leeway | HD-SEC-01, 02 | P0 / P1 |
| 15 | Data leaks through projections | Competitor IDs in events, errors, OpenAPI or a shared cache; guessable anonymous labels | Per-role response models, random labels, uniform 404, `no-store`, canary test | HD-SEC-04, 05, 06, HD-RT-04 | P0 |
| 16 | Participant lifecycle gaps | User or supplier deactivated mid-auction; two users from one supplier bidding at once | Re-check inside the transaction, written policy, composite FK | HD-SEC-10, 11, HD-CON-11 | P0 / P1 |
| 17 | Invariants enforced only in app code | One buggy path inserts a late bid or edits history | Triggers, append-only permissions, hash chain | HD-SEC-12, 13 | P0 / P1 |
| 18 | Durability and failover | Acknowledged bid vanishes after failover; ambiguous commit; replica reads on the bid path | Synchronous replication, PITR, primary-only bid path, 503 `OUTCOME_UNKNOWN` | HD-REL-04, 05, HD-RT-08 | P1 / P2 |
| 19 | Deploys and migrations during live auctions | `ALTER TABLE` queues behind a bid lock and blocks every later bid; a restart kills in-flight bids | `lock_timeout`, expand/contract, graceful shutdown, deploy gate | HD-REL-03, 06, 07 | P0 / P1 |
| 20 | Nothing proves it works | No invariant checker, no concurrency or chaos test, no alerts, no runbook | Invariant auditor, oracle replay test, metrics, runbooks | HD-OBS-01 to 04, HD-TEST-01, 02, HD-OPS-01 | P0 / P1 |

## 3. Section A: Time, ordering and concurrency

Every bid decision must come from one lock, one clock reading, one sequence number and one stored result. This section replaces SRS §6.2 steps 6 to 14 and §10.6 with an exact order you can code line by line.

### Hardened bid transaction, in order

1. **Before the transaction.** Authenticate. Validate payload shape (money strings, bounds). Compute `request_hash`. Record `received_at` (app clock) and start a timer. Read no mutable auction state.
2. `BEGIN ISOLATION LEVEL READ COMMITTED`, then `SET LOCAL lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout`.
3. `SELECT ... FROM rfqs WHERE id = :id FOR UPDATE`. This is the first statement. A lock timeout returns 503 `AUCTION_BUSY`; nothing was written.
4. Read the clock once: `decision_at = GREATEST(clock_timestamp(), rfqs.last_decision_at)`. Record `lock_wait_ms`.
5. Idempotency lookup on `(rfq_id, supplier_id, key)`. Same hash: return the stored result as a replay and stop. Different hash: 409 `IDEMPOTENCY_CONFLICT`.
6. Eligibility in one query: user active, supplier active, invitation `ACTIVE`; also read the supplier's previous total.
7. Time checks with `decision_at`: published, started, `< current_close_at`, `< forced_close_at`.
8. Business checks: total > 0, within ceiling, strictly lower than own previous total and at least the minimum decrement, large-drop confirmation.
9. Read the standings before the bid (one query on `rfq_suppliers`).
10. **In memory:** `bid_seq = last_bid_seq + 1`. Build the after-standings by replacing this supplier's entry. Compare every rank. Evaluate triggers against `current_close_at` (SRS §6.3). Compute `new_close = LEAST(current_close_at + Y, forced_close_at)` if a trigger matched.
11. `INSERT` the bid with explicit `accepted_at = decision_at`, `bid_seq`, `close_at_before`, `close_at_after = new_close`, `received_at`, `lock_wait_ms`, `request_hash`. Bids are append-only, so `close_at_after` must be known at insert time. Insert **before** touching the `rfqs` row: the DB trigger checks `bid_seq` and `close_at_before` against it. Then update the supplier's `current_*` columns.
12. Insert events in causal order (`BID_SUBMITTED`, `RANK_CHANGED`, `EXTENSION_APPLIED`) with consecutive `event_seq`, in one batched statement.
13. One `UPDATE` on `rfqs`: `current_close_at` (if extended), `extension_count`, `version`, `last_bid_seq`, `last_event_seq`, `last_decision_at`.
14. `COMMIT`. Build the response from values captured in steps 10 to 13; do not re-query.
15. **After commit, outside the lock.** Write the `bid_attempts` row, metrics, logs and any enqueue. A failure here never changes the bid result.

### Requirements

| ID | Pri | Requirement | Test |
| --- | --- | --- | --- |
| HD-CON-01 | P0 | The bid transaction shall run at READ COMMITTED and its first statement shall be `SELECT ... FOR UPDATE` on the RFQ row. Before it, only immutable data (user identity) may be read. Invitation, standings, previous bid and RFQ times are read after the lock. | E-30 |
| HD-CON-02 | P0 | The service shall use the row returned by the locked SELECT (or `populate_existing=True` / `session.refresh`), never an RFQ object loaded earlier in the request by a dependency. One DB session per request. | E-30 |
| HD-CON-03 | P0 | The service shall read the database clock once after the lock (`decision_at`), use it for every comparison, and write it as `accepted_at` and as event `occurred_at`. The column default is not used (CHG-2). | E-31 |
| HD-CON-04 | P0 | Each RFQ keeps a counter `last_bid_seq`. Each accepted bid gets `bid_seq = last_bid_seq + 1` under the lock, `UNIQUE (rfq_id, bid_seq)`. Ranking order becomes total ASC, `bid_seq` ASC, supplier\_id ASC (CHG-1). | E-30, E-36 |
| HD-CON-05 | P1 | `decision_at` shall never be earlier than the RFQ's `last_decision_at`, so a backward clock step cannot make a later bid look earlier. A step over 1 s logs `CLOCK_ANOMALY` and raises an alert. | E-36 |
| HD-CON-06 | P0 | The transaction shall set `lock_timeout` (default 2 s), `statement_timeout` (3 s) and `idle_in_transaction_session_timeout` (5 s), all configurable. A lock timeout returns 503 `AUCTION_BUSY` with `Retry-After: 1`. This is a definitive "not accepted". | E-32 |
| HD-CON-07 | P0 | No network I/O inside the transaction: no Redis, HTTP or Celery. Target about 10 statements (send the SET LOCALs together, batch the event inserts) and 20 ms lock hold time when uncontended. | E-30 |
| HD-CON-08 | P1 | Bid path and read path use separate connection pools. A pool acquire timeout of 1 s returns 503 `OVERLOADED` (definitive). Polling load must never starve bidding. | E-32 |
| HD-CON-09 | P0 | `Idempotency-Key` is required (400 `IDEMPOTENCY_KEY_REQUIRED`), 8 to 128 chars of `[A-Za-z0-9_.:-]`. `bids.request_hash` is the SHA-256 of the canonical payload (normalized decimal strings, integers, ISO date, `confirm_large_drop`). The lookup runs before the time checks, so a replay of an accepted bid succeeds even after close (CHG-5). Same key with a different hash returns 409. Two concurrent duplicates: unique violation, rollback, re-read, replay. | E-33, E-34 |
| HD-CON-10 | P0 | Client rule: a timeout, network error, 5xx or `OUTCOME_UNKNOWN` means UNKNOWN, not failed. The UI shows "Confirming your bid…", retries the same key with backoff (1, 2, 4, 8 s) until success, a definitive 4xx, or auction end, then calls `GET /rfqs/{id}/bids/lookup?idempotency_key=` once. | E-35 |
| HD-CON-11 | P0 | Concurrent bids from two users of one supplier serialize like any others. The loser gets `BID_NOT_LOWER_THAN_PREVIOUS` with the supplier's own `previous_total`, and the UI refreshes it. | E-29 |
| HD-CON-12 | P0 | Cutoff authority stays `decision_at` after the lock (SRS BR-10, edge case 28). Every attempt records `received_at`, `lock_wait_ms` and `decided_at`, so a dispute can show whether a bid lost time to contention. A `lock_grace_ms` option is P2 and off by default. | E-31 |
| HD-CON-13 | P0 | A `bid_attempts` row shall be written for every bid request with its outcome code, in a separate short transaction after the bid transaction ends, so a rollback cannot erase it. It is not part of the auction event feed, so FR-BID-12 still holds. | E-32 |
| HD-CON-14 | P0 | A successful response is the receipt: `bid_id`, `bid_seq`, `accepted_at` (microseconds), `rfq_version`, `request_id`. Suppliers can list their own receipts. | E-33 |
| HD-CON-15 | P0 | `rfqs.version` increments on every committed state change (publish, bid, extension, activate, close, cancel). Events carry `rfq_version` and a gap-free per-RFQ `event_seq` (`UNIQUE (rfq_id, event_seq)`). Every writer (bid, worker, publish, cancel) takes the same RFQ row lock. Event cursors use `event_seq`, not the global id. | E-30, E-44 |
| HD-CON-16 | P0 | Inside one transaction, events are written in causal order: `BID_SUBMITTED`, then `RANK_CHANGED`, then `EXTENSION_APPLIED`, with consecutive `event_seq`. | E-30 |

**Throughput ceiling (estimate, validate with E-30).** One RFQ is serialized by design. At about 10 ms lock hold time that is roughly 100 accepted bids per second per RFQ. Different RFQs run in parallel, so total throughput scales with the number of live auctions. A real auction has tens of suppliers bidding a few times a minute, far below the ceiling. This is the answer to "how does it scale?" in R2.

## 4. Section B: Bid integrity and validation

Bids are immutable and strictly decreasing, so one bad bid cannot be undone. This section stops bad numbers, bad times and bad intent from getting in. Defaults for every new auction setting keep SRS behavior unchanged.

| ID | Pri | Requirement | Test |
| --- | --- | --- | --- |
| HD-BID-01 | P0 | Money is accepted only as a JSON string matching `^(0\|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$`. JSON numbers, exponents, `NaN`, `Infinity`, a leading `+`, leading zeros, spaces, thousands separators and 3+ decimals return 422 `MONEY_FORMAT_INVALID`. Nothing is ever rounded. | E-37 |
| HD-BID-02 | P0 | Each charge is at most `MAX_CHARGE` (default 1,000,000,000.00). The total must be greater than zero (CHG-4): 422 `TOTAL_MUST_BE_POSITIVE`. DB adds `CHECK (total_amount > 0)`. After insert the app asserts that the generated total equals its own Decimal sum. | E-37 |
| HD-BID-03 | P0 | RFQ currency must be on a whitelist of two-decimal ISO-4217 codes (USD, EUR, GBP, INR, SGD, AED, AUD, CAD, CHF, CNY, HKD, SAR). Others return 422 `CURRENCY_NOT_SUPPORTED`; zero- and three-decimal currencies wait for a per-currency exponent (P2). The UI formats with `Intl.NumberFormat` and adds in integer minor units, never with `Number`. | E-38 |
| HD-BID-04 | P0 | Transit days 0 to 365. `valid_until` on or after the service date (SRS) and at most 5 years after it. Violations return 422 `INVALID_QUOTE` with the field name. | E-37 |
| HD-BID-05 | P1 | Optional price rules, frozen at publish, defaults preserve SRS: `ceiling_total` (null = none) rejects totals above it with 409 `BID_ABOVE_CEILING`; `min_decrement_amount` (default 0.01, which equals "strictly lower" at two decimals) rejects smaller drops with 409 `BID_BELOW_MIN_DECREMENT`. | E-40, E-41 |
| HD-BID-06 | P0 | If `new_total < previous_total * (1 - large_drop_confirm_pct / 100)` (default 50), or for a first bid under a ceiling, below `ceiling * (1 - pct / 100)`, the server returns 409 `CONFIRMATION_REQUIRED` with `previous_total`, `submitted_total`, `drop_pct` and writes nothing. The client re-sends with `confirm_large_drop: true` and a new idempotency key, because the payload hash changes. | E-39 |
| HD-BID-07 | P0 | The bid form has a Review step: currency, each charge as parsed, total, own previous total, drop %. The idempotency key is generated when the supplier presses Confirm and reused for every retry of that exact payload. Editing any field creates a new key. The button is disabled while a request is in flight. | E-33 |
| HD-BID-08 | P0 | Amount inputs use `inputmode="decimal"`, accept digits and one `.`, strip commas only when they form valid thousands groups, and show "Use a dot as the decimal separator, e.g. 1250.50" for `1.250,50`. Never `parseFloat` or `Number` for money; send strings. | E-37 |
| HD-BID-09 | P0 | The bid endpoint is rate limited per user id, not per IP (suppliers share corporate NAT): default 30 requests per minute, burst 10. Idempotent replays and 401s do not count. 429 `RATE_LIMITED` with `Retry-After` is definitive. The limiter fails open if Redis is unreachable (log plus metric), because bid correctness never depends on Redis. | E-48 |
| HD-BID-10 | P2 | Optional `max_extensions` (null = unlimited). After the limit, bids are still accepted but never extend; the bid event records `extension_skipped: MAX_EXTENSIONS`. Forced close already bounds every auction. | n/a |
| HD-BID-11 | P0 | Every datetime in a request carries an offset (`Z` or `+05:30`). Naive values return 422 `TIMESTAMP_TIMEZONE_REQUIRED`. The backend never interprets local time. | E-42 |
| HD-BID-12 | P0 | The Create RFQ form shows each time in the buyer's zone with UTC beside it ("18:00 IST = 12:30 UTC"). It resolves DST gaps and overlaps with an IANA-aware library (Intl, date-fns-tz or Temporal); a non-existent local time is rejected in the UI. | UI test |
| HD-BID-13 | P0 | Timestamps are serialized as RFC 3339 UTC with microseconds (`2026-11-16T12:55:03.231456Z`). The UI truncates, never rounds up, so it never shows a close later than the database holds. | unit |
| HD-BID-14 | P1 | X and Y are 1 to 1,440 minutes. `forced_close_at - start_at` is at most 30 days. Do not reject short auctions or X longer than the auction; show a UI warning only. | E-43 |

### Copy-paste: strict money parsing

```python
import re
from decimal import Decimal

MONEY_RE = re.compile(r"(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?")

def parse_money(value) -> Decimal:
    # JSON numbers arrive as int/float; only strings are allowed.
    if not isinstance(value, str) or not MONEY_RE.fullmatch(value):
        raise ValueError("MONEY_FORMAT_INVALID")
    return Decimal(value)

def is_large_drop(new_total: Decimal, previous: Decimal, pct: int) -> bool:
    return new_total < previous * (Decimal(100) - pct) / Decimal(100)
```

Use it in a Pydantic `field_validator(..., mode="before")` so a float never reaches `Decimal`.

## 5. Section C: Auction lifecycle and extension logic

The bid endpoint already enforces the deadline by itself (SRS §6.4), so the worker is bookkeeping. What fails in production is the bookkeeping: closing from a stale read, closing twice, or closing just after an extension committed. These rules close those gaps.

| ID | Pri | Requirement | Test |
| --- | --- | --- | --- |
| HD-LIFE-01 | P0 | One pure function `effective_status(rfq, now)` implements SRS §5.3 and is the only place status is derived. API reads, the bid endpoint and the worker all call it. Listings filter by the SQL equivalent below (time predicates), never by `status = 'ACTIVE'`. | E-45 |
| HD-LIFE-02 | P0 | The worker selects due rows with `FOR UPDATE SKIP LOCKED` (`LIMIT 100`), then re-evaluates `effective_status` with a fresh clock reading after the lock, applies the transition and writes the event. It never runs `UPDATE ... WHERE id = :id` from an earlier unlocked read. A row held by a bid transaction is skipped and picked up on the next run (at most 5 s later); this is safe because bids are rejected by time anyway. | E-46 |
| HD-LIFE-03 | P0 | Terminal events are unique: a partial unique index on `(rfq_id)` for `AUCTION_CLOSED`, `AUCTION_FORCE_CLOSED` and `AUCTION_CANCELLED`, written with `INSERT ... ON CONFLICT DO NOTHING`. Re-running or parallelizing the close task cannot duplicate them. | E-44 |
| HD-LIFE-04 | P0 | A closure event's `occurred_at` is the logical instant (`current_close_at` or `forced_close_at`), not the worker's wall time. `details` holds `detected_at` and `lag_ms`. The audit trail shows the real deadline even when the worker was late. | E-45 |
| HD-LIFE-05 | P0 | Celery Beat runs as exactly one instance. Tasks are idempotent. Set `acks_late=True`, `task_reject_on_worker_lost=True`, `task_time_limit=30`, `task_soft_time_limit=20`, `autoretry_for=(OperationalError,)`, `retry_backoff=True`, `max_retries=5`. Redis `visibility_timeout` is longer than `task_time_limit`. Task failures are logged at ERROR and counted. | E-47 |
| HD-LIFE-06 | P0 | Persisted status may lag; derived status is authoritative and is what the API returns. A metric `auction_status_lag_seconds` reports the largest gap for any RFQ whose stored status is `SCHEDULED` or `ACTIVE` but whose close has passed. Alert above 15 s. | E-45 |
| HD-LIFE-07 | P0 | Extension math runs on timezone-aware UTC values: `new_close = LEAST(current_close_at + make_interval(mins => Y), forced_close_at)`; apply only if `new_close > current_close_at`. `EXTENSION_APPLIED.details` holds `bid_id`, `matched[]`, `x`, `y`, `window_start`, `decision_at`, `previous_close_at`, `new_close_at`, `forced_close_at`, `capped`, `extension_number`. | AT-02, AT-06 |
| HD-LIFE-08 | P0 | Trigger inputs are full supplier-to-rank maps computed before and after the insert in the same transaction. `ANY_RANK_CHANGE` compares every supplier, including a new entrant. `L1_CHANGE` treats none-to-first as a change; the current L1 lowering its own price is not one. Unit-test with 0, 1, 2 and 3 suppliers and with ties. | unit |
| HD-LIFE-09 | P0 | Window boundaries follow SRS FR-EXT-02: `close - X` inclusive, `close` exclusive. Unit-test with an injected clock at `close - X`, `close - X - 1 µs`, `close - 1 µs` and `close`. | unit |
| HD-LIFE-10 | P0 | Publish and cancel are compare-and-set under the RFQ lock (`UPDATE ... WHERE status = :expected`). Publish re-validates everything with the DB clock: times, at least one invitee, all invitees active. A second publish click by the same buyer returns 200 with the current state, not 409. Publish assigns anonymous labels (HD-SEC-05) before setting `published_at`. | integration |
| HD-LIFE-11 | P1 | Once `current_close_at = forced_close_at` the detail page shows "Final window, no further extensions". The configuration panel shows extensions used and the latest possible end (forced close). | UI test |

### SQL for HD-LIFE-01 (status derivation)

```sql
CASE
  WHEN r.status IN ('DRAFT', 'CANCELLED') THEN r.status
  WHEN :now >= r.forced_close_at           THEN 'FORCE_CLOSED'
  WHEN :now >= r.current_close_at          THEN 'CLOSED'
  WHEN :now >= r.start_at                  THEN 'ACTIVE'
  ELSE 'SCHEDULED'
END
```

### SQL for HD-LIFE-02 (worker pick-up)

```sql
SELECT id
FROM rfqs
WHERE status IN ('SCHEDULED', 'ACTIVE')
  AND ( (status = 'SCHEDULED' AND clock_timestamp() >= start_at)
     OR  clock_timestamp() >= LEAST(current_close_at, forced_close_at) )
ORDER BY LEAST(current_close_at, forced_close_at)
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

The existing index `(status, current_close_at)` serves this query. After each locked row, call `effective_status` again before writing.

## 6. Section D: Real-time delivery, scalability and performance

Polling every 3 seconds is fine for the assignment (SRS decision 12), but only if the client is never wrong about time or order, and the server answers most polls without touching the ranking query. These rules make 3-second polling safe.

| ID | Pri | Requirement | Test |
| --- | --- | --- | --- |
| HD-RT-01 | P0 | Every read for an active auction returns `server_now` (DB clock, microseconds), `version`, `status`, `current_close_at`, `forced_close_at`. The client keeps an anchor (`server_now + rtt/2` at a `performance.now()` reading) and counts down from `performance.now()`, never from `Date.now()`. At zero it shows "Closing…", polls immediately, and does not disable the form by itself (SRS §7.4). | E-51 |
| HD-RT-02 | P0 | Monotonic guard: the client ignores any response whose `version` is lower than the one already rendered (out-of-order responses, proxy, replica lag). | E-50 |
| HD-RT-03 | P0 | The standings endpoint returns a weak ETag `W/"<version>:<effective_status>:<viewer>"` where viewer is the supplier id or `buyer`. A matching `If-None-Match` returns 304 after a primary-key lookup and before the ranking query. Status is in the tag because it changes with time before the worker bumps the version. | E-49 |
| HD-RT-04 | P0 | Every authenticated response sends `Cache-Control: no-store` and `Vary: Authorization`; nothing is cached by a CDN or proxy. Because `no-store` disables the browser cache, the client keeps the last ETag in memory and sends `If-None-Match` itself; on 304 it keeps its in-memory state. | E-54 |
| HD-RT-05 | P0 | Poll hygiene: a `setTimeout` chain, not `setInterval`; one in-flight request per tab (`AbortController`, aborted on unmount); 3 s with ±500 ms jitter; on errors back off 6, 12, then 15 s and reset on success; hidden tab polls every 10 s but refetches immediately on `visibilitychange`, `focus` and `online`; stop after a terminal status once the final snapshot is fetched. | E-50, E-52 |
| HD-RT-06 | P1 | Standings come from denormalized `rfq_suppliers.current_bid_id`, `current_total`, `current_bid_seq` (updated under the lock) with an index on `(rfq_id, current_total, current_bid_seq, supplier_id)`. Cost is O(invited suppliers), not O(all bids). Bid history uses cursor pagination on `bid_seq`. | E-49 |
| HD-RT-07 | P1 | Optional response cache keyed `(rfq_id, version, status, viewer)` with a 1 s TTL. The version in the key means no invalidation logic. It fails open; correctness never depends on it. | n/a |
| HD-RT-08 | P2 | Read replicas never serve the bid path or the post-bid response. Polling may use one only with a replication-lag alarm under 500 ms, the HD-RT-02 guard, and never in the last X minutes of any auction. Not built for the assignment. | n/a |
| HD-RT-09 | P2 | Upgrade path for the HLD: SSE `GET /rfqs/{id}/stream` that pushes `{version}` using PostgreSQL `LISTEN/NOTIFY` (Redis pub/sub across API instances). Clients fetch a snapshot on notify; polling stays as fallback. | n/a |
| HD-RT-10 | P0 | State the performance budget below in the README and measure it with a load test. | load test |
| HD-RT-11 | P0 | Split the poll: a light `GET /rfqs/{id}/standings` every tick (with ETag), and `GET /rfqs/{id}/events?after_seq=` only when `version` changed. Bid history loads on demand. No endpoint returns an unbounded list. | E-49 |

### Performance budget (targets; confirm with your own load test)

| Operation | p50 | p99 | Condition |
| --- | --- | --- | --- |
| `POST /bids`, uncontended | 40 ms | 250 ms | Local Docker, warm pool |
| `POST /bids`, 50 concurrent on one RFQ | 250 ms | 800 ms | Serialized by the row lock |
| `GET /standings`, 304 | 10 ms | 50 ms | Primary-key lookup only |
| `GET /standings`, 200 | 30 ms | 150 ms | 50 suppliers |
| Closure persisted after logical close | n/a | 7 s | Beat 5 s plus run; bids are rejected instantly regardless |

The SRS target (p95 under 500 ms with 100 concurrent requests spread across RFQs) still applies and is easier than the same-RFQ row above. Reference run: the transaction order in section 3, tested on a shared sandbox with a new connection per bid and 50 suppliers bidding on one RFQ, gave p50 of 190 to 255 ms and p99 of 620 to 770 ms over three runs. A connection pool should do better.

### Why the ETag matters (estimate)

| Case | Clients | Polls per second |
| --- | --- | --- |
| 1 auction, 20 suppliers and the buyer | 21 | 7 |
| 1 auction, 200 suppliers | 201 | 67 |
| 100 live auctions, 20 suppliers each | 2,100 | 700 |

At 700 polls per second, if 90% are 304 responses that cost one primary-key lookup, only about 70 per second reach the ranking query.

### Copy-paste: clock anchor and poll loop (TypeScript)

```ts
let anchor = { serverMs: 0, perf: 0 };
const serverNow = () => anchor.serverMs + (performance.now() - anchor.perf);

async function poll(signal: AbortSignal, state: { version: number; etag?: string }) {
  const t0 = performance.now();
  const res = await fetch(`/api/v1/rfqs/${id}/standings`, {
    signal,
    headers: state.etag ? { "If-None-Match": state.etag } : {},
  });
  const t1 = performance.now();
  if (res.status === 304) return;
  const body = await res.json();
  if (body.version < state.version) return;           // HD-RT-02
  anchor = { serverMs: Date.parse(body.server_now) + (t1 - t0) / 2, perf: t1 };
  state.version = body.version;
  state.etag = res.headers.get("ETag") ?? undefined;
  render(body);
}

async function loop(signal: AbortSignal, state: { version: number; etag?: string }) {
  let fails = 0;
  while (!signal.aborted) {
    try { await poll(signal, state); fails = 0; } catch { fails++; }
    const base = fails ? Math.min(3000 * 2 ** fails, 15000) : 3000;
    const wait = document.hidden ? 10000 : base + (Math.random() - 0.5) * 1000;
    await new Promise((r) => setTimeout(r, wait));
  }
}
```

## 7. Section E: Security, abuse prevention and compliance

SRS §11 sets the baseline (SEC-01 to SEC-10). The items below are the gaps that actually cause incidents on bidding platforms: sessions that expire in the last 30 seconds, competitor data leaking through side channels, and rules that exist only in application code. To avoid clashing with the SRS IDs, these are numbered `HD-SEC-nn`.

| ID | Pri | Requirement | Test |
| --- | --- | --- | --- |
| HD-SEC-01 | P0 | A 401 never loses user input. The bid form state and its idempotency key stay in memory; the UI says "Session expired. Sign in again; your bid was NOT submitted" and, after login, resubmits once with the same key. A 401 is definitive because authentication runs before the transaction. | E-53 |
| HD-SEC-02 | P1 | Refresh flow: 15-minute access token plus `POST /auth/refresh` with a rotating 8-hour refresh token in an httpOnly, Secure, SameSite=Lax cookie. The client refreshes at 80% of lifetime and retries once on the first 401. JWT `exp` is validated with 30 s leeway. | E-53 |
| HD-SEC-03 | P0 | Login uses Argon2id, returns the same error and similar timing for an unknown email and a wrong password, and allows 5 failures per 15 minutes per (email, IP) with a growing delay. The limiter fails open if Redis is down. | unit |
| HD-SEC-04 | P0 | Separate response models per role and endpoint (`BuyerStandingRow`, `SupplierSelfRow`, `SupplierPeerRow`, `BuyerEvent`, `SupplierEvent`). Routes never return ORM objects or raw dicts. A supplier-facing event carries labels and ranks only: no supplier id, user id, name, line items or idempotency key. | E-54 |
| HD-SEC-05 | P0 | Anonymous labels are assigned at publish as a random permutation ("Supplier 1" to "Supplier N"), stored in `rfq_suppliers.anon_label`, `UNIQUE (rfq_id, anon_label)`, stable for the whole auction. Never derived from invite order, UUID or a hash. The supplier's own row is flagged `is_self: true`. | E-54 |
| HD-SEC-06 | P0 | Uniform 404 (CHG-3): unknown RFQ, another buyer's RFQ and an uninvited supplier return the identical `RFQ_NOT_FOUND` body through the same lookup path with no early exit. A role mismatch on a route is 403. `/docs` and `/openapi.json` are disabled when `APP_ENV=production`. | E-55 |
| HD-SEC-07 | P0 | Input hardening: body cap 32 KB (413); `application/json` only (415); Pydantic `extra="forbid"` so `total_amount`, `supplier_id`, `rank` and `accepted_at` are rejected; length limits and trimmed, NFC-normalized text; React renders names as text, never `dangerouslySetInnerHTML`; CORS allows only `FRONTEND_ORIGIN`; headers `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, CSP `frame-ancestors 'none'`, HSTS in production. | E-61, E-62 |
| HD-SEC-08 | P0 | No secret in the repo, only `.env.example`. The API refuses to start when `APP_ENV` is not `development` and `JWT_SECRET_KEY` is the default or under 32 bytes. Seed passwords exist only in the dev seed script. | unit |
| HD-SEC-09 | P0 | Logs carry request id, user id, RFQ id, outcome code and durations. Never log passwords, tokens, full idempotency keys (first 8 characters only) or bid amounts at INFO. Amounts live in the audit tables. | review |
| HD-SEC-10 | P0 | Participant policy: (a) inside the bid transaction, after the lock, re-read user active, supplier active and invitation `ACTIVE`; failure returns 403 `SUPPLIER_INACTIVE`. (b) Deactivation or revocation mid-auction stops new bids, but accepted bids stay in the standings. (c) Invitees cannot change after publish (BR-19); revocation is admin-only and writes an `INVITATION_REVOKED` event. (d) Several users of one supplier share that supplier's single current bid. | E-60 |
| HD-SEC-11 | P0 | The DB enforces supplier-user integrity: `UNIQUE (id, supplier_id)` on `users` and a composite FK from `bids (submitted_by_user_id, supplier_id)`, so a bid cannot be attributed to a user of another supplier. | E-56 |
| HD-SEC-12 | P0 | Defense in depth in the DB (SQL in section 9): the app role has `INSERT` and `SELECT` only on `bids`, `auction_events`, `bid_attempts`; a trigger rejects a bid outside the RFQ window; a trigger freezes schedule and currency after publish and forbids moving the close backwards or past forced close; append-only triggers on `bids` and `auction_events`; config and invitees reject inserts and deletes after publish. Migrations run as a separate owner role. | E-56, E-57 |
| HD-SEC-13 | P1 | Tamper evidence: each event stores `prev_hash` and `event_hash = sha256(prev_hash \|\| canonical_json(event))`, computed under the RFQ lock. `scripts/verify_chain.py` recomputes the chain per RFQ. | E-63 |
| HD-SEC-14 | P2 | README roadmap: retention (for example 7 years) for bids and events, signed export of an RFQ audit trail, pseudonymization instead of deletion for erasure requests, MFA for buyers, per-service least-privilege DB roles. | n/a |

### The leak canary test (HD-SEC-04, HD-SEC-05)

Seed suppliers with marker names and ids you can search for (for example `CANARY-SUPPLIER-B` and its UUID). Log in as Supplier A, call every supplier-facing endpoint (RFQ, standings, bids, events, errors, 404s, `/me`), and assert that no marker, no competitor UUID and no competitor line item appears anywhere in any response body or header. Run it in CI. This one test catches most privacy regressions.
