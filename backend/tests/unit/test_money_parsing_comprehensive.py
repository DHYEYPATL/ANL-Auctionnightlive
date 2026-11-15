"""Comprehensive money parsing — exhaustive edge cases HD-BID-01."""
import pytest
from decimal import Decimal
from app.core.money import parse_money

VALID = [
    ("0", Decimal("0")),
    ("0.0", Decimal("0.0")),
    ("0.00", Decimal("0.00")),
    ("1", Decimal("1")),
    ("1.5", Decimal("1.5")),
    ("1.50", Decimal("1.50")),
    ("100.00", Decimal("100.00")),
    ("1000000000.00", Decimal("1000000000.00")),
    ("999999999.99", Decimal("999999999.99")),
]

INVALID = [
    1250.50,         # float
    1250,            # int
    "1,250.50",      # thousands separator
    "1.250,50",      # European format
    "1e3",           # exponent
    "NaN",
    "Infinity",
    "-inf",
    "+100.00",       # leading +
    "-100.00",       # negative
    "01.00",         # leading zero
    "00.50",
    "100.001",       # 3 decimals
    "100.1234",
    " 100.00",       # leading space
    "100.00 ",       # trailing space
    "",              # empty
    ".",
    ".50",           # no integer part
    "100.",          # trailing dot
    None,
    True,
    False,
    [],
    {},
]


@pytest.mark.parametrize("value,expected", VALID)
def test_valid_money(value, expected):
    assert parse_money(value) == expected


@pytest.mark.parametrize("value", INVALID)
def test_invalid_money(value):
    with pytest.raises((ValueError, TypeError)):
        parse_money(value)
