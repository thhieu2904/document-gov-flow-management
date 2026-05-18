from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_local: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is required and must point to Supabase PostgreSQL.")
        if settings.database_url.startswith("sqlite"):
            raise RuntimeError("SQLite is intentionally disabled. Use Supabase PostgreSQL for DATABASE_URL.")
        connect_args = {}
        if settings.database_url.startswith("postgresql+psycopg"):
            connect_args["prepare_threshold"] = None
        _engine = create_engine(settings.database_url, future=True, pool_pre_ping=True, connect_args=connect_args)
    return _engine


def get_session_local() -> sessionmaker[Session]:
    global _session_local
    if _session_local is None:
        _session_local = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, future=True)
    return _session_local


def get_db() -> Generator[Session, None, None]:
    db = get_session_local()()
    try:
        yield db
    finally:
        db.close()
