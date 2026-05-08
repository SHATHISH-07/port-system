import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from urllib.parse import urlparse
from config import settings

load_dotenv()
logger = logging.getLogger("port_system")

DATABASE_URL = settings.DATABASE_URL

def _ensure_database_exists():
    parsed = urlparse(DATABASE_URL)
    db_name = parsed.path.lstrip("/")
    user = parsed.username
    password = parsed.password
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 5432

    try:
        conn = psycopg2.connect(user=user, password=password, host=host, port=port, dbname="postgres")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        if not cursor.fetchone():
            cursor.execute(f'CREATE DATABASE "{db_name}"')
            logger.info(f"[DB] Created database '{db_name}'")
        else:
            logger.info(f"[DB] Database '{db_name}' already exists")
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"[DB] Could not ensure database exists: {e}")

_ensure_database_exists()

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_engine():
    return engine

def get_session():
    return SessionLocal()