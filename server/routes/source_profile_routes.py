"""Source Profile Routes — CRUD for source profile configurations."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from auth.dependencies import require_admin
from auth.utils import log_audit
from db.connection import get_engine
from sqlalchemy import text

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/source-profiles", tags=["Source Profiles"])


class SourceProfileCreate(BaseModel):
    name: str
    description: Optional[str] = None
    terminal_id: Optional[int] = None
    dataset_type: Optional[str] = None
    alias_map: Optional[dict] = {}
    datetime_formats: Optional[list] = []
    detection_rules: Optional[dict] = {}
    position_rules: Optional[dict] = {}
    validation_rules: Optional[dict] = {}
    transformation_rules: Optional[dict] = {}


class SourceProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    dataset_type: Optional[str] = None
    alias_map: Optional[dict] = None
    datetime_formats: Optional[list] = None
    detection_rules: Optional[dict] = None
    position_rules: Optional[dict] = None
    validation_rules: Optional[dict] = None
    transformation_rules: Optional[dict] = None


def _row_to_dict(row) -> dict:
    return {
        "id":                   row[0],
        "terminal_id":          row[1],
        "name":                 row[2],
        "description":          row[3],
        "dataset_type":         row[4],
        "alias_map":            row[5] or {},
        "datetime_formats":     row[6] or [],
        "detection_rules":      row[7] or {},
        "position_rules":       row[8] or {},
        "validation_rules":     row[9] or {},
        "transformation_rules": row[10] or {},
        "is_active":            row[11],
        "created_at":           row[12].isoformat() if row[12] else None,
        "updated_at":           row[13].isoformat() if row[13] else None,
    }


# ── List ──────────────────────────────────────────────────────────────────────
@router.get("/")
def list_source_profiles(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT sp.id, sp.terminal_id, sp.name, sp.description, sp.dataset_type,
                   sp.alias_map, sp.datetime_formats, sp.detection_rules,
                   sp.position_rules, sp.validation_rules, sp.transformation_rules,
                   sp.is_active, sp.created_at, sp.updated_at,
                   t.name AS terminal_name
            FROM source_profiles sp
            LEFT JOIN terminals t ON t.id = sp.terminal_id
            WHERE sp.is_active = TRUE
            ORDER BY sp.name
        """)).fetchall()
    return {
        "source_profiles": [
            {**_row_to_dict(r), "terminal_name": r[14]}
            for r in rows
        ]
    }


# ── Get by ID ─────────────────────────────────────────────────────────────────
@router.get("/{profile_id}")
def get_source_profile(profile_id: int, admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, terminal_id, name, description, dataset_type,
                   alias_map, datetime_formats, detection_rules,
                   position_rules, validation_rules, transformation_rules,
                   is_active, created_at, updated_at
            FROM source_profiles WHERE id = :id AND is_active = TRUE
        """), {"id": profile_id}).fetchone()
    if not row:
        raise HTTPException(404, "Source profile not found")
    return _row_to_dict(row)


# ── Create ────────────────────────────────────────────────────────────────────
@router.post("/")
def create_source_profile(body: SourceProfileCreate, admin: dict = Depends(require_admin)):
    import json
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        row = conn.execute(text("""
            INSERT INTO source_profiles
                (terminal_id, name, description, dataset_type,
                 alias_map, datetime_formats, detection_rules,
                 position_rules, validation_rules, transformation_rules,
                 is_active, created_by, created_at, updated_at)
            VALUES
                (:tid, :name, :desc, :dtype,
                 :alias::jsonb, :dtf::jsonb, :dr::jsonb,
                 :pr::jsonb, :vr::jsonb, :tr::jsonb,
                 TRUE, :by, :now, :now)
            RETURNING id
        """), {
            "tid":   body.terminal_id,
            "name":  body.name,
            "desc":  body.description,
            "dtype": body.dataset_type,
            "alias": json.dumps(body.alias_map or {}),
            "dtf":   json.dumps(body.datetime_formats or []),
            "dr":    json.dumps(body.detection_rules or {}),
            "pr":    json.dumps(body.position_rules or {}),
            "vr":    json.dumps(body.validation_rules or {}),
            "tr":    json.dumps(body.transformation_rules or {}),
            "by":    admin["id"],
            "now":   now,
        }).fetchone()

    log_audit("Source Profile Created", f"Created source profile '{body.name}' (id={row[0]})", admin["id"])
    return {"status": "ok", "id": row[0], "name": body.name}


# ── Update ────────────────────────────────────────────────────────────────────
@router.put("/{profile_id}")
def update_source_profile(profile_id: int, body: SourceProfileUpdate, admin: dict = Depends(require_admin)):
    import json
    engine = get_engine()
    now = datetime.now(timezone.utc)

    updates = []
    params: dict = {"id": profile_id, "now": now}

    if body.name is not None:
        updates.append("name = :name"); params["name"] = body.name
    if body.description is not None:
        updates.append("description = :desc"); params["desc"] = body.description
    if body.dataset_type is not None:
        updates.append("dataset_type = :dtype"); params["dtype"] = body.dataset_type
    if body.alias_map is not None:
        updates.append("alias_map = :alias::jsonb"); params["alias"] = json.dumps(body.alias_map)
    if body.datetime_formats is not None:
        updates.append("datetime_formats = :dtf::jsonb"); params["dtf"] = json.dumps(body.datetime_formats)
    if body.detection_rules is not None:
        updates.append("detection_rules = :dr::jsonb"); params["dr"] = json.dumps(body.detection_rules)
    if body.position_rules is not None:
        updates.append("position_rules = :pr::jsonb"); params["pr"] = json.dumps(body.position_rules)
    if body.validation_rules is not None:
        updates.append("validation_rules = :vr::jsonb"); params["vr"] = json.dumps(body.validation_rules)
    if body.transformation_rules is not None:
        updates.append("transformation_rules = :tr::jsonb"); params["tr"] = json.dumps(body.transformation_rules)

    if not updates:
        raise HTTPException(400, "No fields to update")

    updates.append("updated_at = :now")
    with engine.begin() as conn:
        result = conn.execute(
            text(f"UPDATE source_profiles SET {', '.join(updates)} WHERE id = :id AND is_active = TRUE"),
            params
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Source profile not found")

    log_audit("Source Profile Updated", f"Updated source profile id={profile_id}", admin["id"])
    return {"status": "ok", "id": profile_id}


# ── Deactivate ────────────────────────────────────────────────────────────────
@router.delete("/{profile_id}")
def deactivate_source_profile(profile_id: int, admin: dict = Depends(require_admin)):
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        result = conn.execute(text(
            "UPDATE source_profiles SET is_active = FALSE, updated_at = :now WHERE id = :id"
        ), {"id": profile_id, "now": now})
        if result.rowcount == 0:
            raise HTTPException(404, "Source profile not found")
    log_audit("Source Profile Deactivated", f"Deactivated source profile id={profile_id}", admin["id"])
    return {"status": "ok"}
