import logging
from fastapi import APIRouter, Depends
from sqlalchemy import text

from db.connection import get_engine
from db.queries import load_from_db
# 1. Import get_current_user alongside require_admin
from auth.dependencies import require_admin, get_current_user

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/analytics", tags=["Analytics"])

# get crane performance
@router.get("/crane-performance")
# 2. Changed dependency to get_current_user to allow standard users access
def get_crane_performance(limit: int = 1000, user: dict = Depends(get_current_user)):
    engine = get_engine()
    try:
        # get crane performance from database
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, crane_id, unit_id, carrier_visit,
                       move_kind, from_position, to_position, time_completed,
                       line_op
                FROM crane_movements
                ORDER BY time_completed DESC NULLS LAST
                LIMIT :lim
            """), {"lim": limit}).fetchall()
        return {"moves": [dict(r._mapping) for r in rows]}
    except Exception as e:
        logger.error("Error fetching crane performance: %s", e)
        return {"moves": [], "error": str(e)}


# get system summary
@router.get("/summary")
# admin authentication required (Left as require_admin for security)
def get_system_summary(admin: dict = Depends(require_admin)):
    engine = get_engine()
    counts = {}
    # tables to get counts from
    tables = [
        "history_containers", "current_containers", "crane_movements",
        "ingestion_logs", "rejection_logs", "users", "training_metadata"
    ]

    with engine.connect() as conn:
        # get counts from tables
        for table in tables:
            try:
                counts[table] = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            except Exception:
                counts[table] = 0

        try:
            # get recent logs from database
            recent_logs = conn.execute(text("""
                SELECT id, filename, dataset_type, status, records_total, completed_at
                FROM ingestion_logs
                ORDER BY created_at DESC LIMIT 5
            """)).fetchall()
        except Exception:
            recent_logs = []

    return {
        "counts": counts,
        "recent_ingestions": [dict(r._mapping) for r in recent_logs],
    }