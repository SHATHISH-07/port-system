import json
import logging
import os
from datetime import datetime
from typing import Any, Iterable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth.dependencies import get_current_user
from schemas.stowage import CurrentPlanningResponse, HistoryAnalysisResponse
from services.stowage_service import get_historical_stowage_analysis, process_current_planning
from utils.file_parser import extract_container_ids_from_file, extract_container_ids_from_text

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/stowage", tags=["Stowage"])

_LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "response_logs")


def _write_response_log(filename: str, input_data: dict, response_data: dict, status_code: int = 200):
    """
    Writes a structured request+response log to the response_logs folder.
    """
    try:
        os.makedirs(_LOG_DIR, exist_ok=True)
        log_entry = {
            "endpoint": filename.replace(".json", ""),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "input": input_data,
            "status_code": status_code,
            "response": response_data
        }
        path = os.path.join(_LOG_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(log_entry, f, indent=2, default=str)
    except Exception as log_err:
        logger.warning("Failed to write response log %s: %s", filename, log_err)


def _clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    return text


def _merge_unique(existing: list[str], new_items: Iterable[str]) -> list[str]:
    seen = set(existing)
    merged = list(existing)
    for item in new_items:
        item = _clean_text(item)
        if item and item not in seen:
            seen.add(item)
            merged.append(item)
    return merged


def _coerce_container_ids(value: Any) -> list[str]:
    if value is None:
        return []

    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if isinstance(item, str):
                out = _merge_unique(out, extract_container_ids_from_text(item))
            else:
                out = _merge_unique(out, [str(item).strip()])
        return out

    if isinstance(value, str):
        return extract_container_ids_from_text(value)

    return [str(value).strip()] if str(value).strip() else []


@router.get("/history/analysis", response_model=HistoryAnalysisResponse)
def history_analysis(
    vesselId: str = Query(..., description="Outbound Service / Vessel ID"),
    yardId: Optional[str] = Query(None, description="Optional yard boundary"),
    visitId: Optional[str] = Query(None, description="Optional visit filter"),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetches historical container stowage patterns, groupings, and distributions.
    """
    try:
        result = get_historical_stowage_analysis(vessel_id=vesselId, yard_id=yardId, visit_id=visitId)
        _write_response_log(
            "stowage_history_analysis.json",
            input_data={"vesselId": vesselId, "yardId": yardId, "visitId": visitId},
            response_data=result
        )
        return result
    except Exception as e:
        logger.error("Error in history_analysis: %s", e)
        raise HTTPException(status_code=500, detail="Failed to aggregate historical stowage")


@router.post("/current/planning", response_model=CurrentPlanningResponse)
async def current_planning(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Accepts either:
    - application/json with vesselId, yardId, containerIds
    - multipart/form-data with vesselId, yardId, containerIds and/or file
    """
    try:
        content_type = request.headers.get("content-type", "").lower()

        vessel_id = None
        yard_id = None
        container_ids: list[str] = []
        filename = None

        if "application/json" in content_type:
            body = await request.json()
            vessel_id = _clean_text(body.get("vesselId"))
            yard_id = _clean_text(body.get("yardId"))
            container_ids = _coerce_container_ids(body.get("containerIds"))

        else:
            form = await request.form()
            vessel_id = _clean_text(form.get("vesselId"))
            yard_id = _clean_text(form.get("yardId"))

            if "containerIds" in form:
                container_ids = _coerce_container_ids(form.get("containerIds"))

            upload = form.get("file")
            if upload is not None and getattr(upload, "filename", None):
                filename = upload.filename
                content = await upload.read()
                file_ids = extract_container_ids_from_file(content, upload.filename)
                container_ids = _merge_unique(container_ids, file_ids)

        if not vessel_id:
            raise HTTPException(status_code=400, detail="vesselId is required")

        if not container_ids:
            raise HTTPException(status_code=400, detail="No valid container IDs were provided")

        result = process_current_planning(
            vessel_id=vessel_id,
            yard_id=yard_id,
            container_ids=container_ids
        )

        _write_response_log(
            "stowage_current_planning.json",
            input_data={
                "vesselId": vessel_id,
                "yardId": yard_id,
                "filename": filename,
                "containerIds": container_ids[:10],
                "totalContainerIds": len(container_ids)
            },
            response_data=result
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in current_planning: %s", e)
        raise HTTPException(status_code=500, detail="Failed to process current stowage plan")