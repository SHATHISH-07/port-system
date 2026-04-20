from fastapi import APIRouter, Query
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_from_input

router = APIRouter(prefix="/vessel", tags=["Vessel"])


@router.get("/analysis")
def vessel_analysis(
    vessel_id: str = Query(None),
    loaded: int = Query(None),
    discharged: int = Query(None)
):
    """
    3 modes:
    1. vessel_id → full analytics
    2. vessel_id + loaded/discharged → full analytics + override prediction
    3. loaded/discharged → manual only
    """

    # -----------------------------
    # CASE 1: FULL + OVERRIDE
    # -----------------------------
    if vessel_id and loaded is not None and discharged is not None:
        result = analyze_vessel_dashboard(vessel_id)

        manual = predict_from_input(loaded, discharged)

        # 🔥 override prediction
        result["predicted"] = manual["predicted"]

        # 🔥 add input
        result["input"] = {
            "loaded": loaded,
            "discharged": discharged
        }

        result["mode"] = "override"

        return result

    # -----------------------------
    # CASE 2: VESSEL ONLY
    # -----------------------------
    if vessel_id:
        result = analyze_vessel_dashboard(vessel_id)
        result["mode"] = "vessel"
        return result

    # -----------------------------
    # CASE 3: MANUAL ONLY
    # -----------------------------
    if loaded is not None and discharged is not None:
        return predict_from_input(loaded, discharged)

    return {"error": "Provide valid input"}

@router.get("/heatmap")
def heatmap_analysis(vessel_id: str = Query(...)):
    return get_vessel_heatmap(vessel_id)