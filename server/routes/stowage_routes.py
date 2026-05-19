import json
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Form, File, UploadFile

from auth.dependencies import get_current_user
from schemas.stowage import (
    CurrentPlanningResponse,
    HistoryAnalysisResponse,
    StowageVisualizationResponse,
)
from services.stowage_service import (
    get_historical_stowage_analysis,
    process_current_planning,
)
from services.stowage_visualizer_service import get_stowage_visualization
from utils.stowage_parser import parse_upload_request

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/stowage", tags=["Stowage"])

@router.get("/history/analysis", response_model=HistoryAnalysisResponse)
def history_analysis(
    vesselId: str = Query(..., description="Outbound Service / Vessel ID"),
    yardId: Optional[str] = Query(None, description="Optional yard boundary"),
    visitId: Optional[str] = Query(None, description="Optional visit filter"),
    current_user: dict = Depends(get_current_user),
):
    """
    Fetches historical container stowage patterns, groupings, and distributions.
    """
    try:
        return get_historical_stowage_analysis(vessel_id=vesselId, yard_id=yardId, visit_id=visitId)
    except Exception as e:
        logger.error("Error in history_analysis: %s", e)
        raise HTTPException(status_code=500, detail="Failed to aggregate historical stowage")


@router.post("/current/planning", response_model=CurrentPlanningResponse)
async def current_planning(
    request: Request,
    vesselId: Optional[str] = Form(None, description="Outbound Service / Vessel ID"),
    yardId: Optional[str] = Form(None, description="Optional Yard ID"),
    containerIds: Optional[str] = Form(None, description="Comma/newline separated container IDs or JSON array"),
    file: Optional[UploadFile] = File(None, description="Container list text/json file"),
    current_user: dict = Depends(get_current_user),
):
    """
    Accepts either:
    - application/json with vesselId, yardId, containerIds
    - multipart/form-data with vesselId, yardId, containerIds and/or file
    """
    try:
        try:
            req_data = await parse_upload_request(request)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        vessel_id = req_data["vessel_id"]
        yard_id = req_data["yard_id"]
        container_ids = req_data["container_ids"]

        if not vessel_id:
            raise HTTPException(status_code=400, detail="vesselId is required")

        if not container_ids:
            raise HTTPException(status_code=400, detail="No valid container IDs were provided")

        return process_current_planning(
            vessel_id=vessel_id,
            yard_id=yard_id,
            container_ids=container_ids,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in current_planning: %s", e)
        raise HTTPException(status_code=500, detail="Failed to process current stowage plan")


@router.post("/visualization", response_model=StowageVisualizationResponse)
async def stowage_visualization(
    request: Request,
    vesselId: Optional[str] = Form(None, description="Outbound Service / Vessel ID"),
    yardId: Optional[str] = Form(None, description="Optional Yard ID"),
    visitId: Optional[str] = Form(None, description="Optional Visit ID (for historical view)"),
    containerIds: Optional[str] = Form(None, description="Comma/newline separated container IDs or JSON array"),
    file: Optional[UploadFile] = File(None, description="Container list text/json file"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns deck visualization map based on actual database records.
    - If visitId is present, queries historical container records.
    - If visitId is absent, queries current containers matching containerIds.
    Accepts application/json or multipart/form-data.
    """
    try:
        try:
            req_data = await parse_upload_request(request)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        vessel_id = req_data["vessel_id"]
        yard_id = req_data["yard_id"]
        visit_id = req_data["visit_id"]
        container_ids = req_data["container_ids"]

        if not vessel_id:
            raise HTTPException(status_code=400, detail="vesselId is required")

        # For current visualization, we must have containers to look up
        if not visit_id and not container_ids:
            raise HTTPException(status_code=400, detail="containerIds are required for current visualization")

        return get_stowage_visualization(
            vessel_id=vessel_id,
            yard_id=yard_id,
            visit_id=visit_id,
            container_ids=container_ids,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in stowage_visualization: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate visualization map")