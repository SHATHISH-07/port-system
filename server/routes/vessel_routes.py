from fastapi import APIRouter, Depends, HTTPException, Query
from auth.dependencies import get_current_user
import pandas as pd
from db.connection import get_engine
from sqlalchemy import text
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_stay_duration_from_metrics

router = APIRouter(prefix="/vessel", tags=["vessel"])

def load_from_db(dataset_type: str) -> pd.DataFrame:
    engine = get_engine()
    table = "history_containers" if dataset_type == "history" else "current_containers"
    
    with engine.connect() as conn:
        df = pd.read_sql_query(text(f"SELECT * FROM {table}"), conn)
        
    for col in ["move_complete_time", "time_in", "time_out"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            
    return df

@router.get("/analysis")
async def get_vessel_analysis(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("history", alias="datasetType"),
    current_user: dict = Depends(get_current_user),
):
    try:
        df = load_from_db(dataset_type)
        if df.empty:
            return {"error": "No data available in database", "vessel": vessel_id}

        result = analyze_vessel_dashboard(df, vessel_id)
        if "error" in result:
            return {"error": result["error"], "vessel": vessel_id, "mode": "vessel"}
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/heatmap")
async def get_vessel_heatmap_route(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("history", alias="datasetType"),
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
    current_user: dict = Depends(get_current_user),
):
    try:
        return predict_stay_duration_from_metrics(loaded, discharged)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))