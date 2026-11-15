import asyncio
import uuid

from sqlalchemy import select, text, update

from app.db.base import Base
from app.db.models import AuctionEvent, Rfq
from app.workers.celery_app import celery_app


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(name="app.workers.auction_tasks.reconcile_auctions")
def reconcile_auctions():
    _run(_reconcile())


async def _reconcile():
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        async with db.begin():
            now_row = await db.execute(text("SELECT clock_timestamp()"))
            now = now_row.scalar_one()

            # Find published auctions that may need state transition
            result = await db.execute(
                select(Rfq)
                .where(Rfq.status.in_(["SCHEDULED", "ACTIVE"]))
                .with_for_update(skip_locked=True)
            )
            rfqs = result.scalars().all()

            for rfq in rfqs:
                new_status = None

                if rfq.status == "SCHEDULED" and now >= rfq.start_at and now < rfq.current_close_at and now < rfq.forced_close_at:
                    new_status = "ACTIVE"
                elif rfq.status in ("SCHEDULED", "ACTIVE") and now >= rfq.forced_close_at:
                    new_status = "FORCE_CLOSED"
                elif rfq.status in ("SCHEDULED", "ACTIVE") and now >= rfq.current_close_at:
                    new_status = "CLOSED"

                if new_status:
                    # Check for existing terminal event (idempotency)
                    terminal_types = {"AUCTION_CLOSED", "AUCTION_FORCE_CLOSED"}
                    evt_result = await db.execute(
                        select(AuctionEvent).where(
                            AuctionEvent.rfq_id == rfq.id,
                            AuctionEvent.event_type.in_(list(terminal_types)),
                        ).limit(1)
                    )
                    if evt_result.scalar_one_or_none():
                        # Already has terminal event; just update status
                        await db.execute(update(Rfq).where(Rfq.id == rfq.id).values(status=new_status))
                        continue

                    await db.execute(update(Rfq).where(Rfq.id == rfq.id).values(status=new_status))
                    event_type = "AUCTION_FORCE_CLOSED" if new_status == "FORCE_CLOSED" else "AUCTION_CLOSED"
                    db.add(AuctionEvent(
                        rfq_id=rfq.id,
                        event_type=event_type,
                        details={"final_close_at": now.isoformat(), "reason": new_status},
                    ))
