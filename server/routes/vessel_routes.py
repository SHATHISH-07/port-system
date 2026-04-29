from fastapi import APIRouter, Form
from db.queries import load_df_from_db
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_from_input

router = APIRouter(prefix="/vessel", tags=["Vessel"])


# 1. VESSEL HISTORY ANALYSIS
@router.post("/vessel-history-analysis")
async def vessel_history_analysis(
    vessel_id: str = Form(None)
):
    df = load_df_from_db("history")
    result = analyze_vessel_dashboard(df, vessel_id)
    result["mode"] = "history"
    return result


# 2. CURRENT VESSEL ANALYSIS
@router.post("/current-vessel-analysis")
async def current_vessel_analysis(
    vessel_id: str = Form(None),
    loaded: int = Form(None),
    discharged: int = Form(None),
):
    df = load_df_from_db("current")
    result = analyze_vessel_dashboard(df, vessel_id)

    if loaded is not None and discharged is not None:
        actual_visits = result.get("actual", {}).get("visits", {}) if result and "actual" in result and result["actual"] else {}
        manual = predict_from_input(loaded, discharged, actual_visits)
        result["predicted"] = manual["predicted"]
        result["input"] = {
            "loaded": loaded,
            "discharged": discharged
        }
        result["mode"] = "current-override"

    return result


# 3. HEATMAP ANALYSIS
@router.post("/heatmap")
async def heatmap_analysis(
    vessel_id: str = Form(None)
):
    # Heatmap uses the same 'current' dataset
    df = load_df_from_db("current")
    return get_vessel_heatmap(df, vessel_id)