import os
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://anl:anl@db:5432/anl"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "change-me-in-production-32-char-min"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ALGORITHM: str = "HS256"
    DEBUG: bool = False
    APP_ENV: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    FRONTEND_ORIGIN: str = "http://localhost:3000"

    # HD-CON-06: transaction timeouts (ms)
    LOCK_TIMEOUT_MS: int = 2000
    STATEMENT_TIMEOUT_MS: int = 3000
    IDLE_IN_TX_TIMEOUT_MS: int = 5000

    # HD-BID-06: large drop confirmation threshold
    LARGE_DROP_CONFIRM_PCT: int = 50

    # HD-BID-09: rate limiting
    BID_RATE_LIMIT_PER_MINUTE: int = 30
    BID_RATE_LIMIT_BURST: int = 10

    # Auth rate limit: 5 per 15 minutes
    AUTH_RATE_LIMIT: str = "5/15minute"

    # HD-BID-14: allow short auctions in dev
    ALLOW_SHORT_AUCTIONS: bool = True

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_strength(cls, v: str, info: object) -> str:
        # Only enforce in production (HD-SEC-08)
        env = os.getenv("APP_ENV", "development")
        if env not in ("development", "test") and (
            len(v) < 32 or v == "change-me-in-production-32-char-min"
        ):
            raise ValueError("SECRET_KEY must be at least 32 characters in production")
        return v


settings = Settings()
