import logging
from fastapi import APIRouter, Depends, Form
from sqlalchemy import text
from typing import Optional
import pandas as pd

from db.connection import get_engine
from db.queries import load_from_db
from auth.dependencies import require_admin, get_current_user
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_stay_duration_from_metrics
from utils.cache_utils import vessel_cache

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/analytics", tags=["Analytics"])

# ── Operational Intelligence ────────────────────────────────────────────────

@router.post("/vessel-analysis")
async def vessel_analysis(
    vessel_id: str = Form(...),
    mode: str = Form("current"), # current or history
    loaded: Optional[int] = Form(None),
    discharged: Optional[int] = Form(None),
    user: dict = Depends(get_current_user)
):
    """Analyze vessel stay-time and operational metrics."""
    logger.info(f"Starting {mode} vessel analysis for {vessel_id}")
    try:
        cache_key = f"{mode}_{vessel_id}"
        if loaded is None and discharged is None:
            cached = vessel_cache.get(cache_key)
            if cached: return cached

        df = load_from_db(mode, vessel_id)
        result = analyze_vessel_dashboard(df, vessel_id)
        result["mode"] = mode

        # Manual override/prediction
        if mode == "current" and loaded is not None and discharged is not None:
            actual_visits = result.get("actual", {}).get("visits", {}) if result.get("actual") else {}
            prediction = predict_stay_duration_from_metrics(loaded, discharged, actual_visits)
            result["predicted"] = prediction["predicted"]
            result["input"] = {"loaded": loaded, "discharged": discharged}
            result["mode"] = "current-override"

        if "error" not in result and loaded is None:
            vessel_cache.set(cache_key, result)

        return result
    except Exception as e:
        logger.error(f"Error in vessel analysis: {e}", exc_info=True)
        return {"error": str(e)}

@router.post("/heatmap")
async def heatmap(
    vessel_id: str = Form(...),
    user: dict = Depends(get_current_user)
):
    """Generate yard heatmap for a specific vessel."""
    try:
        cache_key = f"heatmap_{vessel_id}"
        cached = vessel_cache.get(cache_key)
        if cached: return cached

        df = load_from_db("current", vessel_id)
        result = get_vessel_heatmap(df, vessel_id)
        
        if "error" not in result:
            vessel_cache.set(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error in heatmap: {e}")
        return {"error": str(e)}

# ── Crane Analytics ─────────────────────────────────────────────────────────

@router.get("/crane-performance")
def get_crane_performance(limit: int = 1000, admin: dict = Depends(require_admin)):
    """Return crane movement data for operational analysis."""
    engine = get_engine()
    try:
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
        logger.error(f"Error fetching crane performance: {e}")
        return {"moves": [], "error": str(e)}

# ── System Summary ──────────────────────────────────────────────────────────

@router.get("/summary")
def get_system_summary(admin: dict = Depends(require_admin)):
    """Return high-level ingestion and entity counts."""
    engine = get_engine()
    counts = {}
    tables = [
        "history_containers", "current_containers", "crane_movements",
        "ingestion_logs", "rejection_logs", "users", "training_metadata"
    ]
    
    with engine.connect() as conn:
        for table in tables:
            try:
                counts[table] = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            except:
                counts[table] = 0

        try:
            recent_logs = conn.execute(text("""
                SELECT id, filename, dataset_type, status, records_total, completed_at
                FROM ingestion_logs
                ORDER BY created_at DESC LIMIT 5
            """)).fetchall()
        except:
            recent_logs = []

    return {
        "counts": counts,
        "recent_ingestions": [dict(r._mapping) for r in recent_logs]
    }
