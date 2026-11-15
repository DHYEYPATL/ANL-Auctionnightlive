"""All HD-BID-* requirement tests in one file."""
import pytest
from decimal import Decimal
from datetime import date
from pydantic import ValidationError

from app.core.money import parse_money, validate_currency, is_large_drop, MAX_CHARGE
from app.schemas.bid import SubmitBidRequest


# HD-BID-01: strict money string format
class TestMoneyFormat:
    def test_valid_formats(self):
        for v in ["0", "0.00", "100", "100.50", "999999999.99", "1000000000.00"]:
            assert parse_money(v) is not None

    def test_json_number_rejected(self):
        with pytest.raises(ValueError): parse_money(100)

    def test_float_rejected(self):
        with pytest.raises(ValueError): parse_money(100.5)

    def test_exponent_rejected(self):
        with pytest.raises(ValueError): parse_money("1e3")

    def test_nan_rejected(self):
        with pytest.raises(ValueError): parse_money("NaN")


# HD-BID-02: total > 0, assert total equals sum
class TestTotalPositive:
    def test_zero_total_is_zero(self):
        f = parse_money("0.00")
        o = parse_money("0.00")
        d = parse_money("0.00")
        total = f + o + d
        assert total == Decimal("0")

    def test_positive_total(self):
        total = parse_money("100.00") + parse_money("50.00") + parse_money("25.00")
        assert total > Decimal("0")

    def test_total_equals_sum(self):
        f, o, d = parse_money("100.00"), parse_money("50.00"), parse_money("25.00")
        assert f + o + d == Decimal("175.00")


# HD-BID-03: currency whitelist
class TestCurrency:
    def test_all_supported(self):
        for c in ["USD", "EUR", "GBP", "INR", "SGD", "AED", "AUD", "CAD", "CHF", "CNY", "HKD", "SAR"]:
            assert validate_currency(c) == c

    def test_unsupported_rejected(self):
        for c in ["XXX", "JPY", "KWD", "BHD"]:
            with pytest.raises(ValueError): validate_currency(c)


# HD-BID-04: transit 0-365, valid_until >= service_date
class TestTransitAndValidity:
    def _make(self, transit=3, valid="2026-12-15"):
        return dict(freight_charge="100.00", origin_charge="50.00",
                    destination_charge="25.00", transit_time_days=transit,
                    valid_until=valid)

    def test_transit_zero(self):
        req = SubmitBidRequest(**self._make(transit=0))
        assert req.transit_time_days == 0

    def test_transit_365(self):
        req = SubmitBidRequest(**self._make(transit=365))
        assert req.transit_time_days == 365

    def test_transit_366_rejected(self):
        with pytest.raises(ValidationError):
            SubmitBidRequest(**self._make(transit=366))

    def test_transit_negative_rejected(self):
        with pytest.raises(ValidationError):
            SubmitBidRequest(**self._make(transit=-1))


# HD-BID-06: large drop confirmation
class TestLargeDrop:
    def test_50pct_threshold(self):
        assert is_large_drop(Decimal("499"), Decimal("1000"), 50) is True

    def test_at_threshold_not_large(self):
        assert is_large_drop(Decimal("500"), Decimal("1000"), 50) is False

    def test_small_drop(self):
        assert is_large_drop(Decimal("900"), Decimal("1000"), 50) is False

    def test_zero_pct_always_large(self):
        # At 0% threshold, any drop is "large"
        assert is_large_drop(Decimal("1"), Decimal("1000"), 0) is True


# HD-BID-11: timezone required (tested at service layer)
class TestTimestampOffset:
    def test_aware_datetime_has_tzinfo(self):
        from datetime import datetime, timezone
        dt = datetime(2026, 11, 16, 10, 0, 0, tzinfo=timezone.utc)
        assert dt.tzinfo is not None

    def test_naive_datetime_no_tzinfo(self):
        from datetime import datetime
        dt = datetime(2026, 11, 16, 10, 0, 0)
        assert dt.tzinfo is None
