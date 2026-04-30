from fastapi import APIRouter, Form
from db.queries import load_df_from_db
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_from_input
import logging
from db.queries import _api_cache

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/vessel", tags=["Vessel"])


# 1. VESSEL HISTORY ANALYSIS
@router.post("/vessel-history-analysis")
async def vessel_history_analysis(
    vessel_id: str = Form(None)
):
    logger.info(f"Starting history vessel analysis for {vessel_id}")
    try:
        cache_key = f"history_{vessel_id}"
        if cache_key in _api_cache:
            return _api_cache[cache_key]

        df = load_df_from_db("history", vessel_id)
        result = analyze_vessel_dashboard(df, vessel_id)
        result["mode"] = "history"
        
        _api_cache[cache_key] = result
        logger.info(f"Completed history vessel analysis for {vessel_id}")
        return result
    except Exception as e:
        logger.error(f"Error in history vessel analysis for {vessel_id}: {str(e)}", exc_info=True)
        raise


# 2. CURRENT VESSEL ANALYSIS
@router.post("/current-vessel-analysis")
async def current_vessel_analysis(
    vessel_id: str = Form(None),
    loaded: int = Form(None),
    discharged: int = Form(None),
):
    logger.info(f"Starting current vessel analysis for {vessel_id}")
    try:
        cache_key = f"current_{vessel_id}"
        if cache_key in _api_cache:
            result = dict(_api_cache[cache_key]) # shallow copy
        else:
            df = load_df_from_db("current", vessel_id)
            result = analyze_vessel_dashboard(df, vessel_id)
            if "error" not in result:
                _api_cache[cache_key] = result
            result = dict(result)

        if loaded is not None and discharged is not None:
            actual_visits = result.get("actual", {}).get("visits", {}) if result and "actual" in result and result["actual"] else {}
            manual = predict_from_input(loaded, discharged, actual_visits)
            result["predicted"] = manual["predicted"]
            result["input"] = {
                "loaded": loaded,
                "discharged": discharged
            }
            result["mode"] = "current-override"

        logger.info(f"Completed current vessel analysis for {vessel_id}")
        return result
    except Exception as e:
        logger.error(f"Error in current vessel analysis for {vessel_id}: {str(e)}", exc_info=True)
        raise


# 3. HEATMAP ANALYSIS
@router.post("/heatmap")
async def heatmap_analysis(
    vessel_id: str = Form(None)
):
    logger.info(f"Starting heatmap analysis for {vessel_id}")
    try:
        cache_key = f"heatmap_{vessel_id}"
        if cache_key in _api_cache:
            return _api_cache[cache_key]

        # Heatmap uses the same 'current' dataset
        df = load_df_from_db("current", vessel_id)
        result = get_vessel_heatmap(df, vessel_id)
        
        if "error" not in result:
            _api_cache[cache_key] = result
        
        logger.info(f"Completed heatmap analysis for {vessel_id}")
        return result
    except Exception as e:
        logger.error(f"Error in heatmap analysis for {vessel_id}: {str(e)}", exc_info=True)
        raise