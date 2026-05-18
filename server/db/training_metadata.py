import datetime
import logging
from sqlalchemy import text
from db.connection import get_engine
from db.queries import init_training_metadata_schema
from config import settings

logger = logging.getLogger("port_system")

# Checks if the training metadata table exists and creates it if not
def _ensure_table():
    engine = get_engine()
    init_training_metadata_schema(engine)
    return engine


# Inserts a new row into training_metadata for a completed (or failed) run.
def save_training_metadata(
    dataset_size: int,
    data_source: str = "db",
    training_type: str = "manual",
    status: str = "completed",
    notes: str = None,
) -> dict:
    engine = _ensure_table()
    now = datetime.datetime.now(datetime.timezone.utc)
    with engine.begin() as conn:
        result = conn.execute(
            text(settings.INSERT_TRAINING_METADATA_QUERY),
            {
                "size":    dataset_size,
                "ts":      now,
                "source":  data_source,
                "ttype":   training_type,
                "status":  status,
                "notes":   notes,
                "created": now,
                "updated": now,
            },
        )
        row = result.mappings().fetchone()
        logger.info(f"[DB] training_metadata row inserted: id={row['id']}, size={dataset_size}")
        return dict(row)


# Reads the latest training run
def get_latest_training_metadata() -> dict | None:
    try:
        engine = _ensure_table()
        with engine.connect() as conn:
            result = conn.execute(
                text(settings.GET_LATEST_TRAINING_METADATA_QUERY)
            )
            row = result.mappings().fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] get_latest_training_metadata failed: {e}")
        return None


# Reads all training runs (audit log)
def get_training_metadata_history(limit: int = 20) -> list[dict]:
    try:
        engine = _ensure_table()
        with engine.connect() as conn:
            result = conn.execute(
                text(settings.GET_TRAINING_METADATA_HISTORY_QUERY),
                {"lim": limit},
            )
            return [dict(r) for r in result.mappings().fetchall()]
    except Exception as e:
        logger.error(f"[DB] get_training_metadata_history failed: {e}")
        return []
