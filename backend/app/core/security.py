"""
Security utilities — HD-SEC-03: Argon2id hashing, JWT with 30s leeway.
Passwords never stored plain. Tokens validated on every request.
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# HD-SEC-01: Argon2id — secure, resistant to GPU attacks
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# HD-SEC-03: 30s JWT leeway for clock skew
JWT_OPTIONS = {"leeway": 30}


def hash_password(password: str) -> str:
    """Hash password with Argon2id. Never call with plain password in logs."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time comparison via argon2."""
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {"sub": subject, "exp": expire, "iat": datetime.now(timezone.utc)}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate token with 30s clock leeway (HD-SEC-02 partial)."""
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options=JWT_OPTIONS,
    )
