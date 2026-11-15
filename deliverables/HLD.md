# High-Level Design — ANL (Auction Night Live)

## 1. System Overview

ANL is a British reverse-auction RFQ platform. A buyer creates a Request for Quotation, invites suppliers, and configures an auto-extension auction. Invited suppliers compete by submitting progressively lower bids. The system ranks suppliers in real time, automatically extends the closing window on configured activity, and enforces a hard forced-close timestamp that no extension can exceed.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (React + TypeScript)                    │
│                                                                         │
│  Login  ──►  Auction Listing  ──►  Auction Detail  ──►  Create RFQ     │
│                                         │                               │
│                               3s polling (ETag/304)                    │
│                            server_now clock anchor                      │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │  HTTPS / JSON  (Bearer JWT)
                              │
┌─────────────────────────────▼───────────────────────────────────────────┐
│                         FastAPI  (Python 3.11)                          │
│                                                                         │
│  Routers          Services              Repositories                    │
│  ─────────────    ──────────────────    ────────────────────────────    │
│  POST /bids   →   BidService            BidRepository                  │
│  GET  /standings  RfqService            RfqRepository                  │
│  POST /rfqs       RankingService        EventRepository                │
│  GET  /events     AuctionService                                        │
│  POST /auth       EventService                                          │
│                                                                         │
│  Middleware: JWT auth · request-id · 32KB body cap · security headers  │
└──────┬──────────────────────────────────────────┬────────────────────────┘
       │  asyncpg (async)                         │  redis-py
       │                                          │
┌──────▼──────────────────┐          ┌────────────▼──────────────────────┐
│   PostgreSQL 15          │          │   Redis 7                         │
│   (sole source of truth) │          │   (Celery broker only)            │
│                          │          └──────────────┬────────────────────┘
│  • All bids, RFQs,       │                         │
│    events persisted here │          ┌──────────────▼────────────────────┐
│  • SELECT FOR UPDATE on  │          │   Celery Worker + Beat            │
│    every bid transaction │          │                                   │
│  • DB clock (clock_      │          │  reconcile_auctions() every 30s   │
│    timestamp()) is the   │          │  ACTIVE→CLOSED, SCHEDULED→ACTIVE  │
│    authority for all     │          │  FOR UPDATE SKIP LOCKED            │
│    time decisions        │          │  ON CONFLICT DO NOTHING (terminal) │
└──────────────────────────┘          └───────────────────────────────────┘
```

---

## 3. Component Responsibilities

| Component | Responsibility | Must NOT do |
|---|---|---|
| **React + TypeScript** | Forms, role-aware views, 3s poll loop, server-clock countdown, rank animations, bid review step | Accept/reject bids, trust client clock for cutoffs |
| **FastAPI routers** | HTTP parsing, JWT auth, request/response schemas, status codes | Contain auction rules directly in route handlers |
| **Domain services** | RFQ lifecycle, bid transaction (FOR UPDATE + DB clock), ranking, extension rules, role projections | Trust client timestamps or client-computed totals |
| **PostgreSQL** | All bids, RFQs, invitations, events (append-only), audit chain | Depend on Redis for correctness |
| **Redis** | Celery broker transport only | Be the authority for close times or bid acceptance |
| **Celery Worker/Beat** | Activate/close/force-close due auctions every 30s — idempotent | Be the sole enforcer of bid cutoffs (API endpoint enforces independently) |

---

## 4. Bid Transaction — Critical Path

Every bid goes through this exact serialized sequence inside one PostgreSQL transaction:

```
1.  SET LOCAL lock_timeout = 2s
    SET LOCAL statement_timeout = 3s

2.  SELECT * FROM rfqs WHERE id = :id FOR UPDATE   ← first statement
    (lock_timeout fires 503 AUCTION_BUSY if contended)

3.  decision_at = GREATEST(clock_timestamp(), last_decision_at)
    (monotonic — immune to NTP clock steps)

4.  Idempotency check: (rfq_id, supplier_id, key) → replay if found

5.  Eligibility re-read (user active, supplier active, invitation ACTIVE)

6.  Time checks using decision_at:
    now >= forced_close_at  →  409 AUCTION_CLOSED
    now >= current_close_at →  409 AUCTION_CLOSED
    now <  start_at         →  409 AUCTION_NOT_STARTED

7.  Business checks: total > 0, strictly lower than own previous, large-drop confirm

8.  Pre-bid standings snapshot (from denormalized rfq_suppliers)

9.  bid_seq = last_bid_seq + 1  (unique per RFQ, monotonic)

10. INSERT bid (accepted_at = decision_at, bid_seq, request_hash)
    (DB trigger rejects bids outside window as defense-in-depth)

11. Post-bid standings recalculated

12. Events appended in causal order:
    BID_SUBMITTED → RANK_CHANGED → EXTENSION_APPLIED
    (consecutive event_seq, SHA-256 hash chain for tamper evidence)

13. UPDATE rfqs: current_close_at (if extended), version, last_bid_seq,
    last_event_seq, last_decision_at

14. COMMIT — response built from captured values, no re-query
15. bid_attempts row written outside tx (dispute evidence)
```

**Throughput ceiling:** At ~10ms lock hold time per bid, one RFQ handles ~100 accepted bids/sec. Different RFQs run fully in parallel.

---

## 5. Extension Logic

```
trigger_start = current_close_at - X minutes
inside_window = trigger_start <= decision_at < current_close_at

configured triggers evaluated (OR logic):
  BID_RECEIVED      → any accepted bid inside the window
  ANY_RANK_CHANGE   → at least one supplier rank number changed
  L1_CHANGE         → identity of the L1 supplier changed

if inside_window AND any trigger matched:
    new_close = MIN(current_close_at + Y minutes, forced_close_at)
    if new_close > current_close_at:
        UPDATE rfqs SET current_close_at = new_close
        INSERT EXTENSION_APPLIED event (one per bid max)
```

---

## 6. State Machine

```
DRAFT ──publish──► SCHEDULED ──start_at reached──► ACTIVE
                       │                               │
                   cancel                      current_close_at
                       │                           reached
                   CANCELLED                        │
                                                 CLOSED
                                            forced_close_at
                                               reached
                                            FORCE_CLOSED
```

State evaluation order (forced close always checked first):
1. DRAFT / CANCELLED → sticky
2. `now >= forced_close_at` → FORCE_CLOSED
3. `now >= current_close_at` → CLOSED
4. `now >= start_at` → ACTIVE
5. else → SCHEDULED

---

## 7. Real-time Updates

- **3-second poll** with setTimeout chain (not setInterval)
- **ETag / 304** on standings — skips ranking query when nothing changed
- **server_now** in every response — client anchors countdown to server clock
- **Monotonic version guard** — client ignores older responses (out-of-order protection)
- **Hidden tab** polls every 10s; refetches immediately on focus / online / visibilitychange

---

## 8. Security Highlights

| Concern | Implementation |
|---|---|
| Passwords | Argon2id, constant-time login response |
| Tokens | JWT HS256, 60min expiry, 30s clock leeway |
| Authorization | Buyer ownership + supplier invitation checked in service layer |
| Privacy | Competitor supplier_id / charges stripped at projection layer; random anon labels assigned at publish |
| Input | `extra="forbid"` on all Pydantic schemas; strict money string regex; 32KB body cap |
| Append-only | DB triggers reject UPDATE/DELETE on bids and events |
| Tamper evidence | SHA-256 hash chain on auction_events |
| Uniform 404 | Unknown RFQ and uninvited supplier return identical RFQ_NOT_FOUND |

---

## 9. Performance Targets

| Operation | p50 | p99 |
|---|---|---|
| POST /bids (uncontended) | ~40ms | ~250ms |
| POST /bids (50 concurrent, same RFQ) | ~250ms | ~800ms |
| GET /standings (304 — ETag hit) | ~10ms | ~50ms |
| GET /standings (200 — 50 suppliers) | ~30ms | ~150ms |
| Closure persisted after logical close | — | ~7s (Beat 5s + run) |

SRS target: p95 < 500ms with 100 concurrent requests across multiple RFQs.

---

## 10. Deployment

```bash
docker compose up --build
```

Starts: PostgreSQL → Redis → Backend (runs Alembic migrations + seed) → Celery Worker → Celery Beat → Frontend (nginx)

No external dependencies, no cloud services, no API keys required.
