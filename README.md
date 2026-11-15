# ANL — Auction Night Live

A premium British reverse-auction RFQ platform. Buyers create auctions, invite suppliers, and configure auto-extension rules. Suppliers compete by submitting progressively lower bids. All auction logic is enforced server-side using PostgreSQL as the single source of truth.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/DHYEYPATL/ANL-Auctionnightlive.git
cd ANL-Auctionnightlive

# 2. Start everything (DB, Redis, API, Workers, Frontend)
docker compose up --build
```

The first startup will:
- Run Alembic migrations automatically
- Seed demo accounts
- Start the API at http://localhost:8000
- Start the frontend at http://localhost:3000

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

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React + TypeScript + Vite + Tailwind |
| Backend     | Python 3.11 + FastAPI               |
| Database    | PostgreSQL 15 (source of truth)     |
| Queue       | Redis + Celery                      |
| Migrations  | Alembic                             |
| Deployment  | Docker Compose                      |

---

## Key Features

- **British Reverse Auction** — suppliers submit progressively lower bids
- **Auto-extension** — trigger window X, extension Y, three trigger types (BID_RECEIVED, ANY_RANK_CHANGE, L1_CHANGE) with OR logic
- **Forced close** — hard cap that no extension can exceed
- **Deterministic ranking** — total ASC → accepted_at ASC → supplier_id ASC
- **Idempotent bids** — `Idempotency-Key` header prevents duplicate accepted bids on network retry
- **Role-aware views** — buyers see all details; suppliers see competitor totals only (anonymous labels)
- **3-second live polling** on active auctions
- **Premium dark UI** — glassmorphism, animated rank transitions, live countdown

---

## API Docs

Interactive docs available at http://localhost:8000/docs after startup.

---

## Running Tests

```bash
cd backend
pip install -e ".[dev]"
pytest tests/unit/ -v
```

---

## Project Structure

```
ANL-Auctionnightlive/
├── backend/                 # FastAPI + SQLAlchemy + Celery
│   ├── app/
│   │   ├── api/v1/          # Routers
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # DB access
│   │   ├── db/models/       # ORM models
│   │   ├── schemas/         # Pydantic schemas
│   │   └── workers/         # Celery tasks
│   ├── alembic/             # Migrations
│   └── tests/               # Unit + integration tests
├── frontend/                # React + TypeScript + Tailwind
│   └── src/
│       ├── pages/           # Route pages
│       ├── components/      # UI components
│       ├── api/             # API client
│       └── hooks/           # Custom hooks
├── docker-compose.yml
└── .env.example
```
