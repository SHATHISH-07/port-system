from __future__ import annotations
import logging
from urllib.parse import urlparse
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from config import settings

load_dotenv()
logger = logging.getLogger("port_system")

DATABASE_URL = settings.DATABASE_URL

def _ensure_database_exists() -> None:
    """
    Connect to the default 'postgres' maintenance DB and create the
    application database if it does not yet exist.
    Runs once at import time — safe to call multiple times (idempotent).
    """
    parsed   = urlparse(DATABASE_URL)
    db_name  = parsed.path.lstrip("/")
    user     = parsed.username
    password = parsed.password
    host     = parsed.hostname or "127.0.0.1"
    port     = parsed.port    or 5432

    if not db_name:
        logger.error("[DB] DATABASE_URL has no database name — skipping creation")
        return

    try:
        conn = psycopg2.connect(
            user=user, password=password,
            host=host, port=port,
            dbname="postgres",
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        cur.execute(settings.QUERY_CHECK_DB_EXISTS, (db_name,))
        if not cur.fetchone():
            cur.execute(settings.QUERY_CREATE_DB.format(db_name=db_name))
            logger.info("[DB] Created database '%s'", db_name)
        else:
            logger.info("[DB] Database '%s' already exists", db_name)

        cur.close()
        conn.close()

    except Exception as exc:
        logger.error("[DB] Could not ensure database exists: %s", exc)


# Create the DB before building the engine
_ensure_database_exists()

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_engine():
    """
    Returns the SQLAlchemy Engine instance.
    """
    return engine

def get_session():
    """
    Yields a SQLAlchemy Session instance.
    Should be used as a dependency in FastAPI.
    """
    return SessionLocal()
