<div align="center">

  <img src="assets/logo.svg" alt="Auction Night Live" width="700" />

  <p>
    <strong>A production-grade British reverse-auction RFQ platform.</strong><br/>
    Buyers create auctions · Suppliers compete with live bids · Engine enforces every rule at the database level.
  </p>

  <p>
    <img src="https://img.shields.io/badge/Python-3.11-3776ab?style=flat-square&logo=python&logoColor=white" />
    <img src="https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white" />
    <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black" />
    <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql&logoColor=white" />
    <img src="https://img.shields.io/badge/Redis-7-dc382d?style=flat-square&logo=redis&logoColor=white" />
    <img src="https://img.shields.io/badge/Docker-Compose-2496ed?style=flat-square&logo=docker&logoColor=white" />
    <img src="https://img.shields.io/badge/Tests-400%2B%20passing-22c55e?style=flat-square" />
  </p>

  <p>
    <a href="deliverables/HLD.md"><strong>Architecture (HLD)</strong></a> ·
    <a href="deliverables/SCHEMA.md"><strong>Database Schema</strong></a> ·
    <a href="#-quick-start"><strong>Quick Start</strong></a> ·
    <a href="#-walkthrough"><strong>Walkthrough</strong></a>
  </p>
</div>

---

## Overview

ANL implements a **British reverse auction** on top of a full-stack RFQ workflow. A buyer creates a Request for Quotation, invites suppliers, and configures an auto-extension auction with a hard forced-close cap. Invited suppliers submit progressively lower bids. The system ranks them in real time, extends the closing window on configured activity, and records every event in an append-only audit log with a SHA-256 hash chain.

Every bid is decided at a single serialized instant on the database clock — there are no race conditions, no double-accepts, and no way for a client timestamp to influence the result.

---

## Deliverables

| | Document | What's inside |
|---|---|---|
| 📐 | [`deliverables/HLD.md`](deliverables/HLD.md) | Architecture diagram, component responsibilities, full bid transaction sequence (15 steps), extension logic, state machine, real-time design, performance budget |
| 🗄 | [`deliverables/SCHEMA.md`](deliverables/SCHEMA.md) | Mermaid ER diagram, all 8 tables (every column, type, constraint), indexes, DB triggers, Alembic migration history |

---

## Quick Start

**Prerequisite:** Docker Desktop running.

```bash
git clone https://github.com/DHYEYPATL/ANL-Auctionnightlive.git
cd ANL-Auctionnightlive
docker compose up --build
```

That single command:
- Runs all 4 Alembic migrations
- Seeds demo accounts
- Starts API, Celery worker, Celery Beat, and the React frontend

| | URL |
|---|---|
| **App** | http://localhost:3000 |
| **API** | http://localhost:8000 |
| **API Docs** | http://localhost:8000/docs |
| **Health** | http://localhost:8000/health |

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Buyer | `buyer@anl.dev` | `password123` |
| Supplier 1 | `supplier1@anl.dev` | `password123` |
| Supplier 2 | `supplier2@anl.dev` | `password123` |
| Supplier 3 | `supplier3@anl.dev` | `password123` |

The login page has one-click buttons for all four — no typing required.

---

## Walkthrough

> Full end-to-end in under two minutes.

1. **Login as Buyer** → click the Buyer demo button
2. **New Auction** → 4-step wizard: Details → Schedule → Suppliers → Rules → Create
3. **Publish** → open the draft auction → click *Publish Auction*
4. Open a second tab → login as **Supplier 1** → open the auction → submit a bid
5. Open a third tab → login as **Supplier 2** → undercut → watch the rank table animate
6. **Extension fires** automatically when a bid lands inside the trigger window (last X minutes)
7. **Activity feed** updates in real time — every bid, rank change, extension, and close is logged

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion |
| Backend | Python 3.11 + FastAPI + SQLAlchemy (async) |
| Database | PostgreSQL 15 — sole source of truth |
| Queue | Redis 7 + Celery (broker only) |
| Migrations | Alembic |
| Deployment | Docker Compose |

---

## Architecture

```
Browser (React + TS)
    │  3-second poll · ETag/304 · server_now clock anchor
    ▼
FastAPI  ←  JWT auth (Argon2id · 30s leeway)
    │
    ├── PostgreSQL 15
    │     SELECT FOR UPDATE on every bid
    │     DB clock (clock_timestamp()) for all decisions
    │     Append-only bids + events (DB triggers)
    │     SHA-256 hash chain on auction_events
    │
    ├── Redis 7  (Celery broker only — never authoritative)
    │
    └── Celery Worker + Beat
          reconcile_auctions() every 30 s
          FOR UPDATE SKIP LOCKED · ON CONFLICT DO NOTHING
```

Full diagram and bid transaction walkthrough → [`deliverables/HLD.md`](deliverables/HLD.md)

---

## Correctness Guarantees

| Property | How it's enforced |
|---|---|
| No bid accepted after close | `SELECT FOR UPDATE` + DB clock + DB trigger |
| `current_close_at ≤ forced_close_at` | `CHECK` constraint + application logic |
| `total = freight + origin + destination` | Server-computed, asserted post-insert |
| Each supplier's bids strictly decreasing | Checked inside the locked transaction |
| One terminal event per RFQ | Partial unique index + `ON CONFLICT DO NOTHING` |
| Bids and events immutable | DB triggers reject `UPDATE` / `DELETE` |
| Network retry returns original bid | `UNIQUE(rfq_id, supplier_id, idempotency_key)` |
| Monotonic decision clock | `GREATEST(clock_timestamp(), last_decision_at)` |

---

## Tests

```bash
cd backend
py -3.11 -m pytest tests/unit/ -v
```

400+ unit tests covering bid validation, extension triggers, state machine, ranking properties, money parsing, security projections, event hash chain, and all SRS edge cases 1–28.

---

## Utility Scripts

```bash
# Verify event hash chain integrity
python scripts/verify_chain.py

# Check all correctness invariants against live DB
python scripts/audit_invariants.py

# Load test — measure p50/p95/p99 bid latency
python scripts/load_test.py --host http://localhost:8000 --rfq <rfq_id>
```

---

## Repository Layout

```
ANL-Auctionnightlive/
├── assets/                 ← Logo and static assets
├── deliverables/
│   ├── HLD.md              ← Architecture + bid transaction flow
│   └── SCHEMA.md           ← Mermaid ER diagram + full table definitions
├── backend/
│   ├── app/
│   │   ├── api/v1/         ← Routers (auth, rfqs, bids, standings, events)
│   │   ├── services/       ← Business logic (bid, rfq, ranking, event, auction)
│   │   ├── repositories/   ← DB access layer
│   │   ├── db/models/      ← SQLAlchemy ORM models
│   │   ├── schemas/        ← Pydantic schemas (extra=forbid on all inputs)
│   │   └── workers/        ← Celery tasks
│   ├── alembic/            ← 4 migration revisions
│   ├── scripts/            ← verify_chain · audit_invariants · load_test
│   └── tests/unit/         ← 400+ unit tests
├── frontend/
│   └── src/
│       ├── pages/          ← Login · Listing · Detail · Create (4-step)
│       ├── components/     ← BidForm · StandingsTable · ActivityFeed · Countdown
│       ├── api/            ← Axios client + ETag-aware standings
│       └── hooks/          ← useAuctionPolling (server clock · monotonic guard)
├── docker-compose.yml
└── .env.example
```

---

## Roadmap

Things explicitly out of scope for this assignment but documented for completeness:

- **SSE push** — replace 3-second polling with PostgreSQL `LISTEN/NOTIFY`
- **Refresh tokens** — 15-min access + 8-hour rotating httpOnly cookie
- **Read replicas** — polling path only, with replication-lag guard
- **`max_extensions` config** — cap extensions per auction
- **Signed audit export** — 7-year retention, pseudonymization for erasure requests

---

<div align="center">
  <sub>Built for the GoComet Full Stack Intern Assignment · Nov 2026</sub>
</div>
