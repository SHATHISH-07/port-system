from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import text

from auth.dependencies import get_current_user
from db.connection import get_engine
from db.queries import load_from_db
from services.vessel_service import (
    analyze_vessel_dashboard,
    get_yard_heatmap_data,
)

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/vessel", tags=["Vessel Analytics"])


# ─────────────────────────────────────────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────────────────────────────────────────

class HeatmapRequest(BaseModel):
    vessel_id: str
    unit_ids: Optional[List[str]] = None
    yard_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# GET /vessel/analysis
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/analysis")
async def get_vessel_analysis(
    vessel_id: str = Query(..., alias="vesselId"),
    loaded: int = Query(None, alias="loaded"),
    discharged: int = Query(None, alias="discharged"),
    current_user: dict = Depends(get_current_user),
):
    """
    Unified vessel analysis endpoint.

    Resolution order:
      1. Current yard snapshot  (container_operations WHERE record_type = 'current')
      2. History data           (container_operations WHERE record_type = 'history')

    When the vessel is found in current data, the full history dataset is also
    loaded and passed as `history_df` so that historical crane averages and
    MPHC baselines are available for predictions even in current-mode.
    """
    try:
        # ── Step 1: load current yard snapshot ──────────────────────────────
        df_curr = load_from_db("current")
        df_hist = load_from_db("history")

        # Always pass history as the baseline so empirical averages are used
        result = analyze_vessel_dashboard(
            df_curr,
            vessel_id,
            loaded_override=loaded,
            discharged_override=discharged,
            history_df=df_hist,
        )

        # ── Step 2: fall back to history if not in current yard ──────────────
        if "error" in result:
            hist_result = analyze_vessel_dashboard(
                df_hist,
                vessel_id,
                loaded_override=loaded,
                discharged_override=discharged,
                history_df=df_hist,
            )
            if "error" not in hist_result:
                return hist_result

            # Surface suggestions cleanly rather than exposing internal keys
            suggestions = result.get("suggestions", [])
            return {
                "error":       result.get("error", "Vessel not found"),
                "vessel":      vessel_id,
                "suggestions": suggestions,
            }

        return result

    except Exception as exc:
        logger.error("vessel_analysis error for %s: %s", vessel_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# POST /vessel/heatmap  — unified map/heatmap/container-position endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/heatmap")
async def get_vessel_heatmap_route(
    request: HeatmapRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Unified endpoint for all map/heatmap/terminal visualization data.

    Accepts JSON body:
      - vessel_id  (required): outbound_service identifier
      - unit_ids   (optional): list of container IDs to locate in the yard
      - yard_id    (optional): filter to a specific yard
    """
    try:
        return get_yard_heatmap_data(
            vessel_id=request.vessel_id,
            unit_ids=request.unit_ids if request.unit_ids else None,
            yard_id=request.yard_id,
        )
    except Exception as exc:
        logger.error("vessel_heatmap error for %s: %s", request.vessel_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/yard/summary")
def get_yard_summary(
    yard_id: str = Query(None, alias="yardId"),
    current_user: dict = Depends(get_current_user),
):
    """
    Yard summary: record counts, per-yard breakdowns, and recent ingestions.
    Optional `yardId` param scopes all counts to a specific yard.
    """
    engine = get_engine()
    counts: dict = {}

    with engine.connect() as conn:

        # ── Discover tables, optionally filtered to a specific yard ───────────
        yard_filter = f"AND relname LIKE '{yard_id.lower().strip()}_%'" if yard_id else ""

        # ── History/Operational containers ────────────────────────────────────
        try:
            ops_tbls = conn.execute(text(f"""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_container_operations'
                  {yard_filter}
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_history = 0
            for (tbl,) in ops_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE record_type = 'history'")).scalar()
                    total_history += (n or 0)
                except Exception:
                    pass
            counts["history_containers"] = total_history
        except Exception:
            counts["history_containers"] = 0

        # ── Current containers (Dynamic Extraction count) ─────────────────────
        try:
            total_current = 0
            for (tbl,) in ops_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE time_out IS NULL")).scalar()
                    total_current += (n or 0)
                except Exception:
                    pass
            counts["current_containers"] = total_current
        except Exception:
            counts["current_containers"] = 0

        # ── Crane movements ───────────────────────────────────────────────────
        try:
            crane_tbls = conn.execute(text(f"""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_crane_operations'
                  {yard_filter}
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_crane = 0
            for (tbl,) in crane_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    total_crane += (n or 0)
                except Exception:
                    pass
            counts["crane_movements"] = total_crane
        except Exception:
            counts["crane_movements"] = 0

        # ── Vessel visits ─────────────────────────────────────────────────────
        try:
            vv_tbls = conn.execute(text(f"""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_vessel_visits'
                  {yard_filter}
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_vv = 0
            for (tbl,) in vv_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    total_vv += (n or 0)
                except Exception:
                    pass
            counts["vessel_visits"] = total_vv
        except Exception:
            counts["vessel_visits"] = 0

        # ── Support tables ────────────────────────────────────────────────────
        for table in ["ingestion_logs", "rejection_logs", "users", "training_metadata"]:
            try:
                counts[table] = conn.execute(
                    text(f"SELECT COUNT(*) FROM {table}")
                ).scalar()
            except Exception:
                counts[table] = 0

        # ── Per-yard details ──────────────────────────────────────────────────
        yards: list[dict] = []
        try:
            yard_rows = conn.execute(text(f"""
                SELECT DISTINCT
                    replace(relname, '_container_operations', '') AS yard_id
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_container_operations'
                  {yard_filter}
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                ORDER BY 1
            """)).fetchall()

            for (yid,) in yard_rows:
                info: dict = {"yard_id": yid}
                for suffix, label in [
                    ("container_operations", "history_rows"),
                    ("vessel_visits",        "visit_summaries"),
                    ("crane_operations",     "crane_rows"),
                ]:
                    tbl = f"{yid}_{suffix}"
                    try:
                        if suffix == "container_operations":
                            n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE record_type = 'history'")).scalar()
                        else:
                            n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                        info[label] = n or 0
                    except Exception:
                        info[label] = 0
                yards.append(info)
        except Exception:
            pass

        # ── Recent ingestion log ──────────────────────────────────────────────
        try:
            recent_logs = conn.execute(text("""
                SELECT id, filename, dataset_type, status,
                       records_total, completed_at
                FROM ingestion_logs
                ORDER BY created_at DESC
                LIMIT 5
            """)).fetchall()
        except Exception:
            recent_logs = []

    return {
        "yard_filter":       yard_id,
        "counts":            counts,
        "yards":             yards,
        "recent_ingestions": [dict(r._mapping) for r in recent_logs],
    }

