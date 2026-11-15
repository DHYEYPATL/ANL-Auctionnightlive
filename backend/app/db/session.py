from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def transaction_scope(db: AsyncSession):
    """
    Safely execute within a database transaction.
    If the session is already in an autobegun transaction, uses a savepoint
    and commits upon exit; otherwise begins a top-level transaction.
    """
    if db.in_transaction():
        try:
            async with db.begin_nested():
                yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise
    else:
        async with db.begin():
            yield db

