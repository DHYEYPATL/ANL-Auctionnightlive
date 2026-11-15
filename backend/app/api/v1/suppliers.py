import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_buyer
from app.db.models import Supplier, User
from app.db.session import get_db
from pydantic import BaseModel

router = APIRouter()


class SupplierItem(BaseModel):
    id: uuid.UUID
    display_name: str
    is_active: bool


@router.get("/suppliers", response_model=list[SupplierItem])
async def list_suppliers(
    _buyer: User = Depends(require_buyer),
    db: AsyncSession = Depends(get_db),
) -> list[SupplierItem]:
    result = await db.execute(select(Supplier).where(Supplier.is_active == True).order_by(Supplier.display_name))
    return [SupplierItem(id=s.id, display_name=s.display_name, is_active=s.is_active) for s in result.scalars()]
