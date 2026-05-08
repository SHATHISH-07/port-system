import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from urllib.parse import urlparse
from config import settings

# load environment variables
load_dotenv()

# setup logger
logger = logging.getLogger("port_system")

# get the database URL
DATABASE_URL = settings.DATABASE_URL

# _ensure_database_exists is a function that ensures the database exists by checking if it exists and creating it if it doesn't
def _ensure_database_exists():
    # parse the database URL
    parsed = urlparse(DATABASE_URL)
    # get the database name
    db_name = parsed.path.lstrip("/")
    # get the database user
    user = parsed.username
    # get the database password
    password = parsed.password
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 5432

    try:
        # connect to the database
        conn = psycopg2.connect(user=user, password=password, host=host, port=port, dbname="postgres")
        # set the isolation level
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # check if the database exists
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        # create the database if it doesn't exist
        if not cursor.fetchone():
            cursor.execute(f'CREATE DATABASE "{db_name}"')
            # log the creation of the database
            logger.info(f"[DB] Created database '{db_name}'")
        else:
            # log that the database already exists
            logger.info(f"[DB] Database '{db_name}' already exists")
        # close the cursor and connection
        cursor.close()
        conn.close()
    # if the database doesn't exist, log the error
    except Exception as e:
        logger.error(f"[DB] Could not ensure database exists: {e}")

# call the function to ensure the database exists
_ensure_database_exists()

# create the engine for the database
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# get the engine
def get_engine():
    return engine

# get the session
def get_session():
    return SessionLocal()