from fastapi import APIRouter, Form
from db.queries import load_df_from_db
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_from_input
import logging
from db.queries import _api_cache

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/vessel", tags=["Vessel"])


# Vessel history analysis
@router.post("/vessel-history-analysis")
async def vessel_history_analysis(
    vessel_id: str = Form(None)
):
    # Log the request
    logger.info(f"Starting history vessel analysis for {vessel_id}")
    try:
        # Check if the result is in the cache
        cache_key = f"history_{vessel_id}"
        if cache_key in _api_cache:
            return _api_cache[cache_key]
        
        # Load the data from the database
        df = load_df_from_db("history", vessel_id)
        # Analyze the data
        result = analyze_vessel_dashboard(df, vessel_id)
        result["mode"] = "history"
        # Store the result in the cache
        _api_cache[cache_key] = result
        # Log the completion
        logger.info(f"Completed history vessel analysis for {vessel_id}")
        return result
    except Exception as e:
        logger.error(f"Error in history vessel analysis for {vessel_id}: {str(e)}", exc_info=True)
        raise

# Current vessel analysis
@router.post("/current-vessel-analysis")
async def current_vessel_analysis(
    vessel_id: str = Form(None),
    loaded: int = Form(None),
    discharged: int = Form(None),
):
    # Log the request
    logger.info(f"Starting current vessel analysis for {vessel_id}")
    try:
        # Check if the result is in the cache
        cache_key = f"current_{vessel_id}"
        if cache_key in _api_cache:
            result = dict(_api_cache[cache_key])
        else:
            # Load the data from the database
            df = load_df_from_db("current", vessel_id)
            # Analyze the data
            result = analyze_vessel_dashboard(df, vessel_id)
            # Store the result in the cache
            if "error" not in result:
                _api_cache[cache_key] = result
            result = dict(result)
        # Predict the result if loaded and discharged are provided
        if loaded is not None and discharged is not None:
            actual_visits = result.get("actual", {}).get("visits", {}) if result and "actual" in result and result["actual"] else {}
            manual = predict_from_input(loaded, discharged, actual_visits)
            result["predicted"] = manual["predicted"]
            result["input"] = {
                "loaded": loaded,
                "discharged": discharged
            }
            result["mode"] = "current-override"
        # Log the completion
        logger.info(f"Completed current vessel analysis for {vessel_id}")
        return result
    except Exception as e:
        logger.error(f"Error in current vessel analysis for {vessel_id}: {str(e)}", exc_info=True)
        raise

# Heatmap analysis
@router.post("/heatmap")
async def heatmap_analysis(
    vessel_id: str = Form(None)
):
    # Log the request
    logger.info(f"Starting heatmap analysis for {vessel_id}")
    try:
        # Check if the result is in the cache
        cache_key = f"heatmap_{vessel_id}"
        if cache_key in _api_cache:
            return _api_cache[cache_key]
        # Heatmap uses the same 'current' dataset
        df = load_df_from_db("current", vessel_id)
        result = get_vessel_heatmap(df, vessel_id)
        # Store the result in the cache
        if "error" not in result:
            _api_cache[cache_key] = result
        # Log the completion
        logger.info(f"Completed heatmap analysis for {vessel_id}")
        return result
    except Exception as e:
        logger.error(f"Error in heatmap analysis for {vessel_id}: {str(e)}", exc_info=True)
        raise