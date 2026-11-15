"""
Hardened Celery worker — HD-LIFE-01..06.
Uses a dedicated engine created per-task to avoid asyncpg connection pool
being shared across fork boundaries (Celery prefork workers).
"""
import asyncio
from datetime import datetime

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import AuctionEvent, Rfq
from app.services.auction_service import evaluate_state
from app.workers.celery_app import celery_app
from app.core.config import settings


def _run_task(coro):
    """
    Create a brand-new event loop and engine for every task execution.
    This is the only safe pattern for asyncio + asyncpg inside Celery prefork.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()
        asyncio.set_event_loop(None)


@celery_app.task(
    name="app.workers.auction_tasks.reconcile_auctions",
    acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=30,
    task_soft_time_limit=20,
    max_retries=3,
)
def reconcile_auctions():
    _run_task(_reconcile())


async def _reconcile():
    # Create a fresh engine — never reuse the shared app engine across fork
    engine = create_async_engine(settings.DATABASE_URL, pool_size=2, max_overflow=0)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    try:
        async with Session() as db:
            async with db.begin():
                result = await db.execute(text("""
                    SELECT id FROM rfqs
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

                now_row = await db.execute(text("SELECT clock_timestamp()"))
                now: datetime = now_row.scalar_one()

                for rfq_id in rfq_ids:
                    rfq_row = await db.execute(select(Rfq).where(Rfq.id == rfq_id))
                    rfq = rfq_row.scalar_one_or_none()
                    if not rfq:
                        continue

                    derived = evaluate_state(rfq, now)
                    if derived not in ("CLOSED", "FORCE_CLOSED"):
                        continue
                    if rfq.status == derived:
                        continue

                    await db.execute(
                        update(Rfq).where(Rfq.id == rfq.id).values(
                            status=derived,
                            version=Rfq.version + 1,
                        )
                    )

                    logical_close = (
                        rfq.forced_close_at if derived == "FORCE_CLOSED"
                        else rfq.current_close_at
                    )
                    lag_ms = int((now - logical_close).total_seconds() * 1000)
                    event_type = "AUCTION_FORCE_CLOSED" if derived == "FORCE_CLOSED" else "AUCTION_CLOSED"

                    stmt = pg_insert(AuctionEvent).values(
                        rfq_id=rfq.id,
                        event_type=event_type,
                        occurred_at=logical_close,
                        details={
                            "final_close_at": logical_close.isoformat(),
                            "reason": derived,
                            "detected_at": now.isoformat(),
                            "lag_ms": lag_ms,
                        },
                    ).on_conflict_do_nothing(constraint="events_terminal_unique")

                    await db.execute(stmt)
    finally:
        await engine.dispose()
