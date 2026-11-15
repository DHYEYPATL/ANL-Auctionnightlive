import uuid

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import forbidden, unauthenticated
from app.core.security import decode_token
from app.db.models import User
from app.db.session import get_db

bearer_scheme = HTTPBearer()


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
    if not idempotency_key:
        import uuid as _uuid
        return str(_uuid.uuid4())
    return idempotency_key
