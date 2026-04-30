import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Force IPv4 resolution to prevent WSL2 proxy issues on Windows
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/portsystem")
DATABASE_URL = DATABASE_URL.replace("@localhost", "@127.0.0.1")

def _ensure_database_exists():
    """
    Connect to the 'postgres' base database and create 'portsystem' if it doesn't exist.
    This runs once at startup so the engine never fails due to a missing database.
    """
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

    # Parse the connection details from DATABASE_URL
    from urllib.parse import urlparse
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
        raise

# Ensure the database exists before creating the engine
_ensure_database_exists()

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_engine():
    return engine

def get_session():
    return SessionLocal()
