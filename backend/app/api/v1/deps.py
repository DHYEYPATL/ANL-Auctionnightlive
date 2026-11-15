import uuid
import re

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, forbidden, unauthenticated
from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_db

bearer_scheme = HTTPBearer()

# HD-CON-09: idempotency key pattern
IDEM_KEY_RE = re.compile(r"[A-Za-z0-9_.:\-]{8,128}")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise unauthenticated()
    except JWTError:
        raise unauthenticated()

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise unauthenticated()
    if db.in_transaction():
        await db.commit()
    return user


async def require_buyer(user: User = Depends(get_current_user)) -> User:
    if user.role != "BUYER":
        raise forbidden("Buyers only.")
    return user


async def require_supplier(user: User = Depends(get_current_user)) -> User:
    if user.role != "SUPPLIER":
        raise forbidden("Suppliers only.")
    return user


def get_idempotency_key(idempotency_key: str = Header(alias="Idempotency-Key", default="")) -> str:
    """HD-CON-09: required, 8-128 chars [A-Za-z0-9_.:-]. Auto-generate if missing."""
    if not idempotency_key:
        return str(uuid.uuid4())
    if not IDEM_KEY_RE.fullmatch(idempotency_key):
        raise AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Key must be 8–128 chars [A-Za-z0-9_.:-]")
    return idempotency_key
