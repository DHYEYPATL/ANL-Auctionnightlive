import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.core.logging import setup_logging

setup_logging(settings.DEBUG)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="ANL — Auction Night Live", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/health")
async def health():
    from sqlalchemy import text
    from app.db.session import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok}


# Register routers
from app.api.v1 import auth, bids, events, rfqs, standings, suppliers  # noqa: E402

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(rfqs.router, prefix="/api/v1", tags=["rfqs"])
app.include_router(bids.router, prefix="/api/v1", tags=["bids"])
app.include_router(standings.router, prefix="/api/v1", tags=["standings"])
app.include_router(events.router, prefix="/api/v1", tags=["events"])
app.include_router(suppliers.router, prefix="/api/v1", tags=["suppliers"])
