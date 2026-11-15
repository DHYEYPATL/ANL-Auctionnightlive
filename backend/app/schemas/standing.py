import uuid
from datetime import date, datetime
from pydantic import BaseModel


class StandingRow(BaseModel):
    rank_number: int
    rank_label: str
    supplier_id: uuid.UUID | None = None
    supplier_label: str
    is_self: bool = False
    total_amount: str
    freight_charge: str | None = None
    origin_charge: str | None = None
    destination_charge: str | None = None
    transit_time_days: int | None = None
    valid_until: date | None = None
    accepted_at: datetime
    bid_seq: int | None = None


class StandingsResponse(BaseModel):
    rfq_id: uuid.UUID
    standings: list[StandingRow]
    current_l1_total: str | None
    # HD-RT-01: server_now, version, status, timing
    version: int = 0
    status: str = ""
    server_now: str = ""
    current_close_at: str = ""
    forced_close_at: str = ""
