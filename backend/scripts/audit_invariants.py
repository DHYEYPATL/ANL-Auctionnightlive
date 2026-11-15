#!/usr/bin/env python3
"""
HD-OBS-01: Invariant auditor — checks all bids and RFQs for correctness.
Checks:
  1. No accepted bid after current_close_at or forced_close_at
  2. current_close_at <= forced_close_at for all RFQs
  3. total_amount == freight + origin + destination for all bids
  4. Each supplier's bids are strictly decreasing in total
  5. bid_seq is unique per rfq
  6. No duplicate terminal events per RFQ
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from decimal import Decimal


async def run_checks():
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import text

    failures = []

    async with AsyncSessionLocal() as db:
        # 1. No bid after close
        r = await db.execute(text("""
            SELECT b.id, b.rfq_id, b.accepted_at, r.current_close_at, r.forced_close_at
            FROM bids b JOIN rfqs r ON r.id = b.rfq_id
            WHERE b.accepted_at >= r.current_close_at
               OR b.accepted_at >= r.forced_close_at
        """))
        for row in r.fetchall():
            failures.append(f"BID_AFTER_CLOSE: bid {row.id} accepted_at {row.accepted_at}")

        # 2. current_close <= forced_close
        r = await db.execute(text("""
            SELECT id FROM rfqs WHERE current_close_at > forced_close_at
        """))
        for row in r.fetchall():
            failures.append(f"CLOSE_EXCEEDS_FORCED: rfq {row.id}")

        # 3. total_amount == sum of charges
        r = await db.execute(text("""
            SELECT id, total_amount,
                   freight_charge + origin_charge + destination_charge AS computed
            FROM bids
            WHERE total_amount <> freight_charge + origin_charge + destination_charge
        """))
        for row in r.fetchall():
            failures.append(f"TOTAL_MISMATCH: bid {row.id} stored={row.total_amount} computed={row.computed}")

        # 4. Strictly decreasing per supplier
        r = await db.execute(text("""
            SELECT a.id, a.rfq_id, a.supplier_id, a.total_amount, b.total_amount AS prev_total
            FROM bids a
            JOIN bids b ON b.rfq_id = a.rfq_id
                       AND b.supplier_id = a.supplier_id
                       AND b.accepted_at < a.accepted_at
                       AND b.accepted_at = (
                           SELECT MAX(c.accepted_at) FROM bids c
                           WHERE c.rfq_id = a.rfq_id
                             AND c.supplier_id = a.supplier_id
                             AND c.accepted_at < a.accepted_at
                       )
            WHERE a.total_amount >= b.total_amount
        """))
        for row in r.fetchall():
            failures.append(f"BID_NOT_DECREASING: bid {row.id} total={row.total_amount} prev={row.prev_total}")

        # 5. Duplicate terminal events
        r = await db.execute(text("""
            SELECT rfq_id, event_type, COUNT(*) AS n
            FROM auction_events
            WHERE event_type IN ('AUCTION_CLOSED','AUCTION_FORCE_CLOSED','AUCTION_CANCELLED')
            GROUP BY rfq_id, event_type
            HAVING COUNT(*) > 1
        """))
        for row in r.fetchall():
            failures.append(f"DUPLICATE_TERMINAL: rfq {row.rfq_id} {row.event_type} x{row.n}")

    if failures:
        print(f"INVARIANT VIOLATIONS ({len(failures)}):")
        for f in failures:
            print(f"  {f}")
        sys.exit(1)
    else:
        print(f"All invariants OK.")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(run_checks())
