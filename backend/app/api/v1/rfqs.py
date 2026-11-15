import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_buyer
from app.core.errors import forbidden, not_found
from app.db.models import Supplier, User
from app.db.session import get_db
from app.repositories.bid_repository import BidRepository
from app.repositories.event_repository import EventRepository
from app.repositories.rfq_repository import RfqRepository
from app.schemas.rfq import AuctionConfigResponse, CreateRfqRequest, PatchRfqRequest, RfqResponse
from app.services.rfq_service import RfqService
from app.services.ranking_service import get_standings

router = APIRouter()


async def _build_rfq_response(rfq, db: AsyncSession) -> RfqResponse:
    repo = RfqRepository(db)
    config = await repo.get_config(rfq.id)
    supplier_ids = await repo.get_supplier_ids(rfq.id)

    bid_repo = BidRepository(db)
    bid_count = await bid_repo.count_for_rfq(rfq.id)

    evt_repo = EventRepository(db)
    ext_count = await evt_repo.count_by_type(rfq.id, "EXTENSION_APPLIED")

    standings = await get_standings(rfq.id, db)
    l1_total = str(standings[0].total_amount) if standings else None
    participating = len(standings)

    return RfqResponse(
        id=rfq.id,
        name=rfq.name,
        reference_id=rfq.reference_id,
        currency=rfq.currency,
        service_date=rfq.service_date,
        start_at=rfq.start_at,
        scheduled_close_at=rfq.scheduled_close_at,
        current_close_at=rfq.current_close_at,
        forced_close_at=rfq.forced_close_at,
        status=rfq.status,
        published_at=rfq.published_at,
        created_at=rfq.created_at,
        auction_config=AuctionConfigResponse(
            trigger_window_minutes=config.trigger_window_minutes,
            extension_duration_minutes=config.extension_duration_minutes,
            triggers=config.triggers,
        ) if config else None,
        invited_supplier_ids=supplier_ids,
        current_l1_total=l1_total,
        participating_supplier_count=participating,
        accepted_bid_count=bid_count,
        extension_count=ext_count,
    )


@router.post("/rfqs", status_code=201)
async def create_rfq(
    req: CreateRfqRequest,
    buyer: User = Depends(require_buyer),
    db: AsyncSession = Depends(get_db),
) -> RfqResponse:
    async with db.begin():
        svc = RfqService(db)
        rfq = await svc.create(buyer.id, req)
    async with db.begin():
        return await _build_rfq_response(rfq, db)


@router.patch("/rfqs/{rfq_id}")
async def patch_rfq(
    rfq_id: uuid.UUID,
    req: PatchRfqRequest,
    buyer: User = Depends(require_buyer),
    db: AsyncSession = Depends(get_db),
) -> RfqResponse:
    async with db.begin():
        svc = RfqService(db)
        rfq = await svc.patch(rfq_id, buyer.id, req)
    async with db.begin():
        return await _build_rfq_response(rfq, db)


@router.post("/rfqs/{rfq_id}/publish", status_code=200)
async def publish_rfq(
    rfq_id: uuid.UUID,
    buyer: User = Depends(require_buyer),
    db: AsyncSession = Depends(get_db),
) -> RfqResponse:
    async with db.begin():
        svc = RfqService(db)
        rfq = await svc.publish(rfq_id, buyer.id)
    async with db.begin():
        return await _build_rfq_response(rfq, db)


@router.post("/rfqs/{rfq_id}/cancel", status_code=200)
async def cancel_rfq(
    rfq_id: uuid.UUID,
    buyer: User = Depends(require_buyer),
    db: AsyncSession = Depends(get_db),
) -> RfqResponse:
    async with db.begin():
        svc = RfqService(db)
        rfq = await svc.cancel(rfq_id, buyer.id)
    async with db.begin():
        return await _build_rfq_response(rfq, db)


@router.get("/rfqs")
async def list_rfqs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RfqResponse]:
    repo = RfqRepository(db)
    if user.role == "BUYER":
        rfqs = await repo.list_for_buyer(user.id)
    else:
        if not user.supplier_id:
            return []
        rfqs = await repo.list_for_supplier(user.supplier_id)

    result = []
    for rfq in rfqs:
        result.append(await _build_rfq_response(rfq, db))
    return result


@router.get("/rfqs/{rfq_id}")
async def get_rfq(
    rfq_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RfqResponse:
    repo = RfqRepository(db)
    rfq = await repo.get_by_id(rfq_id)
    if not rfq:
        raise not_found()

    if user.role == "BUYER" and rfq.buyer_id != user.id:
        raise not_found()

    if user.role == "SUPPLIER":
        if not user.supplier_id:
            raise not_found()
        is_inv = await repo.is_active_invitee(rfq_id, user.supplier_id)
        if not is_inv:
            raise not_found()

    return await _build_rfq_response(rfq, db)
