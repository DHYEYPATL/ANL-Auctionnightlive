# ANL — Auction Night Live

A premium British reverse-auction RFQ platform. Buyers create auctions, invite suppliers, configure auto-extension rules. Suppliers compete with progressively lower bids. All auction logic is enforced server-side using PostgreSQL as the single source of truth.

---

## Quick Start

```bash
git clone https://github.com/DHYEYPATL/ANL-Auctionnightlive.git
cd ANL-Auctionnightlive
docker compose up --build
```

First startup: Alembic migrations run automatically, demo accounts seeded.

- **API:** http://localhost:8000  
- **Frontend:** http://localhost:3000  
- **API docs:** http://localhost:8000/docs (dev only)

---

## Demo Accounts

| Role     | Email                | Password    |
|----------|----------------------|-------------|
| Buyer    | buyer@anl.dev        | password123 |
| Supplier | supplier1@anl.dev    | password123 |
| Supplier | supplier2@anl.dev    | password123 |
| Supplier | supplier3@anl.dev    | password123 |

---

## Architecture

| Layer       | Technology                               |
|-------------|------------------------------------------|
| Frontend    | React + TypeScript + Vite + Tailwind CSS |
| Backend     | Python 3.11+ + FastAPI                   |
| Database    | PostgreSQL 15 (sole authority)           |
| Queue       | Redis + Celery                           |
| Migrations  | Alembic                                  |
| Deployment  | Docker Compose                           |

---

## Key Features

### Auction Engine
- **British Reverse Auction** — suppliers submit strictly lower bids
- **Auto-extension** — trigger window X, extension Y, three trigger types (BID_RECEIVED, ANY_RANK_CHANGE, L1_CHANGE) with OR logic
- **Forced close** — hard cap that no extension can exceed
- **Deterministic ranking** — total ASC → bid_seq ASC → supplier_id ASC (CHG-1)
- **Idempotent bids** — `Idempotency-Key` header; same key+payload returns original result even after auction close (CHG-5)
- **Anonymous labels** — randomly assigned at publish, stable for the auction (HD-SEC-05)

### Correctness
- **Single-authority timestamps** — `decision_at = GREATEST(clock_timestamp(), last_decision_at)` read after the row lock (HD-CON-03/05)
- **Per-RFQ bid_seq** — monotonic counter for deterministic ranking and dispute evidence (HD-CON-04)
- **SELECT FOR UPDATE** — first statement in every bid transaction; lock_timeout = 2s → 503 AUCTION_BUSY (HD-CON-06)
- **No I/O inside transaction** — no Redis, no HTTP, no Celery calls inside the bid lock
- **DB-level triggers** — append-only bids/events, bid window check, immutable schedule after publish (HD-SEC-12)
- **Event hash chain** — SHA-256 linked chain for tamper evidence (HD-SEC-13)
- **Invariant auditor** — `scripts/audit_invariants.py` checks all correctness properties post-hoc
- **Chain verifier** — `scripts/verify_chain.py` recomputes and validates all event hashes

### Security
- **Argon2id** passwords with constant-time login response (HD-SEC-03)
- **extra=forbid** on all request schemas — rejects `total_amount`, `supplier_id`, `rank`, `accepted_at` from client (HD-SEC-07)
- **32KB body cap**, security headers (X-Content-Type-Options, CSP, Referrer-Policy), CORS exact origin
- **Uniform 404** — unknown RFQ and uninvited supplier return identical response (CHG-3)
- **Session expiry banner** — 401 preserves form state and idempotency key (HD-SEC-01)
- **Per-role response projections** — `is_self` flag, stored anon_label, no competitor charges in supplier view

### Real-time
- **ETag/304** on standings — primary-key lookup only on 304, saves ranking query (HD-RT-03)
- **server_now** in every standings response — client anchors countdown to server clock (HD-RT-01)
- **Version guard** — client ignores responses with lower version than rendered (HD-RT-02)
- **Poll hygiene** — setTimeout chain, AbortController, jitter, exponential backoff, hidden tab at 10s, refetch on focus/online (HD-RT-05)

---

## Running Tests

```bash
cd backend
py -3.11 -m pytest tests/unit/ -v
# 212 unit tests, all passing
```

---

## Utility Scripts

```bash
# Verify event hash chain integrity (HD-SEC-13)
cd backend && python scripts/verify_chain.py

# Check all invariants against the live DB (HD-OBS-01)
cd backend && python scripts/audit_invariants.py
```

---

## Performance Budget

| Operation | p50 | p99 | Condition |
|---|---|---|---|
| `POST /bids`, uncontended | ~40ms | ~250ms | Local Docker, warm pool |
| `POST /bids`, 50 concurrent, same RFQ | ~250ms | ~800ms | Serialized by row lock |
| `GET /standings`, 304 | ~10ms | ~50ms | Primary-key lookup only |
| `GET /standings`, 200 | ~30ms | ~150ms | 50 suppliers |
| Closure after logical close | — | ~7s | Celery beat 5s + run time |

---

## P2 Roadmap (not built for assignment)

- **HD-BID-10**: `max_extensions` per auction — bids accepted but no further extension after limit
- **HD-RT-08**: Read replicas for polling (requires replication-lag alarm < 500ms)
- **HD-RT-09**: SSE upgrade — PostgreSQL LISTEN/NOTIFY push to replace 3s polling
- **HD-SEC-02**: Refresh tokens — 15-min access + 8-hour rotating refresh in httpOnly cookie
- **HD-REL-04/05**: Synchronous replication, PITR for acknowledged-but-lost bid recovery
- **HD-SEC-14**: Audit log retention (7 years), signed export, pseudonymization for GDPR erasure, MFA for buyers

---

## Project Structure

```
ANL-Auctionnightlive/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Routers
│   │   ├── services/        # Business logic (bid, rfq, ranking, event, auction)
│   │   ├── repositories/    # DB access
│   │   ├── db/models/       # ORM models
│   │   ├── schemas/         # Pydantic (extra=forbid on all request schemas)
│   │   └── workers/         # Celery tasks
│   ├── alembic/             # Migrations (3 revisions)
│   ├── scripts/             # verify_chain.py, audit_invariants.py
│   └── tests/unit/          # 212 unit tests
├── frontend/
│   └── src/
│       ├── pages/           # Login, Listing, Detail, Create
│       ├── components/      # BidForm, StandingsTable, ActivityFeed, Countdown, ...
│       ├── api/             # Axios client + ETag-aware standings
│       └── hooks/           # useAuctionPolling (HD-RT-01/02/03/05), useAuth
├── docker-compose.yml
└── .env.example
```
