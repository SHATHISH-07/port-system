from __future__ import annotations

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from typing import List, Optional

from auth.dependencies import get_current_user
from db.queries import load_from_db
from models.stay_model import predict_stay_duration_from_metrics
from services.heatmap_service import get_vessel_heatmap
from services.vessel_service import (
    analyze_vessel_dashboard,
    get_unified_stay_analysis,
    get_yard_heatmap_data,
    get_terminal_map_data
)

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/vessel", tags=["vessel"])


# ─────────────────────────────────────────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────────────────────────────────────────

class FilterByUnitsRequest(BaseModel):
    unit_ids: List[str]
    vessel_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# GET /vessel/analysis
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/analysis")
async def get_vessel_analysis(
    vessel_id: str = Query(..., alias="vesselId"),
    loaded: int = Query(None, alias="loaded"),
    discharged: int = Query(None, alias="discharged"),
    crane_count: int = Query(None, alias="craneCount"),
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
            crane_count_override=crane_count,
            history_df=df_hist,
        )

        # ── Step 2: fall back to history if not in current yard ──────────────
        if "error" in result:
            hist_result = analyze_vessel_dashboard(
                df_hist,
                vessel_id,
                loaded_override=loaded,
                discharged_override=discharged,
                crane_count_override=crane_count,
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
# GET /vessel/visits  — fast-path: vessel_visits summary table
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/visits")
async def get_vessel_visits(
    vessel_id: str = Query(None, alias="vesselId"),
    current_user: dict = Depends(get_current_user),
):
    """
    Return pre-aggregated vessel visit summaries from the vessel_visits table.
    Much faster than the full /analysis endpoint; use for list/overview views.
    """
    try:
        df = load_from_db("vessel_visits", vessel_id=vessel_id)
        if df.empty:
            return {"visits": [], "total": 0}

        records = df.to_dict(orient="records")
        return {"visits": records, "total": len(records)}

    except Exception as exc:
        logger.error("vessel_visits error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# GET /vessel/heatmap
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/heatmap")
async def get_vessel_heatmap_route(
    vessel_id: str = Query(..., alias="vesselId"),
    current_user: dict = Depends(get_current_user),
):
    """
    Return yard heatmap data for a vessel.

    Tries the current yard snapshot first; falls back to history.
    Both datasets are loaded once and reused.
    """
    try:
        df_curr = load_from_db("current")
        df_hist = load_from_db("history")

        # Prefer current snapshot
        result = get_vessel_heatmap(df_curr, vessel_id)

        if "error" in result:
            result = get_vessel_heatmap(df_hist, vessel_id)

        return result

    except Exception as exc:
        logger.error("vessel_heatmap error for %s: %s", vessel_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# GET /vessel/predict-manual
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/predict-manual")
async def predict_manual(
    loaded: int = Query(0),
    discharged: int = Query(0),
    crane_count: int = Query(0),
    vessel_id: str = Query(None, alias="vesselId"),
    current_user: dict = Depends(get_current_user),
):
    """
    Metric-based stay prediction without needing historical container rows.

    If `vesselId` is provided, historical crane averages and MPHC are pulled
    from the vessel_visits summary table and used as the prediction baseline.
    """
    try:
        historical_crane_avg: float = 0.0
        historical_mph_avg: float = 0.0

        if vessel_id:
            vv_df = load_from_db("vessel_visits", vessel_id=vessel_id)
            if not vv_df.empty:
                if "avg_crane_count" in vv_df.columns:
                    historical_crane_avg = float(
                        vv_df["avg_crane_count"].dropna().mean() or 0.0
                    )
                if "avg_mphc" in vv_df.columns:
                    historical_mph_avg = float(
                        vv_df["avg_mphc"].dropna().mean() or 0.0
                    )

        return predict_stay_duration_from_metrics(
            loaded,
            discharged,
            crane_count_override=crane_count or None,
            historical_crane_avg=historical_crane_avg or None,
            historical_mph_avg=historical_mph_avg or None,
        )

    except Exception as exc:
        logger.error("predict_manual error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# GET /vessel/yard-map
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/yard-map")
async def get_yard_map_route(
    vessel_id: str = Query(None, alias="vesselId"),
    yard_id: str = Query(None, alias="yardId"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns block density data for the 2D Terminal Grid.
    If vesselId is provided, the data is restricted to that vessel's cargo.
    """
    try:
        # Note: Must query time_out IS NULL for live yard state (handled in service)
       return get_yard_heatmap_data(vessel_id=vessel_id, yard_id=yard_id)
    except Exception as exc:
        logger.error("yard_map error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# GET /vessel/terminal-map
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/terminal-map")
async def get_terminal_map_route(
    yard_id: str = Query(None, alias="yardId"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns full terminal infrastructure data (berths, lanes, etc.).
    """
    try:
        return get_terminal_map_data(yard_id=yard_id)
    except Exception as exc:
        logger.error("terminal_map error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# POST /vessel/filter-by-units
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/filter-by-units")
async def filter_by_units_route(
    request: FilterByUnitsRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns a unified stay analysis scoped to a specific list of Unit IDs.
    Used for 'What-If' planning with custom container lists.
    """
    try:
        return get_unified_stay_analysis(
            vessel_id=request.vessel_id or "UPLOADED_LIST",
            optional_unit_ids=request.unit_ids
        )
    except Exception as exc:
        logger.error("filter_by_units error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
