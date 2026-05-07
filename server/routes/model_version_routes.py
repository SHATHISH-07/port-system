"""Model Version Routes — list, promote, and manage ML model versions and feature configs."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth.dependencies import require_admin
from auth.utils import log_audit
from db.connection import get_engine
from sqlalchemy import text

router = APIRouter(prefix="/model", tags=["Model Versions"])


class FeatureConfigCreate(BaseModel):
    name: str
    description: Optional[str] = None
    feature_names: list[str]
    preprocessing_config: Optional[dict] = {}


# ── Model Versions ────────────────────────────────────────────────────────────

@router.get("/versions")
def list_model_versions(admin: dict = Depends(require_admin)):
    """List all trained model versions with metrics."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT mv.id, mv.model_name, mv.version, mv.artifact_path,
                   mv.dataset_size, mv.metrics, mv.status,
                   mv.trained_at, mv.promoted_at, mv.notes,
                   fc.name AS feature_config_name
            FROM model_versions mv
            LEFT JOIN feature_configs fc ON fc.id = mv.feature_config_id
            ORDER BY mv.trained_at DESC
            LIMIT 50
        """)).fetchall()

    return {
        "versions": [
            {
                "id":                   r[0],
                "model_name":           r[1],
                "version":              r[2],
                "artifact_path":        r[3],
                "dataset_size":         r[4],
                "metrics":              r[5] or {},
                "status":               r[6],
                "trained_at":           r[7].isoformat() if r[7] else None,
                "promoted_at":          r[8].isoformat() if r[8] else None,
                "notes":                r[9],
                "feature_config_name":  r[10],
            }
            for r in rows
        ]
    }


@router.post("/versions/{version_id}/promote")
def promote_model_version(version_id: int, admin: dict = Depends(require_admin)):
    """Promote a specific model version to 'active' (demotes all others)."""
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        # Demote all existing active versions of same model
        row = conn.execute(text(
            "SELECT model_name FROM model_versions WHERE id = :id"
        ), {"id": version_id}).fetchone()
        if not row:
            raise HTTPException(404, "Model version not found")

        conn.execute(text("""
            UPDATE model_versions SET status = 'retired', updated_at = :now
            WHERE model_name = :name AND status = 'active'
        """), {"name": row[0], "now": now})

        conn.execute(text("""
            UPDATE model_versions
            SET status = 'active', promoted_at = :now, updated_at = :now
            WHERE id = :id
        """), {"id": version_id, "now": now})

    log_audit("Model Version Promoted", f"Promoted model version id={version_id}", admin["id"])
    return {"status": "ok", "promoted_version_id": version_id}


# ── Feature Configs ───────────────────────────────────────────────────────────

@router.get("/feature-configs")
def list_feature_configs(admin: dict = Depends(require_admin)):
    """List all feature configurations."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, name, description, feature_names, preprocessing_config,
                   is_active, created_at, updated_at
            FROM feature_configs
            WHERE is_active = TRUE
            ORDER BY name
        """)).fetchall()

    return {
        "feature_configs": [
            {
                "id":                   r[0],
                "name":                 r[1],
                "description":          r[2],
                "feature_names":        r[3] or [],
                "preprocessing_config": r[4] or {},
                "is_active":            r[5],
                "created_at":           r[6].isoformat() if r[6] else None,
                "updated_at":           r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]
    }


@router.post("/feature-configs")
def create_feature_config(body: FeatureConfigCreate, admin: dict = Depends(require_admin)):
    """Create a new feature configuration for the ML pipeline."""
    import json
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        row = conn.execute(text("""
            INSERT INTO feature_configs
                (name, description, feature_names, preprocessing_config,
                 is_active, created_at, updated_at)
            VALUES
                (:name, :desc, :fn::jsonb, :pc::jsonb, TRUE, :now, :now)
            ON CONFLICT (name) DO UPDATE SET
                description          = EXCLUDED.description,
                feature_names        = EXCLUDED.feature_names,
                preprocessing_config = EXCLUDED.preprocessing_config,
                updated_at           = EXCLUDED.updated_at
            RETURNING id
        """), {
            "name": body.name,
            "desc": body.description,
            "fn":   json.dumps(body.feature_names),
            "pc":   json.dumps(body.preprocessing_config or {}),
            "now":  now,
        }).fetchone()

    log_audit("Feature Config Created", f"Created feature config '{body.name}' (id={row[0]})", admin["id"])
    return {"status": "ok", "id": row[0], "name": body.name}
