# ANL — Auction Night Live

**British reverse-auction RFQ platform.** Buyers create auctions, invite suppliers, configure auto-extension rules. Suppliers compete with progressively lower bids. All auction logic is enforced server-side using PostgreSQL as the single source of truth.

---

## 📦 Deliverables

| Document | Location | Description |
|---|---|---|
| **High-Level Design** | [`deliverables/HLD.md`](deliverables/HLD.md) | Architecture diagram, component responsibilities, bid transaction flow, extension logic, state machine, performance targets |
| **Database Schema** | [`deliverables/SCHEMA.md`](deliverables/SCHEMA.md) | All 7 tables with column definitions, constraints, indexes, DB triggers, Alembic migration history |

---

## 🚀 Quick Start

```bash
git clone https://github.com/DHYEYPATL/ANL-Auctionnightlive.git
cd ANL-Auctionnightlive
docker compose up --build
```

First startup automatically:
1. Runs all 4 Alembic migrations
2. Seeds demo accounts
3. Starts API, workers, and frontend

| Service | URL |
|---|---|
| **Frontend** | http://localhost:3000 |
| **API** | http://localhost:8000 |
| **API Docs** | http://localhost:8000/docs |
| **Health** | http://localhost:8000/health |

---

## 🔑 Demo Accounts

| Role | Email | Password |
|---|---|---|
| Buyer | buyer@anl.dev | password123 |
| Supplier 1 | supplier1@anl.dev | password123 |
| Supplier 2 | supplier2@anl.dev | password123 |
| Supplier 3 | supplier3@anl.dev | password123 |

---

## 🎯 End-to-End Walkthrough

1. **Login as Buyer** → http://localhost:3000 → click "Buyer" demo
2. **Create Auction** → "New Auction" → 4-step wizard (Details → Schedule → Suppliers → Rules)
3. **Publish** → open the auction detail → click "Publish Auction"
4. **Login as Supplier 1** in a new tab → see the invited auction → submit a bid
5. **Login as Supplier 2** in another tab → undercut → watch L1 change with animated rank shuffle
6. **Extensions fire** automatically when bids land in the trigger window (last X minutes)
7. **Activity feed** shows every event in real time — bid, rank change, extension, close

---

## 🏗 Architecture

```
Browser (React + TS)
        │  3s poll · ETag/304 · server_now clock
        ▼
FastAPI (Python 3.11)  ←  JWT auth
        │
        ├── PostgreSQL 15  ← SELECT FOR UPDATE · DB clock · append-only
        │
        ├── Redis 7        ← Celery broker only
        │
        └── Celery Worker/Beat  ← reconcile auctions every 30s
```

Full architecture diagram: [`deliverables/HLD.md`](deliverables/HLD.md)

---

## 🗄 Database

7 tables: `suppliers`, `users`, `rfqs`, `auction_configs`, `rfq_suppliers`, `bids`, `auction_events` + `bid_attempts`

Full schema with all columns, constraints, indexes, and DB triggers: [`deliverables/SCHEMA.md`](deliverables/SCHEMA.md)

---

## ✅ Key Correctness Properties

| Property | Enforcement |
|---|---|
| No bid accepted after close | `SELECT FOR UPDATE` + DB clock + DB trigger |
| `current_close_at <= forced_close_at` always | DB `CHECK` constraint + application logic |
| `total_amount = freight + origin + destination` | Computed in service, asserted post-insert |
| Each supplier's bids strictly decreasing | Checked inside the locked transaction |
| Exactly one terminal event per RFQ | Partial unique index + `ON CONFLICT DO NOTHING` |
| Bids and events append-only | DB triggers reject `UPDATE`/`DELETE` |
| Idempotent retry returns original bid | `UNIQUE(rfq_id, supplier_id, idempotency_key)` |

---

## 🧪 Tests

```bash
cd backend
py -3.13 -m pytest tests/unit/ -v
# 400+ unit tests, all passing
```

---

## 🔧 Utility Scripts

```bash
# Verify event hash chain integrity (tamper evidence)
cd backend && python scripts/verify_chain.py

# Check all correctness invariants against live DB
cd backend && python scripts/audit_invariants.py

# Load test: measure p50/p95/p99 bid latency
cd backend && python scripts/load_test.py --host http://localhost:8000 --rfq <rfq_id>
```

---

## 📁 Project Structure

```
ANL-Auctionnightlive/
├── deliverables/
│   ├── HLD.md              ← Architecture + bid transaction flow
│   └── SCHEMA.md           ← Full database schema
├── backend/
│   ├── app/
│   │   ├── api/v1/         ← Routers
│   │   ├── services/       ← Business logic
│   │   ├── repositories/   ← DB access
│   │   ├── db/models/      ← ORM models
│   │   ├── schemas/        ← Pydantic (extra=forbid)
│   │   └── workers/        ← Celery tasks
│   ├── alembic/            ← 4 migrations
│   ├── scripts/            ← verify_chain, audit_invariants, load_test
│   └── tests/unit/         ← 400+ unit tests
├── frontend/
│   └── src/
│       ├── pages/          ← Login, Listing, Detail, Create (4-step wizard)
│       ├── components/     ← BidForm (review step), StandingsTable, ActivityFeed, Countdown
│       ├── api/            ← Axios + ETag-aware standings
│       └── hooks/          ← useAuctionPolling (server clock, monotonic guard)
├── docker-compose.yml
└── .env.example
```

---

## 🗺 P2 Roadmap

- **SSE upgrade** — PostgreSQL LISTEN/NOTIFY push instead of 3s polling
- **Refresh tokens** — 15-min access + 8-hour rotating httpOnly cookie
- **Read replicas** for polling (requires replication-lag alarm < 500ms)
- **max_extensions** per auction config
- **Audit log retention** — 7 years, signed export, pseudonymization
