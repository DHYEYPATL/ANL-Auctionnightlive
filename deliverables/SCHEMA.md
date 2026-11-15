# Database Schema Design — ANL (Auction Night Live)

## Conventions

- **Primary keys:** UUID (`gen_random_uuid()`), except `auction_events` and `bid_attempts` which use `BIGSERIAL` for stable chronological cursors.
- **Timestamps:** `TIMESTAMPTZ` stored in UTC. `clock_timestamp()` is the server default — never a client timestamp.
- **Money:** `NUMERIC(14,2)` everywhere. Never `FLOAT`, `REAL`, or JavaScript `number` for authoritative values.
- **Append-only:** `bids` and `auction_events` have DB triggers that reject `UPDATE` and `DELETE`.
- **Migrations:** Alembic (`alembic upgrade head`). Never alter tables manually.

---

## Entity Relationship Overview

```
suppliers ──< users (supplier_id FK, nullable for buyers)
     │
     └──< rfq_suppliers >── rfqs ──< auction_configs (1:1)
                                │
                                └──< bids ──< auction_events
                                │
                                └──< bid_attempts
```

---

## Table Definitions

### `suppliers`

Represents a supplier company. Multiple user accounts can belong to one supplier.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | `gen_random_uuid()` |
| `display_name` | `VARCHAR(200)` NOT NULL | Shown to buyers in standings |
| `legal_name` | `VARCHAR(250)` | Optional for MVP |
| `is_active` | `BOOLEAN` NOT NULL | Default `true`. Deactivation stops new bids immediately (re-checked inside bid tx). |
| `created_at` | `TIMESTAMPTZ` NOT NULL | `clock_timestamp()` |

---

### `users`

Authentication and role records. Buyers have `supplier_id = NULL`. Supplier users link to their company.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `email` | `VARCHAR(320)` NOT NULL UNIQUE | Lowercased, trimmed |
| `password_hash` | `TEXT` NOT NULL | Argon2id — never plain text |
| `display_name` | `VARCHAR(200)` NOT NULL | |
| `role` | `VARCHAR(20)` NOT NULL | CHECK IN (`BUYER`, `SUPPLIER`) |
| `supplier_id` | `UUID` FK → `suppliers.id` | NULL for buyers |
| `is_active` | `BOOLEAN` NOT NULL | Default `true` |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

**Constraint:** `UNIQUE(id, supplier_id)` — enables composite FK from `bids` to verify user belongs to the bidding supplier (HD-SEC-11).

---

### `rfqs`

The core auction record. All schedule and config fields freeze on publish.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `buyer_id` | `UUID` NOT NULL FK → `users.id` | |
| `name` | `VARCHAR(250)` NOT NULL | |
| `reference_id` | `VARCHAR(100)` NOT NULL | UNIQUE per buyer |
| `currency` | `CHAR(3)` NOT NULL | ISO-4217, two-decimal currencies only |
| `service_date` | `DATE` NOT NULL | Bid `valid_until` must be ≥ this |
| `start_at` | `TIMESTAMPTZ` NOT NULL | |
| `scheduled_close_at` | `TIMESTAMPTZ` NOT NULL | |
| `current_close_at` | `TIMESTAMPTZ` NOT NULL | Starts = `scheduled_close_at`; advances on extension |
| `forced_close_at` | `TIMESTAMPTZ` NOT NULL | Absolute hard stop — no extension may exceed this |
| `status` | `VARCHAR(20)` NOT NULL | CHECK IN (`DRAFT`,`SCHEDULED`,`ACTIVE`,`CLOSED`,`FORCE_CLOSED`,`CANCELLED`) |
| `published_at` | `TIMESTAMPTZ` | NULL until publish |
| `version` | `INTEGER` NOT NULL | Increments on every state change — used by ETag and monotonic guard |
| `last_bid_seq` | `INTEGER` NOT NULL | Tracks the highest `bid_seq` issued |
| `last_event_seq` | `INTEGER` NOT NULL | Tracks the highest `event_seq` issued |
| `last_decision_at` | `TIMESTAMPTZ` | Used in `GREATEST(clock_timestamp(), last_decision_at)` for clock monotonicity |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

**Constraints:**
- `start_at < scheduled_close_at`
- `scheduled_close_at < forced_close_at`
- `current_close_at <= forced_close_at`
- `UNIQUE(buyer_id, reference_id)`

**DB trigger:** `trg_rfq_immutable` — rejects UPDATE of `start_at`, `scheduled_close_at`, `forced_close_at`, `currency` after `published_at IS NOT NULL`. Also rejects moving `current_close_at` backward or past `forced_close_at`.

---

### `auction_configs`

British Auction configuration. 1:1 with `rfqs`. Frozen after publish.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `rfq_id` | `UUID` NOT NULL UNIQUE FK → `rfqs.id` | |
| `trigger_window_minutes` | `SMALLINT` NOT NULL | CHECK > 0. Final X minutes during which bids can extend. |
| `extension_duration_minutes` | `SMALLINT` NOT NULL | CHECK > 0. Minutes added per qualifying extension. |
| `triggers` | `TEXT[]` NOT NULL | Non-empty array of `BID_RECEIVED`, `ANY_RANK_CHANGE`, `L1_CHANGE` |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

---

### `rfq_suppliers`

Invitation join table. Only `ACTIVE` rows grant access and bidding rights.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `rfq_id` | `UUID` NOT NULL FK → `rfqs.id` | |
| `supplier_id` | `UUID` NOT NULL FK → `suppliers.id` | |
| `invitation_status` | `VARCHAR(20)` NOT NULL | CHECK IN (`ACTIVE`, `DECLINED`, `REVOKED`). Default `ACTIVE`. |
| `anon_label` | `VARCHAR(50)` | Random label assigned at publish (e.g. "Supplier 3"). UNIQUE per RFQ. |
| `current_bid_id` | `UUID` FK → `bids.id` | Denormalized — updated on every accepted bid for O(suppliers) standings |
| `current_total` | `NUMERIC(14,2)` | Denormalized current bid total |
| `current_bid_seq` | `INTEGER` | Denormalized bid_seq for tie-break in rankings index |
| `invited_at` | `TIMESTAMPTZ` NOT NULL | |

**Constraints:** `UNIQUE(rfq_id, supplier_id)`, `UNIQUE(rfq_id, anon_label)`

**Index:** `(rfq_id, current_total, current_bid_seq, supplier_id)` — O(invited suppliers) standings read without scanning all bids.

---

### `bids`

Immutable accepted bid record. Never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `rfq_id` | `UUID` NOT NULL FK → `rfqs.id` | |
| `supplier_id` | `UUID` NOT NULL FK → `suppliers.id` | |
| `submitted_by_user_id` | `UUID` NOT NULL FK → `users.id` | |
| `freight_charge` | `NUMERIC(14,2)` NOT NULL | CHECK >= 0 |
| `origin_charge` | `NUMERIC(14,2)` NOT NULL | CHECK >= 0 |
| `destination_charge` | `NUMERIC(14,2)` NOT NULL | CHECK >= 0 |
| `total_amount` | `NUMERIC(14,2)` NOT NULL | CHECK > 0. Computed by service, asserted post-insert. |
| `transit_time_days` | `INTEGER` NOT NULL | CHECK >= 0 AND <= 365 |
| `valid_until` | `DATE` NOT NULL | Must be >= `rfqs.service_date` |
| `idempotency_key` | `VARCHAR(128)` NOT NULL | Client-generated, 8–128 chars `[A-Za-z0-9_.:-]` |
| `bid_seq` | `INTEGER` | Per-RFQ monotonic counter — tie-break in ranking after total_amount |
| `request_hash` | `VARCHAR(64)` | SHA-256 of canonical payload — detects key reuse with different payload |
| `close_at_before` | `TIMESTAMPTZ` | `current_close_at` at time of acceptance — dispute evidence |
| `close_at_after` | `TIMESTAMPTZ` | `current_close_at` after any extension this bid caused |
| `received_at` | `TIMESTAMPTZ` | App clock at request receipt — before lock |
| `lock_wait_ms` | `INTEGER` | Milliseconds waited for the RFQ row lock — dispute evidence |
| `accepted_at` | `TIMESTAMPTZ` NOT NULL | Explicitly set to `decision_at` (not column default) |

**Constraints:**
- `UNIQUE(rfq_id, supplier_id, idempotency_key)`
- `UNIQUE(rfq_id, bid_seq)`
- Charge checks (>= 0), total > 0, transit checks

**DB triggers:**
- `trg_bid_window` — rejects INSERT outside auction window (defense-in-depth)
- `trg_bid_no_update`, `trg_bid_no_delete` — append-only enforcement

**Ranking query** (using denormalized path):
```sql
SELECT *, ROW_NUMBER() OVER (
    ORDER BY current_total ASC, current_bid_seq ASC, supplier_id ASC
) AS rank_number
FROM rfq_suppliers
WHERE rfq_id = :rfq_id AND invitation_status = 'ACTIVE' AND current_bid_id IS NOT NULL
ORDER BY rank_number
```

---

### `auction_events`

Append-only audit log. Every significant state change is recorded here.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL` PK | Stable chronological cursor |
| `rfq_id` | `UUID` NOT NULL FK → `rfqs.id` | |
| `actor_user_id` | `UUID` FK → `users.id` | NULL for system events |
| `bid_id` | `UUID` FK → `bids.id` | Present on bid/rank/extension events |
| `event_type` | `VARCHAR(40)` NOT NULL | See event types below |
| `occurred_at` | `TIMESTAMPTZ` NOT NULL | Logical time (e.g. forced_close_at for FORCE_CLOSED), not wall time |
| `details` | `JSONB` NOT NULL | Structured event metadata |
| `event_seq` | `INTEGER` | Per-RFQ gap-free sequence. `UNIQUE(rfq_id, event_seq)`. |
| `rfq_version` | `INTEGER` | RFQ version at time of event |
| `prev_hash` | `VARCHAR(64)` | SHA-256 of previous event in chain |
| `event_hash` | `VARCHAR(64)` | SHA-256(prev_hash ∥ canonical_json(event)) — tamper evidence |

**Event types:**

| Type | When | Key details fields |
|---|---|---|
| `PUBLISHED` | Buyer publishes | `status` |
| `BID_SUBMITTED` | Bid accepted | `total`, `bid_seq` |
| `RANK_CHANGED` | Any rank number shifts | `supplier_id`, `from_rank`, `to_rank` |
| `EXTENSION_APPLIED` | Auction extended | `previous_close_at`, `new_close_at`, `matched_reasons`, `x`, `y`, `capped` |
| `AUCTION_CLOSED` | Normal close | `final_close_at`, `detected_at`, `lag_ms` |
| `AUCTION_FORCE_CLOSED` | Hard stop reached | `final_close_at`, `detected_at`, `lag_ms` |
| `AUCTION_CANCELLED` | Buyer cancels before start | — |

**DB triggers:** `trg_event_no_update`, `trg_event_no_delete` — append-only.

**Partial unique index:**
```sql
CREATE UNIQUE INDEX events_terminal_unique
ON auction_events (rfq_id, event_type)
WHERE event_type IN ('AUCTION_CLOSED', 'AUCTION_FORCE_CLOSED', 'AUCTION_CANCELLED')
```
Guarantees exactly one terminal event per RFQ regardless of worker retries.

---

### `bid_attempts`

Written **outside** the bid transaction (in a separate short transaction after commit). Records every bid request regardless of outcome — cannot be lost on rollback. Used for dispute resolution.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL` PK | |
| `rfq_id` | `UUID` FK → `rfqs.id` | |
| `supplier_id` | `UUID` FK → `suppliers.id` | |
| `user_id` | `UUID` FK → `users.id` | |
| `bid_id` | `UUID` FK → `bids.id` | NULL if rejected |
| `idempotency_key` | `VARCHAR(128)` | |
| `idempotency_key_prefix` | `VARCHAR(8)` | First 8 chars only — never log full key |
| `outcome` | `VARCHAR(60)` NOT NULL | `ACCEPTED`, `REPLAYED`, `AUCTION_CLOSED`, `BID_NOT_LOWER_THAN_PREVIOUS`, `AUCTION_BUSY`, `UNKNOWN`, etc. |
| `received_at` | `TIMESTAMPTZ` NOT NULL | App clock when request arrived |
| `decided_at` | `TIMESTAMPTZ` | DB clock when decision was made |
| `lock_wait_ms` | `INTEGER` | Time spent waiting for RFQ row lock |
| `total_ms` | `INTEGER` | Full request duration |
| `request_hash` | `VARCHAR(64)` | SHA-256 of canonical payload |
| `details` | `JSONB` NOT NULL | `request_id`, additional context |

---

## Indexes

| Table | Index | Purpose |
|---|---|---|
| `rfqs` | `(buyer_id, status, created_at DESC)` | Buyer listing |
| `rfqs` | `(status, current_close_at)` | Worker pickup of due auctions |
| `rfqs` | `LEAST(current_close_at, forced_close_at)` WHERE status IN ('SCHEDULED','ACTIVE') | Partial index for fast worker pickup |
| `rfq_suppliers` | `(supplier_id, invitation_status, rfq_id)` | Supplier listing and eligibility checks |
| `rfq_suppliers` | `(rfq_id, current_total, current_bid_seq, supplier_id)` | O(suppliers) standings read |
| `bids` | `(rfq_id, supplier_id, accepted_at DESC, id DESC)` | Latest bid per supplier |
| `bids` | `(rfq_id, total_amount, accepted_at)` | Fallback ranking / history |
| `bids` | `(rfq_id, bid_seq)` | bid_seq cursor pagination |
| `auction_events` | `(rfq_id, id DESC)` | Activity feed cursor |
| `auction_events` | `(rfq_id, event_seq)` | Gap-free event cursor |
| `bid_attempts` | `(rfq_id, received_at DESC)` | Dispute lookup by RFQ |
| `bid_attempts` | `(supplier_id, received_at DESC)` | Supplier receipt history |

---

## Migrations

4 Alembic migrations applied in order:

| Revision | Description |
|---|---|
| `0001` | Initial schema — all 7 tables, indexes, check constraints |
| `0002` | Hardening — `bid_seq`, `event_seq`, `version`, `anon_label`, `bid_attempts`, composite FK, DB triggers |
| `0003` | Denormalized standings — `current_bid_id`, `current_total`, `current_bid_seq` on `rfq_suppliers` |
| `0004` | Performance indexes — `bid_seq` index, `event_seq` index, partial active-auction index |
