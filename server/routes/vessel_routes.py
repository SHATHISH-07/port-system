from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import pandas as pd

from db.queries import load_from_db
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_stay_duration_from_metrics
from auth.dependencies import get_current_user

router = APIRouter(prefix="/vessel", tags=["vessel"])

@router.get("/analysis")
async def get_vessel_analysis(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("history", alias="datasetType"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get comprehensive analysis for a specific vessel service.
    Works for both 'current' and 'history' datasets.
    """
    try:
        df = load_from_db(dataset_type)
        if df.empty:
            return {"error": "No data available in database", "vessel": vessel_id}
            
        result = analyze_vessel_dashboard(df, vessel_id)
        if "error" in result:
            # Check if it's just no data for THIS vessel
            return {"error": result["error"], "vessel": vessel_id, "mode": "vessel"}
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/heatmap")
async def get_vessel_heatmap_route(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("history", alias="datasetType"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get yard heatmap data for a specific vessel service.
    """
    try:
        df = load_from_db(dataset_type)
        if df.empty:
            return {"error": "No data available", "vessel": vessel_id}
            
        result = get_vessel_heatmap(df, vessel_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/predict-manual")
async def predict_manual(
    loaded: int = 0,
    discharged: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually predict stay-time based on move counts.
    """
    try:
        return predict_stay_duration_from_metrics(loaded, discharged)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
