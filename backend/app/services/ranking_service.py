import uuid
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class StandingEntry:
    supplier_id: uuid.UUID
    bid_id: uuid.UUID
    total_amount: Decimal
    freight_charge: Decimal
    origin_charge: Decimal
    destination_charge: Decimal
    transit_time_days: int
    valid_until: object  # date
    accepted_at: datetime
    rank_number: int

    @property
    def rank_label(self) -> str:
        return f"L{self.rank_number}"


async def get_standings(rfq_id: uuid.UUID, db: AsyncSession) -> list[StandingEntry]:
    sql = text("""
        WITH latest_bid AS (
            SELECT DISTINCT ON (supplier_id)
                   supplier_id,
                   id AS bid_id,
                   total_amount,
                   freight_charge,
                   origin_charge,
                   destination_charge,
                   transit_time_days,
                   valid_until,
                   accepted_at
            FROM bids
            WHERE rfq_id = :rfq_id
            ORDER BY supplier_id, accepted_at DESC, id DESC
        ), ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       ORDER BY total_amount ASC, accepted_at ASC, supplier_id ASC
                   ) AS rank_number
            FROM latest_bid
        )
        SELECT * FROM ranked ORDER BY rank_number
    """)
    result = await db.execute(sql, {"rfq_id": str(rfq_id)})
    rows = result.mappings().all()
    return [
        StandingEntry(
            supplier_id=uuid.UUID(str(r["supplier_id"])),
            bid_id=uuid.UUID(str(r["bid_id"])),
            total_amount=Decimal(str(r["total_amount"])),
            freight_charge=Decimal(str(r["freight_charge"])),
            origin_charge=Decimal(str(r["origin_charge"])),
            destination_charge=Decimal(str(r["destination_charge"])),
            transit_time_days=r["transit_time_days"],
            valid_until=r["valid_until"],
            accepted_at=r["accepted_at"],
            rank_number=r["rank_number"],
        )
        for r in rows
    ]
