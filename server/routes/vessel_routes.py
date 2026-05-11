from fastapi import APIRouter, Depends, HTTPException, Query, Form
from auth.dependencies import get_current_user
import pandas as pd
from db.connection import get_engine
from sqlalchemy import text
from services.vessel_service import analyze_vessel_dashboard
from services.heatmap_service import get_vessel_heatmap
from models.stay_model import predict_stay_duration_from_metrics

router = APIRouter(prefix="/vessel", tags=["vessel"])

# load data from db
def load_from_db(dataset_type: str) -> pd.DataFrame:
    engine = get_engine()
    table = "history_containers" if dataset_type == "history" else "current_containers"
    # fetch data from db
    with engine.connect() as conn:
        df = pd.read_sql_query(text(f"SELECT * FROM {table}"), conn)
        
    # convert to datetime
    for col in ["move_complete_time", "time_in", "time_out"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            
    return df

# get vessel analysis
@router.get("/analysis")
async def get_vessel_analysis(
    vessel_id: str = Query(..., alias="vesselId"),
    dataset_type: str = Query("history", alias="datasetType"),
    current_user: dict = Depends(get_current_user),
):
    try:
        # fetch data from db
        df = load_from_db(dataset_type)
        if df.empty:
            return {"error": "No data available in database", "vessel": vessel_id}
        
        # get vessel analysis
        result = analyze_vessel_dashboard(df, vessel_id)
        if "error" in result:
            return {"error": result["error"], "vessel": vessel_id, "mode": "vessel"}
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# get vessel heatmap
@router.post("/heatmap")
async def get_vessel_heatmap_route(
    vessel_id: str = Form(..., alias="vessel_id"),
    dataset_type: str = Query("current", alias="datasetType"),
    current_user: dict = Depends(get_current_user),
):
    try:
        # fetch data from db
        df = load_from_db(dataset_type)
        if df.empty:
            return {"error": "No data available", "vessel": vessel_id}
        # get vessel heatmap
        return get_vessel_heatmap(df, vessel_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# get vessel predictions
@router.get("/predict-manual")
async def predict_manual(
    loaded: int = 0,
    discharged: int = 0,
    current_user: dict = Depends(get_current_user),
):
    try:
        # predict stay duration from metrics
        return predict_stay_duration_from_metrics(loaded, discharged)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))