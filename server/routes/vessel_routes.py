from __future__ import annotations
# cspell:disable

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from auth.dependencies import get_current_user
from db.connection import get_engine
from db.queries import load_from_db
from services.vessel_service import (
    analyze_vessel_dashboard,
    get_yard_heatmap_data,
)

from schemas.vessel import HeatmapRequest, VesselAnalysisResponse, YardSummaryResponse, DiscoverServicesRequest

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/vessel", tags=["Vessel Analytics"])

# GET /vessel/analysis
@router.get("/analysis", response_model=VesselAnalysisResponse)
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
        df_curr = load_from_db("current", vessel_id=vessel_id)
        df_hist = load_from_db("history", vessel_id=vessel_id)

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
            raise HTTPException(status_code=404, detail=hist_result.get("error", "No data found for vessel"))

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("vessel_analysis error for %s: %s", vessel_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# POST /vessel/heatmap  — unified map/heatmap/container-position endpoint

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
        res = get_yard_heatmap_data(
            unit_ids=request.unit_ids if request.unit_ids else None,
            yard_id=request.yard_id,
            vessel_id=request.vessel_id,
        )
        if "error" in res:
            raise HTTPException(status_code=404, detail=res["error"])
            
        import math
        import pandas as pd
        def clean_nan(obj):
            if isinstance(obj, dict):
                return {k: clean_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_nan(v) for v in obj]
            elif isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return None
            elif pd.isna(obj):
                return None
            return obj
            
        return clean_nan(res)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("vessel_heatmap error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("/discover-services")
async def discover_services(
    request: DiscoverServicesRequest, current_user: dict = Depends(get_current_user)
):
    """
    Discovers unique outbound services (vessels) from a list of unit IDs.
    """
    try:
        from services.vessel_service import discover_services_for_containers
        services = discover_services_for_containers(request.unit_ids, request.yard_id)
        return {"services": services}
    except Exception as e:
        logger.error(f"Error discovering services: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Server Error")

from schemas.vessel import PortStayPredictionRequest, PortStayPredictionResponse

@router.post("/port-stay", response_model=PortStayPredictionResponse)
async def predict_port_stay_route(
    request: PortStayPredictionRequest, current_user: dict = Depends(get_current_user)
):
    """
    Predicts the port stay time for a vessel given the total number of load moves.
    Uses historical performance data (avg cranes, avg mph) for the given vessel_id.
    """
    try:
        from services.vessel_service import predict_port_stay
        res = predict_port_stay(request.vessel_id, request.load_moves)
        return res
    except Exception as e:
        logger.error(f"Error predicting port stay: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Server Error")

@router.get("/yard/summary", response_model=YardSummaryResponse)
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
        yard_filter = "WHERE yard_id = :y" if yard_id else ""
        y_param = {"y": yard_id} if yard_id else {}

        # ── History/Operational containers ────────────────────────────────────
        try:
            n = conn.execute(text(f"SELECT COUNT(*) FROM containers {yard_filter}"), y_param).scalar()
            counts["history_containers"] = n or 0
        except Exception:
            counts["history_containers"] = 0

        # ── Current containers (Dynamic Extraction count) ─────────────────────
        try:
            time_filter = "time_out IS NULL"
            curr_where = f"WHERE {time_filter} AND yard_id = :y" if yard_id else f"WHERE {time_filter}"
            n = conn.execute(text(f"SELECT COUNT(*) FROM containers {curr_where}"), y_param).scalar()
            counts["current_containers"] = n or 0
        except Exception:
            counts["current_containers"] = 0

        # ── Crane movements ───────────────────────────────────────────────────
        try:
            n = conn.execute(text(f"SELECT COUNT(*) FROM cranes {yard_filter}"), y_param).scalar()
            counts["crane_movements"] = n or 0
        except Exception:
            counts["crane_movements"] = 0


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
            yard_cond = "yard_id = :y AND yard_id IS NOT NULL" if yard_id else "yard_id IS NOT NULL"
            yard_rows = conn.execute(text(f"""
                SELECT DISTINCT yard_id
                FROM containers
                WHERE {yard_cond}
                ORDER BY 1
            """), y_param).fetchall()

            for (yid,) in yard_rows:
                yid_str = str(yid).strip()
                info: dict = {"yard_id": yid_str}
                
                info["history_rows"] = conn.execute(text("SELECT COUNT(*) FROM containers WHERE yard_id = :y"), {"y": yid_str}).scalar() or 0
                info["crane_rows"] = conn.execute(text("SELECT COUNT(*) FROM cranes WHERE yard_id = :y"), {"y": yid_str}).scalar() or 0
                

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

    if not yards and counts.get("history_containers", 0) == 0 and counts.get("current_containers", 0) == 0:
        raise HTTPException(status_code=404, detail="No yard summary data found")

    res = {
        "yard_filter":       yard_id or "ALL",
        "counts":            counts,
        "yards":             yards,
        "recent_ingestions": [dict(r._mapping) for r in recent_logs],
    }
    return res

