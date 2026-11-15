import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.money import SUPPORTED_CURRENCIES


VALID_TRIGGERS = {"BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"}


class AuctionConfigSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")  # HD-SEC-07
    trigger_window_minutes: int = Field(ge=1, description="Must be >= 1")
    extension_duration_minutes: int = Field(ge=1, description="Must be >= 1")
    triggers: list[Literal["BID_RECEIVED", "ANY_RANK_CHANGE", "L1_CHANGE"]] = Field(min_length=1)


class CreateRfqRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")  # HD-SEC-07
    name: str = Field(min_length=1, max_length=250)
    reference_id: str = Field(min_length=1, max_length=100)
    currency: str = Field(min_length=3, max_length=3)
    service_date: date
    start_at: datetime
    scheduled_close_at: datetime
    forced_close_at: datetime
    supplier_ids: list[uuid.UUID] = Field(min_length=1)
    auction_config: AuctionConfigSchema

    @model_validator(mode="after")
    def validate_time_ordering(self) -> "CreateRfqRequest":
        if self.start_at >= self.scheduled_close_at:
            raise ValueError("Bid start must be earlier than bid close.")
        if self.scheduled_close_at >= self.forced_close_at:
            raise ValueError("Forced close must be later than the scheduled bid close.")
        return self


class PatchRfqRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=250)
    reference_id: str | None = Field(default=None, min_length=1, max_length=100)
    service_date: date | None = None
    supplier_ids: list[uuid.UUID] | None = None
    auction_config: AuctionConfigSchema | None = None


class AuctionConfigResponse(BaseModel):
    trigger_window_minutes: int
    extension_duration_minutes: int
    triggers: list[str]


class RfqResponse(BaseModel):
    id: uuid.UUID
    name: str
    reference_id: str
    currency: str
    service_date: date
    start_at: datetime
    scheduled_close_at: datetime
    current_close_at: datetime
    forced_close_at: datetime
    status: str
    published_at: datetime | None
    created_at: datetime
    version: int = 0
    auction_config: AuctionConfigResponse | None = None
    invited_supplier_ids: list[uuid.UUID] = []
    current_l1_total: str | None = None
    participating_supplier_count: int = 0
    accepted_bid_count: int = 0
    extension_count: int = 0

    model_config = ConfigDict(from_attributes=True)
