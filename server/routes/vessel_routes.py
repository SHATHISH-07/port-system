from fastapi import APIRouter, Depends, HTTPException, Query
from auth.dependencies import get_current_user
import pandas as pd
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_stay_duration_from_metrics
from db.queries import load_from_db

router = APIRouter(prefix="/vessel", tags=["vessel"])


@router.get("/analysis")
async def get_vessel_analysis(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("history", alias="datasetType"),
    loaded: int = Query(None, alias="loaded"),
    discharged: int = Query(None, alias="discharged"),
    target_mph: float = Query(None, alias="target_mph"),
    current_user: dict = Depends(get_current_user),
):
    try:
        df = load_from_db(dataset_type)
        if df.empty and dataset_type == "current":
            # If current DB is empty, definitely try history
            df = load_from_db("history")
            dataset_type = "history"

        history_df = load_from_db("history") if dataset_type == "current" else None
        result = analyze_vessel_dashboard(
            df,
            vessel_id,
            loaded_override=loaded,
            discharged_override=discharged,
            target_mph_override=target_mph,
            history_df=history_df,
        )

        # Fallback logic: If searching in 'current' but not found, try 'history'
        # to allow predicting an upcoming vessel that isn't at berth yet.
        if "error" in result and dataset_type == "current":
            history_df = load_from_db("history")
            if not history_df.empty:
                hist_result = analyze_vessel_dashboard(
                    history_df,
                    vessel_id,
                    loaded_override=loaded,
                    discharged_override=discharged,
                    target_mph_override=target_mph,
                )
                if "error" not in hist_result:
                    # Mark as upcoming/planned for the UI
                    hist_result["mode"] = "upcoming_prediction"
                    return hist_result

        if "error" in result:
            return {"error": result["error"], "vessel": vessel_id, "mode": "vessel"}
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap")
async def get_vessel_heatmap_route(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("current", alias="datasetType"),
    current_user: dict = Depends(get_current_user),
):
    try:
        df = load_from_db(dataset_type)
        if df.empty:
            return {"error": "No data available", "vessel": vessel_id}
        return get_vessel_heatmap(df, vessel_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predict-manual")
async def predict_manual(
    loaded: int = 0,
    discharged: int = 0,
    target_mph: float = 0,
    current_user: dict = Depends(get_current_user),
):
    try:
        return predict_stay_duration_from_metrics(loaded, discharged, target_mph)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))