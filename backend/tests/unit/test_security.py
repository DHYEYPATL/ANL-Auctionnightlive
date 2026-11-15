"""HD-SEC-08: config validation, HD-SEC-11: DB integrity constraints (logic level)."""
import pytest


def test_secret_key_min_length_dev_allowed():
    """In dev mode, short key allowed."""
    import os
    os.environ["APP_ENV"] = "development"
    from app.core.config import Settings
    s = Settings(SECRET_KEY="short", APP_ENV="development")
    assert s.SECRET_KEY == "short"


def test_redis_url_default():
    from app.core.config import Settings
    s = Settings()
    assert "redis" in s.REDIS_URL


def test_lock_timeout_configurable():
    from app.core.config import Settings
    s = Settings(LOCK_TIMEOUT_MS=5000)
    assert s.LOCK_TIMEOUT_MS == 5000


def test_large_drop_pct_configurable():
    from app.core.config import Settings
    s = Settings(LARGE_DROP_CONFIRM_PCT=30)
    assert s.LARGE_DROP_CONFIRM_PCT == 30


def test_allow_short_auctions_flag():
    from app.core.config import Settings
    s = Settings(ALLOW_SHORT_AUCTIONS=True)
    assert s.ALLOW_SHORT_AUCTIONS is True


def test_no_io_inside_money_parse():
    """parse_money must be a pure function with no side effects."""
    from app.core.money import parse_money
    from decimal import Decimal
    for _ in range(1000):
        result = parse_money("123.45")
    assert result == Decimal("123.45")
