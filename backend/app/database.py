import asyncio
import logging

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import DATABASE_URL, SQL_ECHO

logger = logging.getLogger(__name__)

engine = create_async_engine(
    DATABASE_URL,
    echo=SQL_ECHO,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def _init_db_once():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def init_db(
    max_attempts: int = 5,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
):
    """
    Create DB schema with retries. Handles transient failures (e.g. name resolution,
    connection refused) when Postgres or Docker DNS is not ready yet.
    """
    delay = base_delay
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            await _init_db_once()
            if attempt > 1:
                logger.info("Database connection succeeded on attempt %d.", attempt)
            return
        except Exception as e:
            last_err = e
            logger.warning(
                "Database init attempt %d/%d failed: %s. Retrying in %.1fs.",
                attempt, max_attempts, e, delay,
            )
            if attempt < max_attempts:
                await asyncio.sleep(delay)
                delay = min(delay * 2, max_delay)
    raise last_err
