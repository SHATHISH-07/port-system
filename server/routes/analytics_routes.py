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
def get_crane_performance(
    limit: int = 1000, 
    days: int = None,
    crane_id: str = None,
    user: dict = Depends(get_current_user)
):
    from config import settings
    import pandas as pd
    engine = get_engine()
    if days is None:
        days = settings.CRANE_ANALYTICS_WINDOW_DAYS

    try:
        df = load_from_db("crane")
        
        if df.empty:
            return {
                "summary": {}, "crane_stats": [], 
                "visit_crane_allocation": [], "hourly_productivity": [], 
                "moves": [], "available_cranes": [],
            }

        df["time_completed"] = pd.to_datetime(df["time_completed"], errors="coerce")
        df = df.dropna(subset=["time_completed"])
        
        if days and days > 0:
            cutoff = pd.Timestamp.now() - pd.Timedelta(days=days)
            filtered = df[df["time_completed"] >= cutoff]
            # Fall back to full dataset if window filter returns nothing
            if not filtered.empty:
                df = filtered
        
        if df.empty:
            return {
                "summary": {}, "crane_stats": [], 
                "visit_crane_allocation": [], "hourly_productivity": [], 
                "moves": [], "available_cranes": [],
            }

        # All available crane IDs (for frontend dropdown)
        available_cranes = sorted(df["crane_id"].dropna().unique().tolist())

        # Filter to specific crane if requested
        if crane_id:
            df = df[df["crane_id"].astype(str).str.strip() == crane_id.strip()]
            if df.empty:
                return {
                    "summary": {}, "crane_stats": [],
                    "visit_crane_allocation": [], "hourly_productivity": [],
                    "moves": [], "available_cranes": available_cranes,
                }

        sorted_df = df.sort_values("time_completed", ascending=False).head(limit)
        raw_moves = sorted_df.to_dict(orient="records")
        
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
            
            restows = len(grp[grp["move_kind"].isin(["RESTOW", "SHIFT"])]) if "move_kind" in grp.columns else 0
            
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
        # Sort by most moves
        visit_alloc.sort(key=lambda x: x["total_moves"], reverse=True)

        return {
            "summary": summary,
            "crane_stats": crane_stats,
            "visit_crane_allocation": visit_alloc,
            "moves": raw_moves,
            "available_cranes": available_cranes,
            "selected_crane": crane_id,
        }
    except Exception as e:
        logger.error("Error fetching crane performance: %s", e)
        return {"summary": {}, "crane_stats": [], "visit_crane_allocation": [], "hourly_productivity": [], "moves": [], "available_cranes": [], "error": str(e)}


# get system summary
@router.get("/summary")
# admin authentication required (Left as require_admin for security)
def get_system_summary(admin: dict = Depends(require_admin)):
    engine = get_engine()
    counts = {}
    with engine.connect() as conn:
        for suffix in ["history_containers", "current_containers", "crane_movements"]:
            try:
                res = conn.execute(text(f"SELECT relname FROM pg_class WHERE relkind IN ('p','r') AND relname LIKE '%_{suffix}' AND oid NOT IN (SELECT inhrelid FROM pg_inherits)")).fetchall()
                total = 0
                for r in res:
                    total += conn.execute(text(f"SELECT COUNT(*) FROM {r[0]}")).scalar()
                counts[suffix] = total
            except Exception:
                counts[suffix] = 0

        # get counts from other tables
        for table in ["ingestion_logs", "rejection_logs", "users", "training_metadata"]:
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