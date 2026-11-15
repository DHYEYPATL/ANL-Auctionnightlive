# Design: ANL — Auction Night Live

## Architecture Overview

Modular monolith. FastAPI handles HTTP + authorization. PostgreSQL is the authoritative store. Redis is the Celery broker only. Celery Worker + Beat run scheduled lifecycle tasks. React + TypeScript polls every 3 seconds on active pages.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React + TypeScript)                                   │
│  - Role-aware views, 3s polling, Spline 3D accent               │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS / JSON
┌─────────────────────────▼───────────────────────────────────────┐
│  FastAPI (Python 3.11+)                                         │
│  Routers → Schemas → Services → Repositories                   │
└──────┬──────────────────┬────────────────────────────┬──────────┘
       │                  │                            │
┌──────▼──────┐  ┌────────▼────────┐  ┌───────────────▼──────────┐
│ PostgreSQL  │  │  Redis (broker) │  │  Celery Worker + Beat    │
│ (source of  │  │  jobs only      │  │  activate/close/reconcile│
│  truth)     │  └─────────────────┘  └──────────────────────────┘
└─────────────┘
```

## Backend Module Layout

```
backend/
  app/
    main.py                   # FastAPI app factory, middleware, health
    api/
      v1/
        auth.py               # POST /auth/login, GET /me
        rfqs.py               # CRUD + publish + cancel
        bids.py               # POST /rfqs/{id}/bids
        standings.py          # GET /rfqs/{id}/standings
        events.py             # GET /rfqs/{id}/events
    core/
      config.py               # Pydantic Settings from env
      security.py             # JWT sign/verify, password hash
      errors.py               # HTTPException wrappers + error codes
      logging.py              # Structured JSON logger
    db/
      session.py              # AsyncSession factory
      base.py                 # Base declarative
      models/
        user.py
        supplier.py
        rfq.py
        auction_config.py
        rfq_supplier.py
        bid.py
        auction_event.py
    schemas/
      auth.py
      rfq.py
      bid.py
      standing.py
      event.py
    services/
      rfq_service.py          # Create, publish, cancel, eligibility
      bid_service.py          # Submit bid, idempotency, extension
      ranking_service.py      # ROW_NUMBER standings query
      auction_service.py      # State evaluation, close transitions
      event_service.py        # Append events
    repositories/
      rfq_repository.py
      bid_repository.py
      event_repository.py
    workers/
      celery_app.py
      auction_tasks.py        # activate_due, close_due, force_close_due
  alembic/
    env.py
    versions/
  tests/
    unit/
      test_bid_validation.py
      test_ranking.py
      test_extension.py
      test_state_machine.py
    integration/
      test_bid_transaction.py
      test_concurrent_bids.py
      test_idempotency.py
  pyproject.toml
  Dockerfile
```

## Frontend Module Layout

```
frontend/
  src/
    app/
      router.tsx
      auth-provider.tsx
    api/
      client.ts               # Axios instance with JWT interceptor
      rfqs.ts
      bids.ts
      standings.ts
      events.ts
    components/
      ui/                     # Primitive design system
        Button.tsx
        Badge.tsx             # Status pill
        Card.tsx              # Glassmorphism card
        Skeleton.tsx
        Tooltip.tsx
      StatusBadge.tsx
      Countdown.tsx           # Animated digit-flip countdown
      MoneyInput.tsx          # Decimal input with preview
      StandingsTable.tsx      # Animated rank rows
      ActivityFeed.tsx        # Event feed with icons
      BidForm.tsx
      SplineScene.tsx         # Spline 3D accent (lazy, fallback)
    pages/
      LoginPage.tsx
      BuyerDashboard.tsx
      CreateRfqPage.tsx
      SupplierAuctionsPage.tsx
      AuctionListingPage.tsx
      AuctionDetailPage.tsx
    hooks/
      useAuctionPolling.ts    # 3s interval, clears on unmount
      useAuth.ts
    types/
      api.ts
      auction.ts
    styles/
      globals.css             # Design tokens, glassmorphism utils
  Dockerfile
  vite.config.ts
  tailwind.config.ts
```

## Database Schema

### `suppliers`
```sql
id UUID PK DEFAULT gen_random_uuid()
display_name VARCHAR(200) NOT NULL
legal_name VARCHAR(250)
created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
is_active BOOLEAN NOT NULL DEFAULT TRUE
```

### `users`
```sql
id UUID PK DEFAULT gen_random_uuid()
email CITEXT NOT NULL UNIQUE
password_hash TEXT NOT NULL
display_name VARCHAR(200) NOT NULL
role VARCHAR(20) NOT NULL CHECK (role IN ('BUYER','SUPPLIER'))
supplier_id UUID FK suppliers.id  -- null for buyers
is_active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
```

### `rfqs`
```sql
id UUID PK DEFAULT gen_random_uuid()
buyer_id UUID NOT NULL FK users.id
name VARCHAR(250) NOT NULL
reference_id VARCHAR(100) NOT NULL
currency CHAR(3) NOT NULL
service_date DATE NOT NULL
start_at TIMESTAMPTZ NOT NULL
scheduled_close_at TIMESTAMPTZ NOT NULL
current_close_at TIMESTAMPTZ NOT NULL   -- updated on extension
forced_close_at TIMESTAMPTZ NOT NULL
status VARCHAR(20) NOT NULL
published_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
UNIQUE(buyer_id, reference_id)
CHECK(start_at < scheduled_close_at)
CHECK(scheduled_close_at < forced_close_at)
CHECK(current_close_at <= forced_close_at)
```

### `auction_configs`
```sql
id UUID PK DEFAULT gen_random_uuid()
rfq_id UUID NOT NULL UNIQUE FK rfqs.id
trigger_window_minutes SMALLINT NOT NULL CHECK(> 0)
extension_duration_minutes SMALLINT NOT NULL CHECK(> 0)
triggers TEXT[] NOT NULL   -- {'BID_RECEIVED','ANY_RANK_CHANGE','L1_CHANGE'}
created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
```

### `rfq_suppliers`
```sql
id UUID PK DEFAULT gen_random_uuid()
rfq_id UUID NOT NULL FK rfqs.id
supplier_id UUID NOT NULL FK suppliers.id
invitation_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
invited_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
UNIQUE(rfq_id, supplier_id)
```

### `bids`
```sql
id UUID PK DEFAULT gen_random_uuid()
rfq_id UUID NOT NULL FK rfqs.id
supplier_id UUID NOT NULL FK suppliers.id
submitted_by_user_id UUID NOT NULL FK users.id
freight_charge NUMERIC(14,2) NOT NULL CHECK(>= 0)
origin_charge NUMERIC(14,2) NOT NULL CHECK(>= 0)
destination_charge NUMERIC(14,2) NOT NULL CHECK(>= 0)
total_amount NUMERIC(14,2) GENERATED ALWAYS AS
  (freight_charge + origin_charge + destination_charge) STORED
transit_time_days INTEGER NOT NULL CHECK(>= 0)
valid_until DATE NOT NULL
idempotency_key VARCHAR(128) NOT NULL
accepted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
UNIQUE(rfq_id, supplier_id, idempotency_key)
```

### `auction_events`
```sql
id BIGSERIAL PK
rfq_id UUID NOT NULL FK rfqs.id
actor_user_id UUID FK users.id
bid_id UUID FK bids.id
event_type VARCHAR(40) NOT NULL
occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
details JSONB NOT NULL DEFAULT '{}'
```

### Required Indexes
```sql
CREATE INDEX ON rfqs(buyer_id, status, created_at DESC);
CREATE INDEX ON rfqs(status, current_close_at);
CREATE INDEX ON rfq_suppliers(supplier_id, invitation_status, rfq_id);
CREATE INDEX ON bids(rfq_id, supplier_id, accepted_at DESC);
CREATE INDEX ON bids(rfq_id, total_amount, accepted_at);
CREATE INDEX ON auction_events(rfq_id, id DESC);
```

## Key Algorithms

### Ranking Query
```sql
WITH latest_bid AS (
  SELECT DISTINCT ON (supplier_id)
    supplier_id, id AS bid_id, total_amount,
    freight_charge, origin_charge, destination_charge,
    transit_time_days, valid_until, accepted_at
  FROM bids
  WHERE rfq_id = :rfq_id
  ORDER BY supplier_id, accepted_at DESC, id DESC
), ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY total_amount ASC, accepted_at ASC, supplier_id ASC
    ) AS rank_number
  FROM latest_bid
)
SELECT * FROM ranked ORDER BY rank_number;
```

### Bid Transaction (pseudo-code)
```python
async with db.transaction():
    rfq = await db.fetch("SELECT * FROM rfqs WHERE id=:id FOR UPDATE")
    now = await db.fetch_value("SELECT clock_timestamp()")
    
    # idempotency check
    existing = await find_bid(rfq_id, supplier_id, idempotency_key)
    if existing: return original_result(existing)
    
    require(now >= rfq.start_at,          "AUCTION_NOT_STARTED")
    require(now <  rfq.current_close_at,  "AUCTION_CLOSED")
    require(now <  rfq.forced_close_at,   "AUCTION_CLOSED")
    validate_quote(payload, rfq.service_date)
    
    previous = await latest_bid(rfq_id, supplier_id)
    total = decimal_sum(payload)
    if previous and total >= previous.total_amount:
        raise Conflict("BID_NOT_LOWER_THAN_PREVIOUS")
    
    before = await standings(rfq_id)
    bid    = await insert_bid(...)
    after  = await standings(rfq_id)
    
    await append_event("BID_SUBMITTED", bid_id=bid.id)
    await append_rank_change_events(before, after)
    
    # extension
    trigger_start = rfq.current_close_at - timedelta(minutes=config.x)
    if trigger_start <= now < rfq.current_close_at:
        matched = evaluate_triggers(config.triggers, before, after, bid)
        if matched:
            new_close = min(rfq.current_close_at + timedelta(minutes=config.y),
                            rfq.forced_close_at)
            if new_close > rfq.current_close_at:
                await update_rfq(rfq_id, current_close_at=new_close)
                await append_event("EXTENSION_APPLIED", matched_reasons=matched, ...)
    
    return response(bid, after, rfq)
```

### State Evaluation (always use DB timestamp)
```python
def evaluate_state(rfq, now: datetime) -> str:
    if rfq.status in ("DRAFT", "CANCELLED"):
        return rfq.status
    if now >= rfq.forced_close_at:
        return "FORCE_CLOSED"
    if now >= rfq.current_close_at:
        return "CLOSED"
    if now >= rfq.start_at:
        return "ACTIVE"
    return "SCHEDULED"
```

## API Contract Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/login | Public | Returns JWT |
| GET | /api/v1/me | Any | Current user + role |
| POST | /api/v1/rfqs | BUYER | Create draft RFQ |
| PATCH | /api/v1/rfqs/{id} | BUYER owner | Update draft |
| POST | /api/v1/rfqs/{id}/publish | BUYER owner | Publish |
| POST | /api/v1/rfqs/{id}/cancel | BUYER owner | Cancel scheduled |
| GET | /api/v1/rfqs | BUYER/SUPPLIER | List owned/invited |
| GET | /api/v1/rfqs/{id} | Owner/invitee | Detail |
| GET | /api/v1/rfqs/{id}/standings | Owner/invitee | Current rankings |
| GET | /api/v1/rfqs/{id}/bids | Owner/invitee | Bid history |
| POST | /api/v1/rfqs/{id}/bids | SUPPLIER invitee | Submit bid |
| GET | /api/v1/rfqs/{id}/events | Owner/invitee | Activity feed |

## Design Tokens (UI)

```css
/* Base palette */
--bg-base:      #0a0a0f;   /* near-black, slight blue tint */
--bg-raised:    #111118;
--bg-elevated:  #18181f;
--glass-bg:     rgba(255,255,255,0.04);
--glass-border: rgba(255,255,255,0.08);

/* Accent */
--accent-primary: #6366f1;   /* indigo */
--accent-glow:    rgba(99,102,241,0.3);

/* Status */
--status-active:      #10b981;  /* emerald */
--status-scheduled:   #3b82f6;  /* blue */
--status-closed:      #64748b;  /* slate */
--status-force-close: #ef4444;  /* red */
--status-draft:       #71717a;  /* zinc */
--status-cancelled:   #57534e;  /* stone */

/* Typography */
--font-sans: 'Inter Variable', system-ui;
--font-mono: 'JetBrains Mono', monospace;
--font-feature-numeric: "tnum" 1;  /* tabular figures for money */
```

## Docker Compose Services

```yaml
services:
  db:        postgres:15-alpine
  redis:     redis:7-alpine
  backend:   ./backend  (FastAPI + uvicorn)
  worker:    ./backend  (celery worker)
  beat:      ./backend  (celery beat)
  frontend:  ./frontend (vite preview or nginx)
```

One-command start: `docker compose up --build`
