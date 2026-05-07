"""
Mapping Routes — schema detection, suggestion, confirmation, and template management.
All endpoints require admin authorization.
"""
import logging
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import pandas as pd
from io import BytesIO
from datetime import datetime, timezone

from auth.dependencies import require_admin
from auth.utils import log_audit
from services.schema_mapper import (
    detect_dataset_type,
    suggest_mappings,
    persist_mappings,
    load_confirmed_mappings,
)
from db.connection import get_engine
from sqlalchemy import text

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/mapping", tags=["Schema Mapping"])


class ConfirmMappingsRequest(BaseModel):
    source_profile_id: int
    mappings: list[dict]


# ── Detect dataset type from uploaded file ────────────────────────────────────
@router.post("/detect")
async def detect_dataset(
    file: UploadFile = File(...),
    source_profile_id: Optional[int] = Form(None),
    admin: dict = Depends(require_admin),
):
    """Auto-detect dataset type from uploaded file columns."""
    try:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content), nrows=5)
        elif file.filename.endswith(".json"):
            records = json.loads(content.decode())
            df = pd.DataFrame(records[:5] if isinstance(records, list) else [records])
        else:
            raise HTTPException(400, "Only .csv or .json files are supported.")
    except Exception as e:
        raise HTTPException(422, f"Failed to parse file: {e}")

    source_profile = None
    if source_profile_id:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT alias_map, detection_rules FROM source_profiles WHERE id = :id"),
                {"id": source_profile_id}
            ).fetchone()
            if row:
                source_profile = {"alias_map": row[0] or {}, "detection_rules": row[1] or {}}

    result = detect_dataset_type(list(df.columns), source_profile)
    return {
        "filename":    file.filename,
        "columns":     list(df.columns),
        "total_cols":  len(df.columns),
        **result,
    }


# ── Get field mapping suggestions ────────────────────────────────────────────
@router.post("/suggest")
async def get_mapping_suggestions(
    file: UploadFile = File(...),
    dataset_type: Optional[str] = Form(None),
    source_profile_id: Optional[int] = Form(None),
    admin: dict = Depends(require_admin),
):
    """Return fuzzy field mapping suggestions for a dataset."""
    try:
        content = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content), nrows=5)
        elif file.filename.endswith(".json"):
            records = json.loads(content.decode())
            df = pd.DataFrame(records[:5] if isinstance(records, list) else [records])
        else:
            raise HTTPException(400, "Only .csv or .json files are supported.")
    except Exception as e:
        raise HTTPException(422, f"Failed to parse file: {e}")

    source_profile = None
    confirmed_mappings = []

    if source_profile_id:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT alias_map, detection_rules FROM source_profiles WHERE id = :id"),
                {"id": source_profile_id}
            ).fetchone()
            if row:
                source_profile = {"alias_map": row[0] or {}, "detection_rules": row[1] or {}}
        confirmed_mappings = load_confirmed_mappings(source_profile_id)

    # If no dataset_type supplied, auto-detect
    if not dataset_type:
        detection = detect_dataset_type(list(df.columns), source_profile)
        dataset_type = detection["dataset_type"]

    # Merge confirmed mappings with fresh suggestions (confirmed take priority)
    confirmed_map = {m["raw_field"]: m for m in confirmed_mappings}
    suggestions = suggest_mappings(list(df.columns), dataset_type, source_profile)
    merged = []
    for s in suggestions:
        if s["raw_field"] in confirmed_map:
            confirmed = confirmed_map[s["raw_field"]]
            merged.append({**confirmed, "already_confirmed": True})
        else:
            merged.append({**s, "already_confirmed": False})

    return {
        "dataset_type": dataset_type,
        "columns":      list(df.columns),
        "suggestions":  merged,
        "total":        len(merged),
        "auto_mapped":  sum(1 for m in merged if m.get("canonical_field")),
        "unmapped":     sum(1 for m in merged if not m.get("canonical_field")),
    }


# ── Admin confirms and saves mappings ─────────────────────────────────────────
@router.post("/confirm")
async def confirm_mappings(
    body: ConfirmMappingsRequest,
    admin: dict = Depends(require_admin),
):
    """Persist confirmed field mappings for a source profile."""
    count = persist_mappings(
        source_profile_id=body.source_profile_id,
        mappings=body.mappings,
        confirmed_by=admin["id"],
    )
    log_audit(
        "Schema Mapping Confirmed",
        f"Confirmed {count} field mappings for source_profile_id={body.source_profile_id}",
        admin["id"]
    )
    return {"status": "ok", "mappings_saved": count}


# ── List templates (confirmed mappings per source profile) ────────────────────
@router.get("/templates")
def list_mapping_templates(admin: dict = Depends(require_admin)):
    """List all source profiles that have confirmed mappings."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                sp.id,
                sp.name,
                sp.dataset_type,
                COUNT(sm.id) AS confirmed_field_count,
                MAX(sm.confirmed_at) AS last_confirmed_at
            FROM source_profiles sp
            LEFT JOIN schema_mappings sm
                ON sm.source_profile_id = sp.id AND sm.is_confirmed = TRUE
            WHERE sp.is_active = TRUE
            GROUP BY sp.id, sp.name, sp.dataset_type
            ORDER BY sp.name
        """)).fetchall()

    return {
        "templates": [
            {
                "source_profile_id":    r[0],
                "source_profile_name":  r[1],
                "dataset_type":         r[2],
                "confirmed_field_count": r[3],
                "last_confirmed_at":    r[4].isoformat() if r[4] else None,
            }
            for r in rows
        ]
    }


# ── Get specific template's confirmed mappings ────────────────────────────────
@router.get("/templates/{source_profile_id}")
def get_mapping_template(source_profile_id: int, admin: dict = Depends(require_admin)):
    """Retrieve all confirmed field mappings for a source profile."""
    mappings = load_confirmed_mappings(source_profile_id)
    return {"source_profile_id": source_profile_id, "mappings": mappings, "total": len(mappings)}
