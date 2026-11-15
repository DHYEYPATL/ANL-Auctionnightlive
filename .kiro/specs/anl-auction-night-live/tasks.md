# Tasks: ANL — Auction Night Live

## Task 1: Project Scaffolding and Docker Compose

- [ ] 1.1 Create `backend/` with `pyproject.toml` (FastAPI, SQLAlchemy async, asyncpg, alembic, celery, redis, argon2-cffi, python-jose, pydantic-settings, httpx, pytest, pytest-asyncio)
- [ ] 1.2 Create `frontend/` with Vite + React + TypeScript template, Tailwind CSS, shadcn/ui base, framer-motion, @splinetool/react-spline
- [ ] 1.3 Create `docker-compose.yml` with services: db (postgres:15), redis (redis:7), backend, worker, beat, frontend
- [ ] 1.4 Create `backend/Dockerfile` and `frontend/Dockerfile`
- [ ] 1.5 Create `backend/app/main.py` with FastAPI app factory, CORS, health endpoint `/health`
- [ ] 1.6 Create `backend/app/core/config.py` Pydantic Settings (DATABASE_URL, REDIS_URL, SECRET_KEY, etc.)
- [ ] 1.7 Create `backend/app/db/session.py` async SQLAlchemy session factory
- [ ] 1.8 Create `backend/app/db/base.py` declarative base
- [ ] 1.9 Set up Alembic: `alembic init alembic`, configure `env.py` with async engine
- [ ] 1.10 Create `.env.example` with all required env vars documented

## Task 2: Database Models and Initial Migration

- [ ] 2.1 Create `backend/app/db/models/supplier.py` — Supplier ORM model
- [ ] 2.2 Create `backend/app/db/models/user.py` — User ORM model with role check
- [ ] 2.3 Create `backend/app/db/models/rfq.py` — RFQ ORM model with all constraints
- [ ] 2.4 Create `backend/app/db/models/auction_config.py` — AuctionConfig model
- [ ] 2.5 Create `backend/app/db/models/rfq_supplier.py` — RfqSupplier join model
- [ ] 2.6 Create `backend/app/db/models/bid.py` — Bid model with GENERATED ALWAYS AS total_amount
- [ ] 2.7 Create `backend/app/db/models/auction_event.py` — AuctionEvent with BIGSERIAL PK
- [ ] 2.8 Generate Alembic migration `0001_initial_schema.py` with all tables, indexes, and constraints
- [ ] 2.9 Verify migration applies cleanly: `alembic upgrade head` inside Docker

## Task 3: Authentication

- [ ] 3.1 Create `backend/app/core/security.py` — Argon2id password hash/verify, JWT sign/verify (HS256, 30min expiry)
- [ ] 3.2 Create auth schemas in `backend/app/schemas/auth.py` — LoginRequest, TokenResponse, MeResponse
- [ ] 3.3 Create `backend/app/api/v1/auth.py` — POST `/api/v1/auth/login`, GET `/api/v1/me`
- [ ] 3.4 Create `get_current_user` dependency that validates JWT and loads user
- [ ] 3.5 Create `require_buyer` and `require_supplier` role-guard dependencies
- [ ] 3.6 Add rate limiting middleware (slowapi or custom) on auth endpoints
- [ ] 3.7 Create seed script `backend/app/db/seed.py` — creates 1 buyer + 3 supplier users + supplier profiles
- [ ] 3.8 Write unit tests: login success, wrong password → 401, missing token → 401, wrong role → 403

## Task 4: RFQ Creation and Draft Management

- [ ] 4.1 Create RFQ schemas in `backend/app/schemas/rfq.py` — CreateRfqRequest, RfqResponse, AuctionConfigSchema
- [ ] 4.2 Create `backend/app/repositories/rfq_repository.py` — create, get_by_id, list_for_buyer, list_for_supplier, update
- [ ] 4.3 Create `backend/app/services/rfq_service.py` — create_rfq (validates BR-01 through BR-04, sets DRAFT, sets current_close_at = scheduled_close_at)
- [ ] 4.4 Create `backend/app/api/v1/rfqs.py` — POST `/api/v1/rfqs`, PATCH `/api/v1/rfqs/{id}`, GET `/api/v1/rfqs`, GET `/api/v1/rfqs/{id}`
- [ ] 4.5 Enforce buyer ownership on PATCH: return 403 if not owner
- [ ] 4.6 Reject PATCH on published RFQ immutable fields with 409 `RFQ_IMMUTABLE`
- [ ] 4.7 Write unit tests: validation of time ordering (BR-01), trigger window (BR-02/03/04), reference_id uniqueness

## Task 5: RFQ Publishing, Lifecycle, and Worker Tasks

- [ ] 5.1 Add publish logic to `rfq_service.py` — freeze fields, set status (SCHEDULED vs ACTIVE based on DB clock), append PUBLISHED event
- [ ] 5.2 Add cancel logic — SCHEDULED → CANCELLED, append AUCTION_CANCELLED event; reject cancel of ACTIVE/CLOSED
- [ ] 5.3 Create `backend/app/services/auction_service.py` — `evaluate_state(rfq, now)` pure function (forced_close → FORCE_CLOSED first)
- [ ] 5.4 Create `backend/app/workers/celery_app.py` — Celery app with Redis broker
- [ ] 5.5 Create `backend/app/workers/auction_tasks.py` — `activate_due_auctions`, `close_due_auctions`, `force_close_due_auctions` tasks (idempotent, use SELECT FOR UPDATE, one event per transition)
- [ ] 5.6 Configure Celery Beat schedule: run close/activate reconciliation every 30 seconds
- [ ] 5.7 Write integration tests: publish → SCHEDULED, publish → ACTIVE (time mock), cancel before start, cancel after start → 409

## Task 6: Supplier Invitation and Authorization

- [ ] 6.1 Create `backend/app/db/models/rfq_supplier.py` repository method `is_active_invitee(rfq_id, supplier_id)`
- [ ] 6.2 Create `require_rfq_access` dependency — buyer owner OR active invited supplier; else 403/404
- [ ] 6.3 Create supplier projection utility — strips `supplier_id`, charge breakdowns, `user_id` from competitor rows
- [ ] 6.4 Apply projection in standings and bid history responses based on requesting user's role
- [ ] 6.5 Write tests: uninvited supplier → 403, invited supplier → 200, buyer gets full data, supplier gets anonymous competitors

## Task 7: Bid Submission — Core Transaction

- [ ] 7.1 Create bid schemas in `backend/app/schemas/bid.py` — SubmitBidRequest (no total/supplier/timestamp fields), BidResponse with extension object
- [ ] 7.2 Create `backend/app/repositories/bid_repository.py` — insert_bid, latest_bid_for_supplier, find_by_idempotency_key, list_for_rfq
- [ ] 7.3 Create `backend/app/services/ranking_service.py` — `get_standings(rfq_id, session)` using the ROW_NUMBER CTE query
- [ ] 7.4 Create `backend/app/services/event_service.py` — append_event (all event types)
- [ ] 7.5 Create `backend/app/services/bid_service.py` — full submit_bid transaction:
  - SELECT FOR UPDATE on rfq
  - clock_timestamp() after lock
  - idempotency check
  - auction window validation (AUCTION_NOT_STARTED, AUCTION_CLOSED)
  - quote validation (FR-BID-02 through FR-BID-09)
  - server-computed total using Python Decimal
  - pre-bid standings → insert bid → post-bid standings
  - append BID_SUBMITTED + RANK_CHANGED events
  - extension evaluation and EXTENSION_APPLIED event
  - return full response
- [ ] 7.6 Create `backend/app/api/v1/bids.py` — POST `/api/v1/rfqs/{id}/bids` with `Idempotency-Key` header extraction
- [ ] 7.7 Write unit tests: total calculation, negative charge → 422, >2dp → 422, transit < 0 → 422, validity before service_date → 422, equal bid → 409, higher bid → 409

## Task 8: Extension Logic Tests

- [ ] 8.1 Write unit tests for trigger evaluation:
  - BID_RECEIVED inside window → matches
  - BID_RECEIVED outside window → no extension
  - ANY_RANK_CHANGE with rank shift → matches
  - ANY_RANK_CHANGE without rank shift → no match
  - L1_CHANGE with new L1 → matches
  - L1_CHANGE with same L1 lower bid → no match
  - Multiple triggers match → one extension event, all reasons recorded
  - Extension capped at forced_close → extension applied to forced_close value
  - Extension already at forced_close cap → no extension event
- [ ] 8.2 Write integration test: concurrent bids on same RFQ serialize correctly (sequential totals, one extension per bid)
- [ ] 8.3 Write integration test: idempotency retry returns original bid, no second extension

## Task 9: Standings and Events API

- [ ] 9.1 Create `backend/app/api/v1/standings.py` — GET `/api/v1/rfqs/{id}/standings` with role-based projection
- [ ] 9.2 Create `backend/app/api/v1/events.py` — GET `/api/v1/rfqs/{id}/events` with cursor pagination (`after_id`, `limit` max 100)
- [ ] 9.3 Add GET `/api/v1/rfqs/{id}/bids` to bids router with cursor pagination and role projection
- [ ] 9.4 Write tests: standings sorting (total ASC → timestamp ASC → supplier_id), supplier sees anonymous labels, buyer sees full detail

## Task 10: Frontend — Design System and Layout

- [ ] 10.1 Set up Tailwind config with custom design tokens (colors, glassmorphism utils, tabular font feature)
- [ ] 10.2 Create `globals.css` with CSS variables matching design tokens in design.md
- [ ] 10.3 Create primitive UI components: `Button`, `Badge`, `Card` (glassmorphism), `Skeleton`, `Tooltip`
- [ ] 10.4 Create `StatusBadge.tsx` — pill with correct color per state (ACTIVE=emerald, FORCE_CLOSED=red, etc.)
- [ ] 10.5 Create `Countdown.tsx` — animated digit-flip countdown using framer-motion, computed from server timestamps
- [ ] 10.6 Create `SplineScene.tsx` — lazy-loaded Spline 3D with gradient fallback on failure/slow load
- [ ] 10.7 Create app shell layout with navigation (Buyer: Dashboard / My RFQs / Create RFQ; Supplier: Invited Auctions / My Bids)
- [ ] 10.8 Set up React Router with protected routes, auth-provider context, and role-based redirect

## Task 11: Frontend — Auth Pages

- [ ] 11.1 Create `LoginPage.tsx` with email/password form, JWT storage in memory (not localStorage), and role-based redirect on success
- [ ] 11.2 Create `api/client.ts` — Axios instance with Authorization header interceptor and 401 redirect
- [ ] 11.3 Create `useAuth.ts` hook — login, logout, current user state

## Task 12: Frontend — Auction Listing Page

- [ ] 12.1 Create `AuctionListingPage.tsx` for both buyer and supplier (role-aware data fetch)
- [ ] 12.2 Implement table columns: RFQ Name/Ref (link), Current Lowest Bid, Current Close, Forced Close, Status badge, View action
- [ ] 12.3 Implement default sort: active first → nearest current_close ascending
- [ ] 12.4 Implement status filter tabs
- [ ] 12.5 Implement cursor pagination controls
- [ ] 12.6 Implement empty state: "No auctions found."
- [ ] 12.7 Implement skeleton loaders for initial load

## Task 13: Frontend — Create RFQ Page (Buyer)

- [ ] 13.1 Create `CreateRfqPage.tsx` with 4 sections: RFQ Details, Schedule, Supplier Access, British Auction Rules
- [ ] 13.2 Implement all field validations client-side (matching SRS 4.1 messages): time ordering, X/Y ≥ 1, at least one trigger
- [ ] 13.3 Implement multi-select supplier list with selected count display
- [ ] 13.4 Implement auction config section with trigger checkboxes and helper text
- [ ] 13.5 Implement Save Draft, Preview, and Publish Auction actions
- [ ] 13.6 Show confirmation summary modal before publish
- [ ] 13.7 After publish, make schedule/config/supplier fields read-only

## Task 14: Frontend — Auction Detail Page

- [ ] 14.1 Create `AuctionDetailPage.tsx` with header, summary tiles, standings, bid form (supplier), config panel, activity feed
- [ ] 14.2 Implement `useAuctionPolling.ts` — 3s interval fetch of standings + events; stops on unmount or auction closed/force-closed
- [ ] 14.3 Create `StandingsTable.tsx` — animated row reordering on rank change (framer-motion layout animations), role-aware columns
- [ ] 14.4 Create `BidForm.tsx` — freight/origin/destination/transit/valid_until fields, preview total (Decimal.js client-side preview only), idempotency key generated per submission attempt, disabled states
- [ ] 14.5 Create `ActivityFeed.tsx` — chronological event list with event-type icons (bid=blue, rank=amber, extension=green, close=red/grey), extension events show prev/new close + reasons
- [ ] 14.6 Implement all UI states per SRS 7.5: loading skeletons, no-bids, scheduled, active, closed, force-closed, bid-rejected states (retain entered values), network error with retry
- [ ] 14.7 Implement summary tiles: Current L1 total, participating supplier count, accepted bid count, extension count

## Task 15: Frontend — API Integration Layer

- [ ] 15.1 Create `api/rfqs.ts` — createRfq, getRfq, listRfqs, publishRfq, cancelRfq, patchRfq
- [ ] 15.2 Create `api/bids.ts` — submitBid (with Idempotency-Key header), listBids
- [ ] 15.3 Create `api/standings.ts` — getStandings
- [ ] 15.4 Create `api/events.ts` — getEvents (cursor pagination)
- [ ] 15.5 Create typed response interfaces in `types/api.ts` and `types/auction.ts` matching all API response shapes
- [ ] 15.6 Implement error extraction from `{ error: { code, message, details } }` format and display appropriate UI messages

## Task 16: End-to-End Smoke Test and Final Polish

- [ ] 16.1 Write integration smoke test: create buyer + suppliers, create RFQ, publish, submit bids, verify extension, verify close
- [ ] 16.2 Verify `docker compose up --build` starts all services and seeded users can log in
- [ ] 16.3 Verify p95 bid API response under 100 concurrent requests (use `httpx` async load test script)
- [ ] 16.4 Add structured logging middleware (request_id, actor_id, rfq_id, latency) to FastAPI
- [ ] 16.5 Add `/health` endpoint that checks DB and Redis connectivity
- [ ] 16.6 Write `README.md` with one-command start instructions, seed credentials, and feature walkthrough
- [ ] 16.7 Final UI audit: check all empty states, loading skeletons, error messages, mobile/tablet layout
