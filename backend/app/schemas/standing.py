import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class StandingRow(BaseModel):
    rank_number: int
    rank_label: str
    supplier_id: uuid.UUID | None = None  # omitted for supplier view of competitors
    supplier_label: str
    total_amount: str
    freight_charge: str | None = None
    origin_charge: str | None = None
    destination_charge: str | None = None
    transit_time_days: int | None = None
    valid_until: date | None = None
    accepted_at: datetime


class StandingsResponse(BaseModel):
    rfq_id: uuid.UUID
    standings: list[StandingRow]
    current_l1_total: str | None
