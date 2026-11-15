"""HD-BID-01/02/03: strict money parser tests."""
import pytest
from decimal import Decimal
from app.core.money import parse_money, validate_currency, is_large_drop, MAX_CHARGE


# ── parse_money ──────────────────────────────────────────────────────────────

def test_valid_integer_string():
    assert parse_money("100") == Decimal("100")


def test_valid_decimal_string():
    assert parse_money("1250.50") == Decimal("1250.50")


def test_zero_allowed():
    assert parse_money("0") == Decimal("0")


def test_zero_with_decimals():
    assert parse_money("0.00") == Decimal("0.00")


def test_one_decimal_allowed():
    assert parse_money("9.5") == Decimal("9.5")


def test_json_number_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money(1250.50)


def test_float_string_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("1.250,50")


def test_exponent_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("1e3")


def test_nan_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("NaN")


def test_infinity_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("Infinity")


def test_leading_plus_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("+100.00")


def test_leading_zero_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("01.50")


def test_space_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("100 .00")


def test_three_decimals_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("100.001")


def test_empty_string_rejected():
    with pytest.raises(ValueError, match="MONEY_FORMAT_INVALID"):
        parse_money("")


def test_max_charge_allowed():
    assert parse_money("1000000000.00") == MAX_CHARGE


def test_exceeds_max_rejected():
    with pytest.raises(ValueError, match="CHARGE_EXCEEDS_MAX"):
        parse_money("1000000001.00")


# ── validate_currency ────────────────────────────────────────────────────────

def test_usd_valid():
    assert validate_currency("USD") == "USD"


def test_lowercase_accepted():
    assert validate_currency("eur") == "EUR"


def test_unsupported_currency():
    with pytest.raises(ValueError, match="CURRENCY_NOT_SUPPORTED"):
        validate_currency("XXX")


def test_three_decimal_currency_rejected():
    # KWD is a 3-decimal currency — not on the whitelist
    with pytest.raises(ValueError, match="CURRENCY_NOT_SUPPORTED"):
        validate_currency("KWD")


# ── is_large_drop ─────────────────────────────────────────────────────────────

def test_large_drop_detected():
    assert is_large_drop(Decimal("400"), Decimal("1000"), 50) is True


def test_exact_threshold_not_large():
    # 500 is exactly 50% of 1000 — not strictly below
    assert is_large_drop(Decimal("500"), Decimal("1000"), 50) is False


def test_just_below_threshold():
    assert is_large_drop(Decimal("499"), Decimal("1000"), 50) is True


def test_small_drop_not_large():
    assert is_large_drop(Decimal("900"), Decimal("1000"), 50) is False
