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
    if vessel_id and loaded is not None and discharged is not None:
        result = analyze_vessel_dashboard(vessel_id)

        actual_visits = None

        if "actual" in result and "visits" in result["actual"]:
            actual_visits = result["actual"]["visits"]

        manual = predict_from_input(
            loaded,
            discharged,
            actual_visits=actual_visits
        )

        result["predicted"] = manual["predicted"]
        result["input"] = {
            "loaded": loaded,
            "discharged": discharged
        }

        result["mode"] = "override"

        return result

    if vessel_id:
        result = analyze_vessel_dashboard(vessel_id)
        result["mode"] = "vessel"
        return result

    if loaded is not None and discharged is not None:
        return predict_from_input(loaded, discharged)

    return {"error": "Provide valid input"}

@router.get("/heatmap")
def heatmap_analysis(vessel_id: str = Query(...)):
    return get_vessel_heatmap(vessel_id)