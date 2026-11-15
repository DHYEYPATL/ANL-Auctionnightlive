import hashlib
import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.money import parse_money


class SubmitBidRequest(BaseModel):
    """HD-BID-01/02/08: money as string-only, strict regex. HD-BID-04: transit/validity bounds.
    HD-SEC-07: extra=forbid rejects total_amount, supplier_id, rank, accepted_at."""

    model_config = ConfigDict(extra="forbid")

    freight_charge: str
    origin_charge: str
    destination_charge: str
    transit_time_days: int = Field(ge=0, le=365)
    valid_until: date
    # HD-BID-06: large-drop confirmation
    confirm_large_drop: bool = False

    @field_validator("freight_charge", "origin_charge", "destination_charge", mode="before")
    @classmethod
    def coerce_string_only(cls, v: object) -> str:
        """Reject JSON numbers at the boundary (HD-BID-01)."""
        if not isinstance(v, str):
            raise ValueError("MONEY_FORMAT_INVALID: value must be a JSON string, not a number")
        return v

    @field_validator("freight_charge", "origin_charge", "destination_charge", mode="after")
    @classmethod
    def validate_money_format(cls, v: str) -> str:
        parse_money(v)   # raises ValueError with MONEY_FORMAT_INVALID on bad pattern
        return v

    def parsed_freight(self) -> Decimal:
        return parse_money(self.freight_charge)

    def parsed_origin(self) -> Decimal:
        return parse_money(self.origin_charge)

    def parsed_destination(self) -> Decimal:
        return parse_money(self.destination_charge)

    def total(self) -> Decimal:
        return self.parsed_freight() + self.parsed_origin() + self.parsed_destination()

    def canonical_hash(self) -> str:
        """SHA-256 of canonical payload — used for idempotency payload matching (HD-CON-09)."""
        payload = {
            "freight_charge": self.freight_charge,
            "origin_charge": self.origin_charge,
            "destination_charge": self.destination_charge,
            "transit_time_days": self.transit_time_days,
            "valid_until": self.valid_until.isoformat(),
            "confirm_large_drop": self.confirm_large_drop,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


class ExtensionResult(BaseModel):
    applied: bool
    previous_close_at: datetime | None = None
    new_close_at: datetime | None = None
    matched_triggers: list[str] = []
    capped_by_forced_close: bool = False
    extension_number: int = 0


class BidResponse(BaseModel):
    bid_id: uuid.UUID
    rfq_id: uuid.UUID
    bid_seq: int | None = None
    total_amount: str
    currency: str
    accepted_at: datetime
    rank: str
    current_l1_total: str | None
    current_close_at: datetime
    extension: ExtensionResult
    # HD-CON-14: receipt fields
    rfq_version: int = 0
    request_id: str = ""
    replayed: bool = False


class BidListItem(BaseModel):
    id: uuid.UUID
    rfq_id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    supplier_label: str
    freight_charge: str | None = None
    origin_charge: str | None = None
    destination_charge: str | None = None
    total_amount: str
    transit_time_days: int | None = None
    valid_until: date | None = None
    accepted_at: datetime
    rank: str
    bid_seq: int | None = None
