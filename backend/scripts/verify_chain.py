#!/usr/bin/env python3
"""
HD-SEC-13: Verify the event hash chain for one or all RFQs.
Usage:
    python scripts/verify_chain.py                      # all RFQs
    python scripts/verify_chain.py <rfq_id>             # single RFQ
"""
import asyncio
import hashlib
import json
import sys
import uuid
from datetime import datetime

from sqlalchemy import select, text

# Allow running from backend/ directory
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


async def verify_rfq(db, rfq_id: uuid.UUID) -> bool:
    from app.db.models import AuctionEvent
    result = await db.execute(
        select(AuctionEvent)
        .where(AuctionEvent.rfq_id == rfq_id)
        .order_by(AuctionEvent.id.asc())
    )
    events = result.scalars().all()
    if not events:
        return True

    prev_hash = None
    ok = True
    for e in events:
        if e.event_hash is None:
            continue  # pre-hardening event
        canonical = json.dumps({
            "prev_hash": prev_hash or "",
            "event_type": e.event_type,
            "occurred_at": e.occurred_at.isoformat() if isinstance(e.occurred_at, datetime) else str(e.occurred_at),
            "details": e.details,
        }, sort_keys=True, default=str)
        expected = hashlib.sha256(canonical.encode()).hexdigest()
        if expected != e.event_hash:
            print(f"  FAIL event id={e.id} seq={e.event_seq}: expected {expected[:12]}… got {str(e.event_hash)[:12]}…")
            ok = False
        prev_hash = e.event_hash

    return ok


async def main():
    from app.db.session import AsyncSessionLocal
    from sqlalchemy import select as sel
    from app.db.models import Rfq

    async with AsyncSessionLocal() as db:
        if len(sys.argv) > 1:
            rfq_ids = [uuid.UUID(sys.argv[1])]
        else:
            result = await db.execute(sel(Rfq.id))
            rfq_ids = [r[0] for r in result.fetchall()]

        failures = 0
        for rid in rfq_ids:
            ok = await verify_rfq(db, rid)
            status = "OK  " if ok else "FAIL"
            print(f"[{status}] RFQ {rid}")
            if not ok:
                failures += 1

        print(f"\n{len(rfq_ids)} RFQs checked, {failures} failed")
        sys.exit(0 if failures == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
