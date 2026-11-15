import uuid

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, get_idempotency_key, require_supplier
from app.core.errors import bad_request, forbidden, not_found
from app.db.models import Supplier, User
from app.db.session import get_db, transaction_scope
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
    request: Request,
    supplier: User = Depends(require_supplier),
    idempotency_key: str = Depends(get_idempotency_key),
    db: AsyncSession = Depends(get_db),
) -> BidResponse:
    if not supplier.supplier_id:
        raise forbidden("No supplier profile attached to this account.")

    # HD-CON-09: validate idempotency key format
    import re
    if not re.fullmatch(r"[A-Za-z0-9_.:\-]{8,128}", idempotency_key):
        raise bad_request("IDEMPOTENCY_KEY_REQUIRED: key must be 8–128 chars [A-Za-z0-9_.:-]")

    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    async with transaction_scope(db):
        svc = BidService(db)
        result = await svc.submit(
            rfq_id, supplier.supplier_id, supplier.id, req,
            idempotency_key, request_id
        )

    # CHG-5: replay returns 200, new bid returns 201
    if result.replayed:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=200, content=result.model_dump(mode="json"))
    return result


@router.get("/rfqs/{rfq_id}/bids/lookup")
async def lookup_bid_by_idempotency(
    rfq_id: uuid.UUID,
    idempotency_key: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BidResponse:
    """HD-CON-10: lookup endpoint for UNKNOWN outcome recovery."""
    repo = RfqRepository(db)
    rfq = await repo.get_by_id(rfq_id)
    if not rfq:
        raise not_found()

    if user.role == "SUPPLIER":
        if not user.supplier_id:
            raise not_found()
        if not await repo.is_active_invitee(rfq_id, user.supplier_id):
            raise not_found()

    bid_repo = BidRepository(db)
    supplier_id = user.supplier_id if user.role == "SUPPLIER" else None
    if supplier_id is None:
        raise forbidden("Only suppliers can use the lookup endpoint.")

    bid = await bid_repo.find_by_idempotency(rfq_id, supplier_id, idempotency_key)
    if not bid:
        raise not_found()

    standings = await get_standings(rfq_id, db)
    my_rank = next((s for s in standings if s.supplier_id == supplier_id), None)
    l1 = standings[0] if standings else None

    from app.schemas.bid import ExtensionResult
    return BidResponse(
        bid_id=bid.id,
        rfq_id=rfq_id,
        bid_seq=bid.bid_seq,
        total_amount=str(bid.total_amount),
        currency=rfq.currency,
        accepted_at=bid.accepted_at,
        rank=my_rank.rank_label if my_rank else "L?",
        current_l1_total=str(l1.total_amount) if l1 else None,
        current_close_at=rfq.current_close_at,
        extension=ExtensionResult(applied=False),
        rfq_version=rfq.version,
        replayed=True,
    )


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

    # HD-SEC-05: use stored anon_label from rfq_suppliers
    from sqlalchemy import text as sqlt
    anon_q = await db.execute(
        sqlt("SELECT supplier_id, anon_label FROM rfq_suppliers WHERE rfq_id = :id"),
        {"id": str(rfq_id)},
    )
    anon_map = {uuid.UUID(str(r[0])): r[1] for r in anon_q.fetchall()}

    items: list[BidListItem] = []
    for bid in bids:
        is_own = user.role == "SUPPLIER" and bid.supplier_id == user.supplier_id
        show_detail = user.role == "BUYER" or is_own

        if user.role == "BUYER":
            s_row = await db.execute(select(Supplier).where(Supplier.id == bid.supplier_id))
            s = s_row.scalar_one_or_none()
            label = s.display_name if s else "Unknown"
        elif is_own:
            label = "You"
        else:
            label = anon_map.get(bid.supplier_id, "Supplier ?")

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
            bid_seq=bid.bid_seq,
        ))
    return items
