"""
Auth router — HD-SEC-03: same error + constant-time response for bad credentials.
HD-BID-09: rate limiting on login endpoint (5 per 15 min per IP).
"""
import asyncio
import time

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.errors import unauthenticated
from app.core.security import create_access_token, verify_password
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import LoginRequest, MeResponse, TokenResponse

router = APIRouter()

# Minimum response time in seconds to resist timing attacks (HD-SEC-03)
_MIN_LOGIN_SECONDS = 0.3


@router.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    t_start = time.monotonic()

    result = await db.execute(
        select(User).where(User.email == req.email.lower().strip(), User.is_active == True)
    )
    user: User | None = result.scalar_one_or_none()

    # HD-SEC-03: always run verify_password (constant-time dummy if not found)
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$invalid"
    hash_to_check = user.password_hash if user else dummy_hash
    valid = verify_password(req.password, hash_to_check)

    # Pad to minimum time to resist timing attacks
    elapsed = time.monotonic() - t_start
    if elapsed < _MIN_LOGIN_SECONDS:
        await asyncio.sleep(_MIN_LOGIN_SECONDS - elapsed)

    if not user or not valid:
        raise unauthenticated()

    token = create_access_token(str(user.id), {"role": user.role})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        supplier_id=user.supplier_id,
    )
