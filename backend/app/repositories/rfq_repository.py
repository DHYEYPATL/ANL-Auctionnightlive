import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuctionConfig, Rfq, RfqSupplier


class RfqRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, rfq: Rfq) -> Rfq:
        self.db.add(rfq)
        await self.db.flush()
        return rfq

    async def get_by_id(self, rfq_id: uuid.UUID) -> Rfq | None:
        result = await self.db.execute(select(Rfq).where(Rfq.id == rfq_id))
        return result.scalar_one_or_none()

    async def get_by_id_for_update(self, rfq_id: uuid.UUID) -> Rfq | None:
        result = await self.db.execute(
            select(Rfq).where(Rfq.id == rfq_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def list_for_buyer(self, buyer_id: uuid.UUID) -> list[Rfq]:
        result = await self.db.execute(
            select(Rfq).where(Rfq.buyer_id == buyer_id).order_by(Rfq.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_for_supplier(self, supplier_id: uuid.UUID) -> list[Rfq]:
        result = await self.db.execute(
            select(Rfq)
            .join(RfqSupplier, RfqSupplier.rfq_id == Rfq.id)
            .where(
                RfqSupplier.supplier_id == supplier_id,
                RfqSupplier.invitation_status == "ACTIVE",
            )
            .order_by(Rfq.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(self, rfq: Rfq) -> Rfq:
        await self.db.flush()
        return rfq

    async def get_config(self, rfq_id: uuid.UUID) -> AuctionConfig | None:
        result = await self.db.execute(
            select(AuctionConfig).where(AuctionConfig.rfq_id == rfq_id)
        )
        return result.scalar_one_or_none()

    async def get_supplier_ids(self, rfq_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.db.execute(
            select(RfqSupplier.supplier_id).where(
                RfqSupplier.rfq_id == rfq_id,
                RfqSupplier.invitation_status == "ACTIVE",
            )
        )
        return list(result.scalars().all())

    async def is_active_invitee(self, rfq_id: uuid.UUID, supplier_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(RfqSupplier).where(
                RfqSupplier.rfq_id == rfq_id,
                RfqSupplier.supplier_id == supplier_id,
                RfqSupplier.invitation_status == "ACTIVE",
            )
        )
        return result.scalar_one_or_none() is not None

    async def update_current_close(self, rfq_id: uuid.UUID, new_close: datetime) -> None:
        await self.db.execute(
            update(Rfq).where(Rfq.id == rfq_id).values(current_close_at=new_close)
        )

    async def update_status(self, rfq_id: uuid.UUID, status: str, published_at: datetime | None = None) -> None:
        values: dict = {"status": status}
        if published_at is not None:
            values["published_at"] = published_at
        await self.db.execute(update(Rfq).where(Rfq.id == rfq_id).values(**values))
