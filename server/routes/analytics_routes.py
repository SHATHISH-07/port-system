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
def get_crane_performance(
    limit: int = 1000, 
    days: int = None,
    user: dict = Depends(get_current_user)
):
    from config import settings
    import pandas as pd
    engine = get_engine()
    if days is None:
        days = settings.CRANE_ANALYTICS_WINDOW_DAYS

    try:
        with engine.connect() as conn:
            query = """
                SELECT crane_id, unit_id, carrier_visit,
                       move_kind, time_completed, exclude
                FROM crane_movements
                WHERE time_completed >= NOW() - INTERVAL ':days days'
            """
            df = pd.read_sql_query(text(query), conn, params={"days": days})
            
            moves_query = """
                SELECT id, crane_id, unit_id, carrier_visit,
                       move_kind, from_position, to_position, time_completed,
                       line_op
                FROM crane_movements
                ORDER BY time_completed DESC NULLS LAST
                LIMIT :lim
            """
            rows = conn.execute(text(moves_query), {"lim": limit}).fetchall()
            raw_moves = [dict(r._mapping) for r in rows]

        if df.empty:
            return {
                "summary": {}, "crane_stats": [], 
                "visit_crane_allocation": [], "hourly_productivity": [], 
                "moves": raw_moves
            }

        df["time_completed"] = pd.to_datetime(df["time_completed"], errors="coerce")
        df = df.dropna(subset=["time_completed"])
        
        valid_df = df[df["exclude"] != "Yes"] if "exclude" in df.columns else df
        total_valid = len(valid_df)
        total_moves = len(df)
        
        # Summary
        summary = {
            "total_moves": total_moves,
            "effective_moves": total_valid,
            "anomaly_rate": round(1.0 - (total_valid / max(total_moves, 1)), 3),
            "active_cranes": int(valid_df["crane_id"].nunique()),
            "unique_visits_served": int(valid_df["carrier_visit"].nunique()),
        }

        # Crane Stats
        crane_stats = []
        for crane, grp in valid_df.groupby("crane_id"):
            moves = len(grp)
            min_t = grp["time_completed"].min()
            max_t = grp["time_completed"].max()
            dur = max((max_t - min_t).total_seconds() / 3600, 0.1) if pd.notna(min_t) and pd.notna(max_t) else 0.1
            mphc = min(moves / dur, 999.0)
            
            restows = len(grp[grp["move_kind"].isin(["RESTOW", "SHIFT"])])
            
            rating = "Optimal" if mphc >= settings.CRANE_MOVES_PER_HOUR_TARGET else "Suboptimal" if mphc < settings.CRANE_MOVES_PER_HOUR_TARGET * 0.7 else "Acceptable"
            
            crane_stats.append({
                "crane_id": str(crane),
                "total_moves": moves,
                "moves_per_hour": round(mphc, 2),
                "productivity_rating": rating,
                "avg_cycle_minutes": round(60.0 / mphc, 1) if mphc > 0 else 0,
                "restow_ratio": round(restows / moves, 3),
            })

        # Visit Allocation
        visit_alloc = []
        for visit, grp in valid_df.groupby("carrier_visit"):
            visit_alloc.append({
                "visit_id": str(visit),
                "crane_count": int(grp["crane_id"].nunique()),
                "total_moves": len(grp),
                "cranes_used": grp["crane_id"].unique().tolist()[:6],
            })

        # Hourly Productivity
        hourly_df = valid_df.set_index("time_completed").resample("h").size().reset_index(name="moves")
        hourly_df["hour"] = hourly_df["time_completed"].dt.strftime("%Y-%m-%d %H:00")
        hourly_productivity = hourly_df[["hour", "moves"]].tail(24).to_dict("records")

        return {
            "summary": summary,
            "crane_stats": crane_stats,
            "visit_crane_allocation": visit_alloc,
            "hourly_productivity": hourly_productivity,
            "moves": raw_moves,
        }
    except Exception as e:
        logger.error("Error fetching crane performance: %s", e)
        return {"summary": {}, "crane_stats": [], "visit_crane_allocation": [], "hourly_productivity": [], "moves": [], "error": str(e)}


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