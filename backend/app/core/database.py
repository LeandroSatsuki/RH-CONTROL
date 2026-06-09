from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def engine_connect_args() -> dict[str, int]:
    if settings.database_url.startswith("postgresql"):
        return {"connect_timeout": 5}
    return {}


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_timeout=5,
    connect_args=engine_connect_args(),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
