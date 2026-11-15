"""
Standings endpoint — HD-RT-01/02/03/04.
Returns server_now, version, ETag. Supports If-None-Match for 304.
"""
import hashlib
import uuid
from datetime import timezone

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.errors import not_found
from app.db.models import Supplier, User
from app.db.session import get_db
from app.repositories.rfq_repository import RfqRepository
from app.schemas.standing import StandingRow, StandingsResponse
from app.services.auction_service import evaluate_state
from app.services.ranking_service import StandingEntry, get_standings

router = APIRouter()


def _build_etag(version: int, status: str, viewer: str) -> str:
    """HD-RT-03: weak ETag W/"version:status:viewer" """
    return f'W/"{version}:{status}:{viewer}"'


@router.get("/rfqs/{rfq_id}/standings", response_model=StandingsResponse)
async def get_rfq_standings(
    rfq_id: uuid.UUID,
    request: Request,
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandingsResponse:
    repo = RfqRepository(db)
    rfq = await repo.get_by_id(rfq_id)
    if not rfq:
        raise not_found()

    if user.role == "BUYER" and rfq.buyer_id != user.id:
        raise not_found()
    if user.role == "SUPPLIER":
        if not user.supplier_id:
            raise not_found()
        if not await repo.is_active_invitee(rfq_id, user.supplier_id):
            raise not_found()

    # HD-RT-01: server_now from DB clock
    now_row = await db.execute(text("SELECT clock_timestamp()"))
    now = now_row.scalar_one()
    effective_status = evaluate_state(rfq, now)

    viewer = str(user.supplier_id) if user.role == "SUPPLIER" else "buyer"
    etag = _build_etag(rfq.version, effective_status, viewer)

    # HD-RT-04: no-store
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Authorization"
    response.headers["ETag"] = etag

    # HD-RT-03: 304 on matching ETag (saves ranking query)
    if if_none_match and if_none_match == etag:
        return Response(status_code=304)  # type: ignore[return-value]

    standings = await get_standings(rfq_id, db)

    # HD-SEC-05: use stored anon_label
    anon_q = await db.execute(
        text("SELECT supplier_id, anon_label FROM rfq_suppliers WHERE rfq_id = :id"),
        {"id": str(rfq_id)},
    )
    anon_map = {str(r[0]): r[1] for r in anon_q.fetchall()}

    rows: list[StandingRow] = []
    for entry in standings:
        is_own = user.role == "SUPPLIER" and entry.supplier_id == user.supplier_id
        show_detail = user.role == "BUYER" or is_own

        if user.role == "BUYER":
            s_row = await db.execute(select(Supplier).where(Supplier.id == entry.supplier_id))
            s = s_row.scalar_one_or_none()
            label = s.display_name if s else "Unknown"
        elif is_own:
            s_row = await db.execute(select(Supplier).where(Supplier.id == entry.supplier_id))
            s = s_row.scalar_one_or_none()
            label = f"You ({s.display_name})" if s else "You"
        else:
            label = anon_map.get(str(entry.supplier_id), "Supplier ?")

        rows.append(StandingRow(
            rank_number=entry.rank_number,
            rank_label=entry.rank_label,
            supplier_id=entry.supplier_id if user.role == "BUYER" else None,
            supplier_label=label,
            is_self=is_own,
            total_amount=str(entry.total_amount),
            freight_charge=str(entry.freight_charge) if show_detail else None,
            origin_charge=str(entry.origin_charge) if show_detail else None,
            destination_charge=str(entry.destination_charge) if show_detail else None,
            transit_time_days=entry.transit_time_days if show_detail else None,
            valid_until=entry.valid_until if show_detail else None,
            accepted_at=entry.accepted_at,
            bid_seq=entry.bid_seq if user.role == "BUYER" else None,
        ))

    l1_total = str(standings[0].total_amount) if standings else None
    return StandingsResponse(
        rfq_id=rfq_id,
        standings=rows,
        current_l1_total=l1_total,
        version=rfq.version,
        status=effective_status,
        server_now=now.isoformat(),
        current_close_at=rfq.current_close_at.isoformat(),
        forced_close_at=rfq.forced_close_at.isoformat(),
    )
