"""
FastAPI application factory — hardened per HD-SEC-07/08/06.

HD-SEC-07: 32KB body cap, security headers, CORS exact origin
HD-SEC-06: /docs disabled in production, uniform 404
HD-SEC-08: refuse to start in prod with weak SECRET_KEY
"""
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.core.logging import setup_logging

setup_logging(settings.DEBUG)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


# HD-SEC-06: disable docs in production
docs_url = "/docs" if settings.APP_ENV != "production" else None
redoc_url = "/redoc" if settings.APP_ENV != "production" else None
openapi_url = "/openapi.json" if settings.APP_ENV != "production" else None

app = FastAPI(
    title="ANL — Auction Night Live",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

# HD-SEC-07: CORS — exact frontend origin only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN] + settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """HD-SEC-07: security response headers."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
        if settings.APP_ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """HD-SEC-07: 32KB body cap."""
    MAX_BODY = 32 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY:
            return JSONResponse(
                status_code=413,
                content={"error": {"code": "REQUEST_TOO_LARGE", "message": "Body exceeds 32KB limit."}},
            )
        return await call_next(request)


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
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
    db_ok = False
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "env": settings.APP_ENV,
    }


# Register routers
from app.api.v1 import auth, bids, events, rfqs, standings, suppliers  # noqa: E402

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(rfqs.router, prefix="/api/v1", tags=["rfqs"])
app.include_router(bids.router, prefix="/api/v1", tags=["bids"])
app.include_router(standings.router, prefix="/api/v1", tags=["standings"])
app.include_router(events.router, prefix="/api/v1", tags=["events"])
app.include_router(suppliers.router, prefix="/api/v1", tags=["suppliers"])
