import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from urllib.parse import urlparse

load_dotenv()
logger = logging.getLogger(__name__)

# Default database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/portsystem")
DATABASE_URL = DATABASE_URL.replace("@localhost", "@127.0.0.1")

# Function to ensure the database exists
def _ensure_database_exists():
    # Parse the connection details from DATABASE_URL
    parsed = urlparse(DATABASE_URL)
    db_name = parsed.path.lstrip("/")
    user = parsed.username
    password = parsed.password
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 5432

    # Connect to the default database (postgres) to check for the target database
    try:
        conn = psycopg2.connect(user=user, password=password, host=host, port=port, dbname="postgres")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # Check if the target database already exists
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        if not cursor.fetchone():
            # Create the database if it doesn't exist
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

# Create SQLAlchemy engine with proper configuration
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
# Create session maker for dependency injection
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Return the engine
def get_engine():
    return engine

# Return the session
def get_session():
    return SessionLocal()
