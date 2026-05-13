from __future__ import annotations

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query

from auth.dependencies import get_current_user
from db.queries import load_from_db
from models.stay_model import predict_stay_duration_from_metrics
from services.heatmap_service import get_vessel_heatmap
from services.vessel_service import analyze_vessel_dashboard

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/vessel", tags=["vessel"])


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