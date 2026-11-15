"""Additional money edge cases — HD-BID-01/02/03."""
import pytest
from decimal import Decimal

from app.core.money import parse_money, validate_currency, is_large_drop


def test_all_zeros_valid():
    assert parse_money("0.00") == Decimal("0")


def test_single_zero_valid():
    assert parse_money("0") == Decimal("0")


def test_large_valid_amount():
    assert parse_money("999999999.99") == Decimal("999999999.99")


def test_comma_as_decimal_rejected():
    with pytest.raises(ValueError):
        parse_money("1,250.50")


def test_negative_string_rejected():
    with pytest.raises(ValueError):
        parse_money("-100.00")


def test_unicode_digit_rejected():
    with pytest.raises(ValueError):
        parse_money("１00.00")


def test_whitespace_string_rejected():
    with pytest.raises(ValueError):
        parse_money("  100.00  ")


def test_bool_rejected():
    with pytest.raises(ValueError):
        parse_money(True)  # type: ignore


def test_none_rejected():
    with pytest.raises(ValueError):
        parse_money(None)  # type: ignore


def test_dict_rejected():
    with pytest.raises(ValueError):
        parse_money({"amount": 100})  # type: ignore


def test_twelve_integer_digits_valid():
    # 12-digit integer: 999999999999 > MAX_CHARGE (1000000000.00), so it's rejected
    # The regex allows it but MAX_CHARGE check stops it. That's correct behavior.
    with pytest.raises(ValueError, match="CHARGE_EXCEEDS_MAX"):
        parse_money("999999999999")


def test_thirteen_integer_digits_rejected():
    with pytest.raises(ValueError):
        parse_money("1000000000000")  # 13 digits


def test_gbp_valid():
    assert validate_currency("GBP") == "GBP"


def test_inr_valid():
    assert validate_currency("INR") == "INR"


def test_jpy_rejected():
    # JPY is zero-decimal, not in our whitelist
    with pytest.raises(ValueError):
        validate_currency("JPY")


def test_large_drop_zero_total():
    # Zero total must be caught by total>0 check, not large_drop.
    # is_large_drop(0, prev) returns True (0 < prev*0.5), which is correct.
    assert is_large_drop(Decimal("0"), Decimal("1000"), 50) is True


def test_large_drop_50pct_threshold():
    prev = Decimal("1000")
    # 500 is exactly 50% — not strictly below threshold
    assert is_large_drop(Decimal("500"), prev, 50) is False
    # 499 is below threshold
    assert is_large_drop(Decimal("499"), prev, 50) is True


def test_large_drop_custom_pct():
    prev = Decimal("1000")
    # 40% threshold: new < 1000*(100-40)/100 = 600 is a large drop
    assert is_large_drop(Decimal("590"), prev, 40) is True   # 590 < 600 → large drop
    assert is_large_drop(Decimal("600"), prev, 40) is False  # 600 == 600 → NOT large (not strictly below)
    assert is_large_drop(Decimal("650"), prev, 40) is False  # 650 > 600 → not a large drop
