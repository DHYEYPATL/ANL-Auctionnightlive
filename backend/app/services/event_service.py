"""Event service — HD-CON-15/16: event_seq, rfq_version, causal order. HD-SEC-13: hash chain."""
import hashlib
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuctionEvent
from app.repositories.event_repository import EventRepository


def _compute_hash(prev_hash: str | None, event_type: str, occurred_at: datetime, details: dict) -> str:
    """SHA-256 of prev_hash + canonical event fields (HD-SEC-13)."""
    canonical = json.dumps({
        "prev_hash": prev_hash or "",
        "event_type": event_type,
        "occurred_at": occurred_at.isoformat(),
        "details": details,
    }, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


class EventService:
    def __init__(self, db: AsyncSession):
        self.repo = EventRepository(db)

    async def append_seq(
        self,
        rfq_id: uuid.UUID,
        event_type: str,
        event_seq: int,
        rfq_version: int,
        actor_user_id: uuid.UUID | None = None,
        bid_id: uuid.UUID | None = None,
        details: dict | None = None,
        occurred_at: datetime | None = None,
    ) -> AuctionEvent:
        """Append event with explicit sequence number and rfq_version (HD-CON-15/16)."""
        d = details or {}
        ts = occurred_at or datetime.now(timezone.utc)

        # Build hash chain (HD-SEC-13)
        last_hash = await self._last_event_hash(rfq_id)
        event_hash = _compute_hash(last_hash, event_type, ts, d)

        event = AuctionEvent(
            rfq_id=rfq_id,
            actor_user_id=actor_user_id,
            bid_id=bid_id,
            event_type=event_type,
            occurred_at=ts,
            details=d,
            event_seq=event_seq,
            rfq_version=rfq_version,
            prev_hash=last_hash,
            event_hash=event_hash,
        )
        return await self.repo.append(event)

    async def append(
        self,
        rfq_id: uuid.UUID,
        event_type: str,
        actor_user_id: uuid.UUID | None = None,
        bid_id: uuid.UUID | None = None,
        details: dict | None = None,
    ) -> AuctionEvent:
        """Simple append without explicit seq (used by worker/rfq_service)."""
        d = details or {}
        ts = datetime.now(timezone.utc)
        last_hash = await self._last_event_hash(rfq_id)
        event_hash = _compute_hash(last_hash, event_type, ts, d)
        event = AuctionEvent(
            rfq_id=rfq_id,
            actor_user_id=actor_user_id,
            bid_id=bid_id,
            event_type=event_type,
            details=d,
            prev_hash=last_hash,
            event_hash=event_hash,
        )
        return await self.repo.append(event)

    async def _last_event_hash(self, rfq_id: uuid.UUID) -> str | None:
        from sqlalchemy import select, desc
        from app.db.models import AuctionEvent as AE
        result = await self.repo.db.execute(
            select(AE.event_hash)
            .where(AE.rfq_id == rfq_id)
            .order_by(AE.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
