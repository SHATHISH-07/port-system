from fastapi import APIRouter, Query
from services.vessel_service import analyze_vessel
from services.heatmap_service import get_vessel_heatmap

router = APIRouter(prefix="/vessel", tags=["Vessel"])

@router.get("/analysis")
def vessel_analysis(vessel_id: str = Query(...)):
    return analyze_vessel(vessel_id)

@router.get("/heatmap")
def heatmap_analysis(vessel_id: str = Query(...)):
    return get_vessel_heatmap(vessel_id)