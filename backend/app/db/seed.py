"""Seed script: creates 1 buyer + 3 suppliers with user accounts."""
import asyncio
import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.db.base import Base
from app.db.models import Supplier, User
from app.db.session import AsyncSessionLocal


async def seed():
    async with AsyncSessionLocal() as db:
        async with db.begin():
            # Buyer
            buyer_exists = await db.execute(select(User).where(User.email == "buyer@anl.dev"))
            if not buyer_exists.scalar_one_or_none():
                db.add(User(
                    email="buyer@anl.dev",
                    password_hash=hash_password("password123"),
                    display_name="Demo Buyer",
                    role="BUYER",
                ))

            suppliers_data = [
                ("Alpha Freight Co.", "supplier1@anl.dev"),
                ("Beta Logistics", "supplier2@anl.dev"),
                ("Gamma Shipping", "supplier3@anl.dev"),
            ]
            for name, email in suppliers_data:
                exists = await db.execute(select(User).where(User.email == email))
                if not exists.scalar_one_or_none():
                    s = Supplier(display_name=name, legal_name=name)
                    db.add(s)
                    await db.flush()
                    db.add(User(
                        email=email,
                        password_hash=hash_password("password123"),
                        display_name=name,
                        role="SUPPLIER",
                        supplier_id=s.id,
                    ))

    print("Seed complete.")
    print("  buyer@anl.dev / password123")
    print("  supplier1@anl.dev / password123")
    print("  supplier2@anl.dev / password123")
    print("  supplier3@anl.dev / password123")


if __name__ == "__main__":
    asyncio.run(seed())
