from fastapi import APIRouter, UploadFile, File
from utils.data_loader import load_csv

from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_from_input

from utils.endpoint_cache import set_cache, get_cache

router = APIRouter(prefix="/vessel", tags=["Vessel"])


# 1. VESSEL HISTORY ANALYSIS
@router.post("/vessel-history-analysis")
async def vessel_history_analysis(
    file: UploadFile = File(None),
    vessel_id: str = None
):
    if file:
        content = await file.read()
        df = load_csv(content)
        set_cache("history", df)
    else:
        df = get_cache("history")

    result = analyze_vessel_dashboard(df, vessel_id)
    result["mode"] = "history"

    return result


# 2. CURRENT VESSEL ANALYSIS
@router.post("/current-vessel-analysis")
async def current_vessel_analysis(
    file: UploadFile = File(None),
    loaded: int = None,
    discharged: int = None,
    vessel_id: str = None
):
    if file:
        content = await file.read()
        df = load_csv(content)
        set_cache("current", df)
    else:
        df = get_cache("current")

    result = analyze_vessel_dashboard(df, vessel_id)

    if loaded is not None and discharged is not None:
        manual = predict_from_input(loaded, discharged)
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
    file: UploadFile = File(None),
    vessel_id: str = None
):
    if file:
        content = await file.read()
        df = load_csv(content)
        set_cache("heatmap", df)
    else:
        df = get_cache("heatmap")

    return get_vessel_heatmap(df, vessel_id)