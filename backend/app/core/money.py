"""Strict money parsing and validation — HD-BID-01, HD-BID-02, HD-BID-03."""
import re
from decimal import Decimal, InvalidOperation

MONEY_RE = re.compile(r"^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$")

MAX_CHARGE = Decimal("1000000000.00")

# HD-BID-03: two-decimal ISO-4217 whitelist
SUPPORTED_CURRENCIES = {
    "USD", "EUR", "GBP", "INR", "SGD", "AED", "AUD",
    "CAD", "CHF", "CNY", "HKD", "SAR",
}


def parse_money(value: object) -> Decimal:
    """Accept only string decimal values matching the strict pattern. Raises ValueError."""
    if not isinstance(value, str):
        raise ValueError("MONEY_FORMAT_INVALID: value must be a string, not a JSON number")
    if not MONEY_RE.fullmatch(value):
        raise ValueError(
            "MONEY_FORMAT_INVALID: use format '1250.50' — "
            "no exponents, NaN, Infinity, leading zeros, spaces or thousands separators"
        )
    try:
        result = Decimal(value)
    except InvalidOperation:
        raise ValueError("MONEY_FORMAT_INVALID")
    if result > MAX_CHARGE:
        raise ValueError(f"CHARGE_EXCEEDS_MAX: maximum per-charge is {MAX_CHARGE}")
    return result


def assert_total_matches(freight: Decimal, origin: Decimal, destination: Decimal, stored: Decimal) -> None:
    """Post-insert assertion that DB total equals app-computed total (HD-BID-02)."""
    computed = freight + origin + destination
    if computed != stored:
        raise RuntimeError(f"TOTAL_MISMATCH: computed {computed} != stored {stored}")


def is_large_drop(new_total: Decimal, previous: Decimal, pct: int = 50) -> bool:
    return new_total < previous * (Decimal(100) - Decimal(pct)) / Decimal(100)


def validate_currency(currency: str) -> str:
    upper = currency.upper().strip()
    if upper not in SUPPORTED_CURRENCIES:
        raise ValueError(f"CURRENCY_NOT_SUPPORTED: '{upper}' is not on the supported list")
    return upper
