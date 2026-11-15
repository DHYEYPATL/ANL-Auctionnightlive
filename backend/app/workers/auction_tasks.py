"""
Hardened Celery worker tasks — HD-LIFE-01 to 06.

HD-LIFE-02: SELECT FOR UPDATE SKIP LOCKED, re-evaluate status after lock
HD-LIFE-03: INSERT ... ON CONFLICT DO NOTHING for terminal events
HD-LIFE-04: occurred_at = logical close time, not wall time
HD-LIFE-05: acks_late, autoretry, time limits
HD-LIFE-06: persisted status may lag; derived status is authoritative
"""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import AuctionEvent, Rfq
from app.services.auction_service import evaluate_state
from app.workers.celery_app import celery_app


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.workers.auction_tasks.reconcile_auctions",
    acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=30,
    task_soft_time_limit=20,
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=5,
)
def reconcile_auctions():
    _run(_reconcile())


async def _reconcile():
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        async with db.begin():
            # HD-LIFE-02: pick due rows with SKIP LOCKED
            result = await db.execute(text("""
                SELECT id
                FROM rfqs
                WHERE status IN ('SCHEDULED', 'ACTIVE')
                  AND (
                    (status = 'SCHEDULED' AND clock_timestamp() >= start_at)
                    OR clock_timestamp() >= LEAST(current_close_at, forced_close_at)
                  )
                ORDER BY LEAST(current_close_at, forced_close_at)
                LIMIT 100
                FOR UPDATE SKIP LOCKED
            """))
            rfq_ids = [row[0] for row in result.fetchall()]

            if not rfq_ids:
                return

            # Re-fetch each locked row and re-evaluate
            now_row = await db.execute(text("SELECT clock_timestamp()"))
            now: datetime = now_row.scalar_one()

            for rfq_id in rfq_ids:
                rfq_row = await db.execute(select(Rfq).where(Rfq.id == rfq_id))
                rfq = rfq_row.scalar_one_or_none()
                if not rfq:
                    continue

                # HD-LIFE-02: re-evaluate after lock
                derived = evaluate_state(rfq, now)
                if derived not in ("CLOSED", "FORCE_CLOSED"):
                    continue
                if rfq.status == derived:
                    continue  # already correct in DB

                new_status = derived
                await db.execute(
                    update(Rfq).where(Rfq.id == rfq.id).values(
                        status=new_status,
                        version=Rfq.version + 1,
                    )
                )

                # HD-LIFE-04: logical close time as occurred_at
                logical_close = (
                    rfq.forced_close_at if new_status == "FORCE_CLOSED"
                    else rfq.current_close_at
                )
                lag_ms = int((now - logical_close).total_seconds() * 1000)

                event_type = "AUCTION_FORCE_CLOSED" if new_status == "FORCE_CLOSED" else "AUCTION_CLOSED"

                # HD-LIFE-03: ON CONFLICT DO NOTHING — idempotent terminal events
                # We use raw INSERT because append-only trigger blocks UPDATE
                stmt = pg_insert(AuctionEvent).values(
                    rfq_id=rfq.id,
                    event_type=event_type,
                    occurred_at=logical_close,
                    details={
                        "final_close_at": logical_close.isoformat(),
                        "reason": new_status,
                        "detected_at": now.isoformat(),
                        "lag_ms": lag_ms,
                    },
                )
                # Partial unique index ensures only one terminal event per (rfq_id, event_type)
                stmt = stmt.on_conflict_do_nothing(
                    constraint="events_terminal_unique"
                )
                await db.execute(stmt)
