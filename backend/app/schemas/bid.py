import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


def _validate_money(v: Decimal) -> Decimal:
    if v < 0:
        raise ValueError("Enter a non-negative amount with up to two decimal places.")
    if v.as_tuple().exponent < -2:
        raise ValueError("Enter a non-negative amount with up to two decimal places.")
    return v


class SubmitBidRequest(BaseModel):
    freight_charge: Decimal = Field(decimal_places=2, ge=0)
    origin_charge: Decimal = Field(decimal_places=2, ge=0)
    destination_charge: Decimal = Field(decimal_places=2, ge=0)
    transit_time_days: int = Field(ge=0, description="Enter a whole number of days >= 0")
    valid_until: date

    @field_validator("freight_charge", "origin_charge", "destination_charge", mode="before")
    @classmethod
    def coerce_decimal(cls, v: object) -> Decimal:
        d = Decimal(str(v))
        return _validate_money(d)


class ExtensionResult(BaseModel):
    applied: bool
    previous_close_at: datetime | None = None
    new_close_at: datetime | None = None
    matched_triggers: list[str] = []
    capped_by_forced_close: bool = False


class BidResponse(BaseModel):
    bid_id: uuid.UUID
    rfq_id: uuid.UUID
    total_amount: str
    currency: str
    accepted_at: datetime
    rank: str
    current_l1_total: str | None
    current_close_at: datetime
    extension: ExtensionResult


class BidListItem(BaseModel):
    id: uuid.UUID
    rfq_id: uuid.UUID
    supplier_id: uuid.UUID | None = None  # hidden for supplier view of competitors
    supplier_label: str  # "Supplier A" or actual name
    freight_charge: str | None = None
    origin_charge: str | None = None
    destination_charge: str | None = None
    total_amount: str
    transit_time_days: int | None = None
    valid_until: date | None = None
    accepted_at: datetime
    rank: str
