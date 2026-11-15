import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.errors import not_found
from app.db.models import Supplier, User
from app.db.session import get_db
from app.repositories.rfq_repository import RfqRepository
from app.schemas.standing import StandingRow, StandingsResponse
from app.services.ranking_service import StandingEntry, get_standings

router = APIRouter()


@router.get("/rfqs/{rfq_id}/standings", response_model=StandingsResponse)
async def get_rfq_standings(
    rfq_id: uuid.UUID,
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

    standings = await get_standings(rfq_id, db)

    rows: list[StandingRow] = []
    for i, entry in enumerate(standings):
        is_own = user.role == "SUPPLIER" and entry.supplier_id == user.supplier_id
        show_detail = user.role == "BUYER" or is_own

        label = f"Supplier {chr(65 + i % 26)}"
        if user.role == "BUYER":
            s_row = await db.execute(select(Supplier).where(Supplier.id == entry.supplier_id))
            s = s_row.scalar_one_or_none()
            label = s.display_name if s else "Unknown"
        elif is_own:
            s_row = await db.execute(select(Supplier).where(Supplier.id == entry.supplier_id))
            s = s_row.scalar_one_or_none()
            label = f"You ({s.display_name})" if s else "You"

        rows.append(StandingRow(
            rank_number=entry.rank_number,
            rank_label=entry.rank_label,
            supplier_id=entry.supplier_id if user.role == "BUYER" else None,
            supplier_label=label,
            total_amount=str(entry.total_amount),
            freight_charge=str(entry.freight_charge) if show_detail else None,
            origin_charge=str(entry.origin_charge) if show_detail else None,
            destination_charge=str(entry.destination_charge) if show_detail else None,
            transit_time_days=entry.transit_time_days if show_detail else None,
            valid_until=entry.valid_until if show_detail else None,
            accepted_at=entry.accepted_at,
        ))

    l1_total = str(standings[0].total_amount) if standings else None
    return StandingsResponse(rfq_id=rfq_id, standings=rows, current_l1_total=l1_total)
