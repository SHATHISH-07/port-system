import datetime
import logging
from sqlalchemy import text
from db.connection import get_engine
from db.schema import init_training_metadata_schema

logger = logging.getLogger("port_system")

# ─── Ensure table exists on first use ─────────────────────────────────────────
def _ensure_table():
    engine = get_engine()
    init_training_metadata_schema(engine)
    return engine


# ─── Write a new training run record ─────────────────────────────────────────
def save_training_metadata(
    dataset_size: int,
    data_source: str = "db",
    training_type: str = "manual",
    status: str = "completed",
    notes: str = None,
) -> dict:
    """
    Inserts a new row into training_metadata for a completed (or failed) run.
    Returns the inserted row as a dict.
    """
    engine = _ensure_table()
    now = datetime.datetime.now(datetime.timezone.utc)
    with engine.begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO training_metadata
                    (last_trained_dataset_size, last_trained_timestamp,
                     data_source, training_type, status, notes,
                     created_at, updated_at)
                VALUES
                    (:size, :ts, :source, :ttype, :status, :notes,
                     :created, :updated)
                RETURNING id, last_trained_dataset_size, last_trained_timestamp,
                          data_source, training_type, status, notes,
                          created_at, updated_at, deleted_at
            """),
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


# ─── Read the latest training run ─────────────────────────────────────────────
def get_latest_training_metadata() -> dict | None:
    """
    Returns the most recent non-deleted training_metadata row, or None.
    """
    try:
        engine = _ensure_table()
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT id, last_trained_dataset_size, last_trained_timestamp,
                           data_source, training_type, status, notes,
                           created_at, updated_at, deleted_at
                    FROM training_metadata
                    WHERE deleted_at IS NULL
                    ORDER BY last_trained_timestamp DESC
                    LIMIT 1
                """)
            )
            row = result.mappings().fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error(f"[DB] get_latest_training_metadata failed: {e}")
        return None


# ─── Read all training runs (audit log) ──────────────────────────────────────
def get_training_metadata_history(limit: int = 20) -> list[dict]:
    """
    Returns up to `limit` recent training metadata rows (newest first).
    """
    try:
        engine = _ensure_table()
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT id, last_trained_dataset_size, last_trained_timestamp,
                           data_source, training_type, status, notes,
                           created_at, updated_at, deleted_at
                    FROM training_metadata
                    WHERE deleted_at IS NULL
                    ORDER BY last_trained_timestamp DESC
                    LIMIT :lim
                """),
                {"lim": limit},
            )
            return [dict(r) for r in result.mappings().fetchall()]
    except Exception as e:
        logger.error(f"[DB] get_training_metadata_history failed: {e}")
        return []
