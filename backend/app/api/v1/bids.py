import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, get_idempotency_key, require_supplier
from app.core.errors import forbidden, not_found
from app.db.models import Supplier, User
from app.db.session import get_db
from app.repositories.bid_repository import BidRepository
from app.repositories.rfq_repository import RfqRepository
from app.schemas.bid import BidListItem, BidResponse, SubmitBidRequest
from app.services.bid_service import BidService
from app.services.ranking_service import get_standings

router = APIRouter()


@router.post("/rfqs/{rfq_id}/bids", status_code=201, response_model=BidResponse)
async def submit_bid(
    rfq_id: uuid.UUID,
    req: SubmitBidRequest,
    supplier: User = Depends(require_supplier),
    idempotency_key: str = Depends(get_idempotency_key),
    db: AsyncSession = Depends(get_db),
) -> BidResponse:
    if not supplier.supplier_id:
        raise forbidden("No supplier profile attached to this account.")
    async with db.begin():
        svc = BidService(db)
        return await svc.submit(rfq_id, supplier.supplier_id, supplier.id, req, idempotency_key)


@router.get("/rfqs/{rfq_id}/bids")
async def list_bids(
    rfq_id: uuid.UUID,
    after_id: uuid.UUID | None = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BidListItem]:
    repo = RfqRepository(db)
    rfq = await repo.get_by_id(rfq_id)
    if not rfq:
        raise not_found()

    # Access check
    if user.role == "BUYER" and rfq.buyer_id != user.id:
        raise not_found()
    if user.role == "SUPPLIER":
        if not user.supplier_id:
            raise not_found()
        if not await repo.is_active_invitee(rfq_id, user.supplier_id):
            raise not_found()

    limit = min(limit, 100)
    bid_repo = BidRepository(db)
    bids = await bid_repo.list_for_rfq(rfq_id, after_id, limit)
    standings = await get_standings(rfq_id, db)
    rank_map = {s.supplier_id: s.rank_label for s in standings}

    items: list[BidListItem] = []
    for i, bid in enumerate(bids):
        is_own = user.role == "SUPPLIER" and bid.supplier_id == user.supplier_id
        show_detail = user.role == "BUYER" or is_own

        # Anonymous label for competitors
        label = f"Supplier {chr(65 + i % 26)}"
        if user.role == "BUYER":
            from sqlalchemy import select as sel
            from app.db.models import Supplier as S
            s_row = await db.execute(sel(S).where(S.id == bid.supplier_id))
            s = s_row.scalar_one_or_none()
            label = s.display_name if s else "Unknown"

        items.append(BidListItem(
            id=bid.id,
            rfq_id=bid.rfq_id,
            supplier_id=bid.supplier_id if user.role == "BUYER" else None,
            supplier_label=label,
            freight_charge=str(bid.freight_charge) if show_detail else None,
            origin_charge=str(bid.origin_charge) if show_detail else None,
            destination_charge=str(bid.destination_charge) if show_detail else None,
            total_amount=str(bid.total_amount),
            transit_time_days=bid.transit_time_days if show_detail else None,
            valid_until=bid.valid_until if show_detail else None,
            accepted_at=bid.accepted_at,
            rank=rank_map.get(bid.supplier_id, "?"),
        ))
    return items
