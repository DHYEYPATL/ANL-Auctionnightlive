# Requirements: ANL — Auction Night Live

## Introduction

ANL (Auction Night Live) is a role-based RFQ platform with a British reverse-auction engine. A buyer creates a Request for Quotation, invites suppliers, configures an auto-extension auction, and publishes it. Invited suppliers compete by submitting progressively lower bids. The system ranks suppliers in real time, automatically extends the closing window when configured activity occurs within the trigger period, and enforces a hard forced-close timestamp that no extension can exceed.

The product is built on FastAPI / PostgreSQL / Redis + Celery on the backend and React + TypeScript on the frontend, delivered via Docker Compose. PostgreSQL is the single authoritative store; every bid acceptance, rank change, extension, and closure happens inside a serialized database transaction using the database clock. Redis carries Celery jobs only. The frontend polls active auctions every 3 seconds.

The UI presents a premium dark experience — rich layered surfaces, glassmorphism panels, animated countdowns, rank-change transitions, and a Spline 3D accent — designed to feel like the Apple ecosystem applied to B2B procurement.

---

## Glossary

| Term | Definition |
|---|---|
| RFQ | Request for Quotation — created by a buyer, sent to invited suppliers. |
| British Auction | Open reverse auction where suppliers lower their quote totals over time. |
| Bid | An immutable accepted quote submission from one supplier for one RFQ. |
| Current bid | The latest accepted bid for a supplier in a given RFQ. |
| L1 / L2 / L3 | Unique sequential rank labels ordered by total price ascending. |
| Trigger window (X) | The final X minutes before `current_close_at` during which a bid can extend the auction. |
| Extension duration (Y) | Minutes added to `current_close_at` when a trigger fires. |
| Forced close | Absolute hard-stop timestamp — no extension may move `current_close_at` past it. |
| Current close | The effective closing timestamp after zero or more extensions. |
| L1 change | The identity of the L1 supplier changes after a newly accepted bid. |
| Rank change | At least one supplier's rank number differs between pre-bid and post-bid standings. |
| UTC | Canonical timezone for all persisted timestamps and server-side comparisons. |
| Idempotency key | Client-generated UUID header ensuring a network retry cannot create a duplicate accepted bid. |

---

## Requirement 1: User Authentication and Role Management

**User Story:** As a user (buyer or supplier), I want to log in with email and password and receive a session token, so that every subsequent request is authenticated and scoped to my role.

### Acceptance Criteria

1. WHEN a user POSTs valid credentials to `/api/v1/auth/login`, THEN the system returns a signed short-lived JWT access token and the user's role.
2. WHEN a request is made to any protected route without a valid token, THEN the API returns HTTP 401 `UNAUTHENTICATED`.
3. WHEN a user's role is `BUYER`, THEN buyer-only routes are accessible and supplier-only routes return HTTP 403 `FORBIDDEN`.
4. WHEN a user's role is `SUPPLIER`, THEN supplier-only routes are accessible and buyer-only routes return HTTP 403 `FORBIDDEN`.
5. WHEN a user GETs `/api/v1/me` with a valid token, THEN the response includes user ID, display name, role, and supplier_id (null for buyers).
6. WHEN a password is stored, THEN it is hashed using Argon2id or bcrypt — plain-text passwords are never persisted or logged.
7. WHEN the auth endpoint receives more than the configured rate limit of requests from one IP, THEN HTTP 429 `RATE_LIMITED` is returned.
8. WHEN a token is expired or malformed, THEN the API returns HTTP 401 and does not reveal internal details.

### Correctness Properties

- PROPERTY: For every user record in the database, `password_hash` is never the plain-text password string.
- PROPERTY: Every protected endpoint, when called without a token, always returns 401 regardless of HTTP method.

---

## Requirement 2: RFQ Creation (Buyer)

**User Story:** As a buyer, I want to create a draft RFQ with auction configuration and an invited supplier list, so that I can prepare and review it before publishing.

### Acceptance Criteria

1. WHEN a buyer POSTs to `/api/v1/rfqs` with valid fields, THEN the system creates the RFQ in `DRAFT` state and returns HTTP 201 with `rfq_id`, `status: DRAFT`, and `current_close_at` initialized to `scheduled_close_at`.
2. WHEN `start_at >= scheduled_close_at`, THEN the API returns HTTP 400 with field-level message "Bid start must be earlier than bid close."
3. WHEN `scheduled_close_at >= forced_close_at`, THEN the API returns HTTP 400 with field-level message "Forced close must be later than the scheduled bid close."
4. WHEN `trigger_window_minutes < 1` or `extension_duration_minutes < 1`, THEN the API returns HTTP 400 with the corresponding validation message.
5. WHEN `triggers` is empty or contains an invalid value, THEN the API returns HTTP 400 "Select at least one extension trigger."
6. WHEN any charge field has more than 2 decimal places or is negative, THEN the API returns HTTP 422 `INVALID_QUOTE`.
7. WHEN the `reference_id` already exists for the same buyer, THEN the API returns HTTP 400 with a uniqueness error.
8. WHEN a draft RFQ is successfully created, THEN all supplied fields are persisted to `rfqs` and `auction_configs` tables and are retrievable via GET.

### Correctness Properties

- PROPERTY: For every persisted RFQ, `start_at < scheduled_close_at < forced_close_at` holds.
- PROPERTY: `current_close_at` always equals `scheduled_close_at` immediately after creation.
- PROPERTY: `trigger_window_minutes >= 1` and `extension_duration_minutes >= 1` for every persisted `auction_configs` row.

---

## Requirement 3: RFQ Publishing and Lifecycle

**User Story:** As a buyer, I want to publish my draft RFQ so that invited suppliers can view and bid on it, with the auction state driven by the database clock.

### Acceptance Criteria

1. WHEN a buyer POSTs to `/api/v1/rfqs/{rfq_id}/publish` and `database_now < start_at`, THEN the RFQ transitions to `SCHEDULED` and a `PUBLISHED` event is appended.
2. WHEN a buyer publishes and `start_at <= database_now < current_close_at`, THEN the RFQ transitions to `ACTIVE`.
3. WHEN a buyer publishes an RFQ whose `forced_close_at` is already in the past, THEN the API rejects publication with HTTP 400.
4. WHEN an RFQ is published, THEN `schedule`, `auction_config`, `currency`, and `supplier_ids` become immutable.
5. WHEN a buyer attempts to PATCH a published RFQ's immutable fields, THEN the API returns HTTP 409 `RFQ_IMMUTABLE`.
6. WHEN a scheduled auction's `start_at` arrives, THEN the system (Celery worker or read-time reconciliation) transitions state to `ACTIVE`.
7. WHEN `database_now >= forced_close_at`, THEN state evaluates as `FORCE_CLOSED` regardless of `current_close_at`.
8. WHEN `database_now >= current_close_at` and `database_now < forced_close_at`, THEN state evaluates as `CLOSED`.
9. WHEN a buyer cancels a `SCHEDULED` RFQ before `start_at`, THEN state becomes `CANCELLED` and an `AUCTION_CANCELLED` event is appended.
10. WHEN an `ACTIVE` or `CLOSED` auction's cancellation is attempted, THEN the API returns HTTP 409.

### Correctness Properties

- PROPERTY: State evaluation always checks forced_close before current_close (forced_close_at wins).
- PROPERTY: A published RFQ never transitions from CLOSED or FORCE_CLOSED back to ACTIVE.

---

## Requirement 4: Supplier Invitation and Eligibility

**User Story:** As an invited supplier, I want to view and bid on RFQs I've been invited to, and as an uninvited supplier I want to be denied access, so that the auction is private and fair.

### Acceptance Criteria

1. WHEN a supplier whose `rfq_suppliers.invitation_status = ACTIVE` requests RFQ details, THEN access is granted.
2. WHEN a supplier is not in `rfq_suppliers` for an RFQ, THEN the API returns HTTP 403 or 404 (anti-enumeration policy) — no RFQ data is revealed.
3. WHEN a supplier with `invitation_status != ACTIVE` attempts to bid, THEN the API returns HTTP 403 `FORBIDDEN`.
4. WHEN a supplier views standings, THEN competitor supplier IDs, legal names, user IDs, and charge breakdowns are absent from the response.
5. WHEN a supplier views standings, THEN competitors appear under anonymous labels (Supplier A, Supplier B, etc.); the logged-in supplier's own row shows full charge details.
6. WHEN a buyer views standings, THEN all supplier identities and full quote breakdowns are visible.
7. WHEN authorization checks run, THEN they execute in service/repository layers, not only in the UI.

### Correctness Properties

- PROPERTY: For every `/rfqs/{id}` response returned to a supplier, `supplier_id` fields of other suppliers never appear.

---

## Requirement 5: Bid Submission — Transaction and Locking

**User Story:** As an invited supplier, I want to submit a bid that the server validates atomically using the database clock, so that my bid is accepted or rejected with guaranteed correctness.

### Acceptance Criteria

1. WHEN a supplier POSTs to `/api/v1/rfqs/{rfq_id}/bids` with valid fields and `Idempotency-Key` header, THEN the server opens a DB transaction and locks the RFQ row with `SELECT ... FOR UPDATE` before reading `clock_timestamp()`.
2. WHEN the DB clock at lock time satisfies `start_at <= now < current_close_at AND now < forced_close_at`, THEN the bid is accepted.
3. WHEN the DB clock shows `now < start_at`, THEN the API returns HTTP 409 `AUCTION_NOT_STARTED`.
4. WHEN the DB clock shows `now >= current_close_at OR now >= forced_close_at`, THEN the API returns HTTP 409 `AUCTION_CLOSED`.
5. WHEN the same idempotency key is retried with the same payload, THEN the original accepted bid is returned with HTTP 201 — no second extension or rank recalculation occurs.
6. WHEN the same idempotency key is submitted with a different payload, THEN the API returns HTTP 409 `IDEMPOTENCY_CONFLICT`.
7. WHEN the bid is accepted, THEN the response includes `bid_id`, `total_amount`, `accepted_at`, `rank`, `current_l1_total`, `current_close_at`, and `extension` object.
8. WHEN any step inside the transaction fails, THEN no bid is inserted, no extension is applied, and no event is appended.

### Correctness Properties

- PROPERTY: No accepted bid has `accepted_at >= current_close_at` at the time of its transaction commit.
- PROPERTY: No accepted bid has `accepted_at >= forced_close_at`.
- PROPERTY: Idempotency — submitting the same key+payload N times produces exactly 1 bid row.

---

## Requirement 6: Bid Validation Rules

**User Story:** As the system, I want every bid to pass strict field-level validation before acceptance, so that bad data never enters the auction state.

### Acceptance Criteria

1. WHEN a bid is submitted with `freight_charge`, `origin_charge`, or `destination_charge` that is negative or has more than 2 decimal places, THEN the API returns HTTP 422 `INVALID_QUOTE`.
2. WHEN the server receives a bid, THEN `total_amount = freight_charge + origin_charge + destination_charge` is calculated server-side using decimal arithmetic; any client-provided total is ignored or rejected.
3. WHEN `transit_time_days` is not a non-negative integer, THEN the API returns HTTP 422.
4. WHEN `valid_until` is before the RFQ's `service_date`, THEN the API returns HTTP 422 with "Quote validity must cover the RFQ service date."
5. WHEN a supplier submits their second or later bid and `new_total >= supplier_latest_accepted_total`, THEN the API returns HTTP 409 `BID_NOT_LOWER_THAN_PREVIOUS` with `previous_total` and `submitted_total` in the error details.
6. WHEN a supplier submits their first bid, THEN no previous-price comparison is applied.
7. WHEN a bid is rejected for any reason, THEN no event is appended and `current_close_at` is not changed.
8. WHEN money values are stored, THEN they use `NUMERIC(14,2)` columns — never `FLOAT` or `REAL`.

### Correctness Properties

- PROPERTY: For every accepted bid row, `total_amount = freight_charge + origin_charge + destination_charge` exactly.
- PROPERTY: For every supplier with more than one accepted bid, each subsequent `total_amount` is strictly less than the previous one.

---

## Requirement 7: Ranking and Standings

**User Story:** As a buyer or supplier, I want to see real-time standings with deterministic unique rank labels, so that competition is transparent and fair.

### Acceptance Criteria

1. WHEN standings are requested, THEN the system derives ranks using the latest accepted bid per supplier ordered by `total_amount ASC, accepted_at ASC, supplier_id ASC`.
2. WHEN two suppliers have equal `total_amount`, THEN the supplier whose current bid was accepted earlier ranks higher; supplier UUID is the final tie-breaker.
3. WHEN rank numbers are assigned, THEN they are unique and sequential: L1, L2, L3, etc. No two suppliers share a label.
4. WHEN a new bid is accepted, THEN all standings are recomputed in the same transaction using `ROW_NUMBER()`.
5. WHEN no bid has been submitted, THEN `current_l1_total` is returned as null and displayed as "No bids".
6. WHEN a buyer requests standings via GET `/rfqs/{id}/standings`, THEN the response includes supplier name, all charge components, total, transit days, valid_until, rank, and last bid time.
7. WHEN a supplier requests standings, THEN competitor rows include only rank, anonymous label, total, and last bid time — no charge breakdown, supplier ID, or identity.
8. WHEN the logged-in supplier's own row appears in standings, THEN it includes full charge details.

### Correctness Properties

- PROPERTY: At any point, all rank numbers in a standings result are unique and cover 1..N with no gaps.
- PROPERTY: Rank is never persisted as a mutable column in `bids`; it is always derived.

---

## Requirement 8: Automatic Extension Behavior

**User Story:** As a buyer, I want the auction to automatically extend when configured activity occurs in the trigger window, so that last-second bids don't unfairly end the competition.

### Acceptance Criteria

1. WHEN a bid is accepted and `database_now` falls in `[current_close_at - X minutes, current_close_at)`, THEN the system evaluates configured extension triggers.
2. WHEN `BID_RECEIVED` is configured and the bid is accepted inside the trigger window, THEN it qualifies as a match.
3. WHEN `ANY_RANK_CHANGE` is configured and at least one supplier's rank number differs between pre-bid and post-bid standings, THEN it qualifies as a match (a new supplier entering rankings counts).
4. WHEN `L1_CHANGE` is configured and the identity of the L1 supplier differs before and after the bid, THEN it qualifies as a match (transition from no L1 to a first L1 counts; same L1 lowering price does not).
5. WHEN multiple configured triggers match, THEN `new_close = min(current_close_at + Y, forced_close_at)` is computed and only one `EXTENSION_APPLIED` event is written recording all matched reasons.
6. WHEN the computed `new_close <= current_close_at` (forced close cap reached), THEN no extension is applied and no extension event is written.
7. WHEN a bid is rejected for any reason, THEN no extension evaluation occurs.
8. WHEN an extension is applied, THEN `current_close_at` is updated in the same transaction as the bid insert; the next bid's trigger window uses the new `current_close_at`.
9. WHEN an `EXTENSION_APPLIED` event is written, THEN `details` includes `previous_close`, `new_close`, `forced_close`, `extension_duration_minutes`, `bid_id`, and `matched_reasons` array.

### Correctness Properties

- PROPERTY: `current_close_at <= forced_close_at` holds at every point in time, for every RFQ row.
- PROPERTY: A single accepted bid produces at most one `EXTENSION_APPLIED` event.
- PROPERTY: Triggers use OR semantics — matching any one of the configured triggers is sufficient to extend.

---

## Requirement 9: Auction Closure and State Transitions

**User Story:** As the system, I want auctions to close reliably at the right time whether via the bid endpoint or the background worker, so that no bid is accepted after the deadline.

### Acceptance Criteria

1. WHEN `database_now >= forced_close_at`, THEN the state evaluates as `FORCE_CLOSED` regardless of `current_close_at`, and new bids are rejected with HTTP 409 `AUCTION_CLOSED`.
2. WHEN `database_now >= current_close_at` and `database_now < forced_close_at`, THEN state is `CLOSED` and new bids are rejected.
3. WHEN a Celery worker runs its reconciliation task for auctions whose close time has passed, THEN it locks each due RFQ row and persists the transition with one `AUCTION_CLOSED` or `AUCTION_FORCE_CLOSED` event.
4. WHEN a closure task runs twice on the same RFQ, THEN no duplicate closure event is appended (idempotent worker behavior).
5. WHEN no supplier bid was received before close, THEN the auction still closes normally and the detail page shows "No bids received".
6. WHEN the Celery worker is down, THEN the bid endpoint still correctly rejects bids using the database clock.
7. WHEN Redis is unavailable, THEN the bid endpoint continues to function correctly since PostgreSQL is the authority; background tasks may be delayed but do not affect bid correctness.

### Correctness Properties

- PROPERTY: No bid row exists with `accepted_at >= forced_close_at`.
- PROPERTY: State evaluation always applies forced-close check before current-close check.

---

## Requirement 10: Activity Log and Audit History

**User Story:** As a buyer or supplier, I want a chronological activity feed showing every significant auction event, so that the auction is fully auditable and transparent.

### Acceptance Criteria

1. WHEN an RFQ is published, THEN a `PUBLISHED` event is appended with actor_user_id and timestamp.
2. WHEN a bid is accepted, THEN a `BID_SUBMITTED` event is appended with bid_id and actor_user_id in the same transaction.
3. WHEN any supplier's rank changes after a bid, THEN a `RANK_CHANGED` event is appended in the same transaction with before/after rank details.
4. WHEN an extension is applied, THEN an `EXTENSION_APPLIED` event is appended with `previous_close`, `new_close`, `matched_reasons`, and `bid_id`.
5. WHEN the auction closes normally, THEN an `AUCTION_CLOSED` event is appended with `final_close_at`.
6. WHEN the auction force-closes, THEN an `AUCTION_FORCE_CLOSED` event is appended.
7. WHEN events are fetched via GET `/rfqs/{id}/events`, THEN they are returned in chronological order with cursor pagination (`?limit=50&after_id=<last_seen_id>`).
8. WHEN a supplier requests the event feed, THEN events that would reveal competitor supplier identities are anonymized.

### Correctness Properties

- PROPERTY: `auction_events` rows are append-only — no event is updated or deleted through application APIs.
- PROPERTY: Every accepted bid has a corresponding `BID_SUBMITTED` event in the same transaction.

---

## Requirement 11: Auction Listing Page

**User Story:** As a buyer or supplier, I want a listing page showing all relevant auctions with key status information, so that I can quickly navigate to what matters.

### Acceptance Criteria

1. WHEN a buyer loads the listing page, THEN only RFQs owned by that buyer are displayed.
2. WHEN a supplier loads the listing page, THEN only RFQs for which the supplier has an ACTIVE invitation are displayed.
3. WHEN no auctions match, THEN an empty state "No auctions found." is shown.
4. WHEN auctions are displayed, THEN each row shows: RFQ name/reference, current lowest bid (amount + currency or "No bids"), current close time, forced close time, and status badge.
5. WHEN the listing is sorted by default, THEN active auctions appear first, then sorted by nearest current close ascending.
6. WHEN a status filter is applied, THEN only auctions with the selected status are shown.
7. WHEN pagination controls are used, THEN the listing loads the next page without resetting scroll position.
8. WHEN an auction's close time passes between renders, THEN a re-fetch updates the status badge without a page reload.

### Correctness Properties

- PROPERTY: A supplier never sees an RFQ in their listing for which their `invitation_status != ACTIVE`.

---

## Requirement 12: Auction Detail Page

**User Story:** As a buyer or supplier, I want a rich detail page for each auction with live standings, countdown, bid submission, and an activity feed, so that I can participate in and monitor the auction in real time.

### Acceptance Criteria

1. WHEN the detail page loads, THEN the header shows RFQ name/reference, status badge, service date, currency, countdown timer, current close time, and forced close time.
2. WHEN the auction is `ACTIVE`, THEN standings and countdown refresh every 3 seconds via polling; a refresh must not create or modify bids.
3. WHEN a supplier views standings, THEN competitors appear under anonymous labels; only the logged-in supplier's own row shows charge components.
4. WHEN a buyer views standings, THEN all supplier identities and charge breakdowns are visible.
5. WHEN the auction is `ACTIVE` and the user is an invited supplier, THEN the bid form is enabled with fields: freight charge, origin charge, destination charge, transit days, valid until, and a preview total.
6. WHEN the auction is `CLOSED`, `FORCE_CLOSED`, `SCHEDULED`, or `CANCELLED`, THEN the bid form is disabled with appropriate state messaging.
7. WHEN the backend rejects a bid, THEN the entered field values are retained so the supplier can correct and resubmit.
8. WHEN the auction detail page shows `FORCE_CLOSED`, THEN "Forced close reached" is prominently displayed.
9. WHEN the activity feed renders an `EXTENSION_APPLIED` event, THEN it shows previous close, new close, and matched trigger reasons.
10. WHEN the page is in a loading state, THEN skeleton placeholders are shown — the "No bids" text must not flash before data arrives.

### Correctness Properties

- PROPERTY: The bid form is never enabled for a supplier who is not an ACTIVE invitee.
- PROPERTY: Client-side countdown is display-only and never used to accept or reject bids.

---

## Requirement 13: Premium Dark UI Design System

**User Story:** As a user, I want an immersive, premium dark experience that feels crafted and intentional, so that the product communicates quality and focus.

### Acceptance Criteria

1. WHEN the application loads, THEN the base color scheme is a rich dark palette (deep slate/near-black backgrounds, not flat #000000) with layered glassmorphism panels using `backdrop-filter: blur()` and translucent borders.
2. WHEN the user views the dashboard or landing area, THEN a Spline 3D scene is rendered as a background accent (non-blocking — loads asynchronously with a gradient fallback).
3. WHEN a supplier's rank changes in the standings table, THEN the affected row animates (slide + fade) to its new position.
4. WHEN the countdown timer ticks, THEN it animates smoothly (digit flip or cross-fade) rather than jumping.
5. WHEN an event appears in the activity feed, THEN each event type has a distinct icon and color accent (bid = blue, rank change = amber, extension = green, close = red/grey).
6. WHEN a page is loading data, THEN animated skeleton loaders matching the layout geometry replace content — no layout shift when data arrives.
7. WHEN the user hovers over interactive elements (buttons, table rows, nav items), THEN transitions are ≤ 200ms with subtle surface-color shifts.
8. WHEN the application renders on tablet viewport (≥ 768px), THEN the layout adapts without horizontal scroll and all interactions remain usable.
9. WHEN status badges are rendered, THEN each state has a distinct pill color: ACTIVE = emerald, CLOSED = slate, FORCE_CLOSED = red, SCHEDULED = blue, DRAFT = zinc, CANCELLED = stone.
10. WHEN typography is set, THEN headings use a premium variable-weight sans-serif (e.g. Inter or Geist) and all numeric/money values use tabular figures.

### Correctness Properties

- PROPERTY: No UI state shows "No bids" before the first data fetch completes (skeleton → real data).
- PROPERTY: Spline scene failure (network/WebGL) does not block or break the page — gradient fallback renders.

---

## Requirement 14: Security and Privacy

**User Story:** As the platform, I want all authorization, data privacy, and input safety rules enforced at the backend, so that no frontend manipulation can expose data or corrupt auction state.

### Acceptance Criteria

1. WHEN any API request includes a supplier ID, actor ID, rank, `accepted_at`, or `current_close_at` in the request body, THEN the server ignores those fields and derives values server-side.
2. WHEN a supplier response projection runs, THEN it excludes competitor `supplier_id`, `legal_name`, `user_id`, `freight_charge`, `origin_charge`, `destination_charge`, and other private fields.
3. WHEN an unauthorized supplier requests a RFQ that exists but they're not invited to, THEN the API returns HTTP 403 or 404 and reveals no information about the RFQ's existence.
4. WHEN database queries are constructed, THEN ORM parameter binding or parameterized queries are used — no string interpolation with user input.
5. WHEN a bid or event is accepted into the database, THEN the row is never updated or deleted through application APIs (append-only).
6. WHEN logs are written, THEN request ID, actor ID, RFQ ID, and outcome are recorded — passwords and tokens are never logged.
7. WHEN basic rate limiting is applied to bid submission, THEN a rate-limited response never silently drops an already-accepted bid.
8. WHEN tokens are issued, THEN they are short-lived and validated on every protected request.

### Correctness Properties

- PROPERTY: No API response to a supplier contains the `supplier_id` or charge breakdown of another supplier.

---

## Requirement 15: Performance, Deployment, and Observability

**User Story:** As a developer and evaluator, I want the application to start with one command, perform well under load, and emit structured logs, so that it's easy to run and diagnose.

### Acceptance Criteria

1. WHEN `docker compose up` is run from the project root, THEN all services (API, frontend, PostgreSQL, Redis, Celery worker, Celery beat) start and become healthy without manual intervention.
2. WHEN the bid API is load-tested with 100 concurrent bid requests distributed across multiple RFQs, THEN p95 response time is below 500ms.
3. WHEN money values are stored or compared, THEN `NUMERIC(14,2)` columns are used — `FLOAT`, `REAL`, and JavaScript `number` are never the authority for bid totals.
4. WHEN timestamps are persisted, THEN they use `TIMESTAMPTZ` stored in UTC; the browser timezone label is display-only.
5. WHEN the API starts, THEN a `/health` endpoint returns HTTP 200 with database connectivity status.
6. WHEN an application error occurs, THEN structured JSON logs include `request_id`, `actor_id`, `rfq_id` (where applicable), `level`, `timestamp`, and `message`.
7. WHEN database schema changes are needed, THEN Alembic migration files are used — tables are never created or altered manually.
8. WHEN the application runs in Docker Compose, THEN no external cloud service, API key, or internet connectivity is required for the core auction flow.

### Correctness Properties

- PROPERTY: Every accepted bid's `total_amount` stored in PostgreSQL equals the sum of its three charge columns as NUMERIC arithmetic.
- PROPERTY: All `TIMESTAMPTZ` columns in the database store values in UTC.
