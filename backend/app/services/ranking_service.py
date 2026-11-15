"""
Ranking service — CHG-1: tie-break uses bid_seq, not accepted_at.
HD-RT-06: fast path reads denormalized current_* columns from rfq_suppliers.
"""
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
    bid_seq: int = 0

    @property
    def rank_label(self) -> str:
        return f"L{self.rank_number}"


async def get_standings_from_rfq_suppliers(rfq_id: uuid.UUID, db: AsyncSession) -> list[StandingEntry]:
    """
    Fast O(invited_suppliers) path using denormalized current_* columns (HD-RT-06).
    Uses bid_seq as tie-break (CHG-1).
    Falls back to the full CTE for suppliers with no current bid.
    """
    sql = text("""
        WITH active_bids AS (
            SELECT
                rs.supplier_id,
                b.id          AS bid_id,
                b.total_amount,
                b.freight_charge,
                b.origin_charge,
                b.destination_charge,
                b.transit_time_days,
                b.valid_until,
                b.accepted_at,
                COALESCE(b.bid_seq, 0) AS bid_seq
            FROM rfq_suppliers rs
            JOIN bids b ON b.id = rs.current_bid_id
            WHERE rs.rfq_id = :rfq_id
              AND rs.invitation_status = 'ACTIVE'
              AND rs.current_bid_id IS NOT NULL
        ), ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       ORDER BY total_amount ASC,
                                bid_seq      ASC,
                                supplier_id  ASC
                   ) AS rank_number
            FROM active_bids
        )
        SELECT * FROM ranked ORDER BY rank_number
    """)
    result = await db.execute(sql, {"rfq_id": str(rfq_id)})
    rows = result.mappings().all()
    if rows:
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
                bid_seq=r["bid_seq"] or 0,
            )
            for r in rows
        ]
    # Fallback CTE for initial case (no current_bid_id yet)
    return await get_standings_cte(rfq_id, db)


async def get_standings_cte(rfq_id: uuid.UUID, db: AsyncSession) -> list[StandingEntry]:
    """Full CTE fallback — used when denormalized columns are not yet populated."""
    sql = text("""
        WITH latest_bid AS (
            SELECT DISTINCT ON (b.supplier_id)
                   b.supplier_id,
                   b.id AS bid_id,
                   b.total_amount,
                   b.freight_charge,
                   b.origin_charge,
                   b.destination_charge,
                   b.transit_time_days,
                   b.valid_until,
                   b.accepted_at,
                   COALESCE(b.bid_seq, 0) AS bid_seq
            FROM bids b
            WHERE b.rfq_id = :rfq_id
            ORDER BY b.supplier_id, b.accepted_at DESC, b.id DESC
        ), ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       ORDER BY total_amount ASC, bid_seq ASC, supplier_id ASC
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
            bid_seq=r["bid_seq"] or 0,
        )
        for r in rows
    ]


# Keep legacy alias for backward compat
async def get_standings(rfq_id: uuid.UUID, db: AsyncSession) -> list[StandingEntry]:
    return await get_standings_from_rfq_suppliers(rfq_id, db)
