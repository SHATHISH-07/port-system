from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text

from auth.dependencies import require_admin
from db.connection import get_engine
from db.queries import load_from_db
from db.training_metadata import get_latest_training_metadata, get_training_metadata_history
from models.training_status import training_status
from services.retraining_service import background_train_and_update

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/model", tags=["ML Model"])


# ─────────────────────────────────────────────────────────────────────────────
# GET /model/status  — combined model status + training progress + active version
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/status")
def get_model_status(admin: dict = Depends(require_admin)):
    """
    Unified model status endpoint. Returns:
      - Current training progress (if a run is active)
      - Last completed training metadata
      - Active model version info
    """
    result: dict = {}

    # ── Training progress ────────────────────────────────────────────────
    progress = training_status.get()
    result["training"] = progress

    # ── Last completed training run ──────────────────────────────────────
    try:
        metadata = get_latest_training_metadata()
        if metadata:
            result["last_trained"] = {
                "timestamp":    metadata.get("last_trained_timestamp"),
                "dataset_size": metadata.get("dataset_size"),
                "training_type": metadata.get("training_type"),
                "status":       metadata.get("status"),
                "notes":        metadata.get("notes"),
            }
        else:
            result["last_trained"] = None
    except Exception as e:
        logger.error("Error fetching training metadata: %s", e)
        result["last_trained"] = None

    # ── Active model version ─────────────────────────────────────────────
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT id, model_name, version, dataset_size, metrics,
                       status, trained_at, promoted_at
                FROM model_versions
                WHERE status = 'active'
                ORDER BY promoted_at DESC NULLS LAST
                LIMIT 1
            """)).fetchone()
        if row:
            r = dict(row._mapping)
            result["active_version"] = r
        else:
            result["active_version"] = None
    except Exception as e:
        logger.error("Error fetching active version: %s", e)
        result["active_version"] = None

    return result


# ─────────────────────────────────────────────────────────────────────────────
# POST /model/training  — trigger retraining
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/training")
async def trigger_training(
    background_tasks: BackgroundTasks,
    data_source: str = Form("db"),
    file: UploadFile  = File(None),
    admin: dict       = Depends(require_admin),
):
    """
    Trigger a model retrain.

    - data_source="db"   → loads all history from the database (default)
    - data_source="file" → trains from an uploaded CSV / Excel file
    """
    import pandas as pd
    from io import BytesIO

    # Guard: don't stack training runs
    if training_status.get().get("status") == "training":
        raise HTTPException(
            status_code=409,
            detail="A training run is already in progress. Please wait.",
        )

    df = pd.DataFrame()

    if data_source == "file" and file:
        try:
            content = await file.read()
            if file.filename.endswith((".xlsx", ".xls")):
                df = pd.read_excel(BytesIO(content))
            else:
                df = pd.read_csv(BytesIO(content), low_memory=False)
            logger.info(
                "[ModelRoute] File upload training: %s rows from '%s'",
                len(df), file.filename,
            )
        except Exception as e:
            raise HTTPException(400, f"Failed to parse uploaded file: {e}")
    else:
        df = load_from_db("history", full_load=True)
        logger.info("[ModelRoute] DB training: %d rows loaded", len(df))

    if df.empty:
        raise HTTPException(400, "No data available for training.")

    config = training_status.get_last_config()

    training_status.set(
        status="training",
        message="Retraining started",
        records_count=len(df),
        data_source=data_source,
        training_type="manual",
        config=config,
    )

    background_tasks.add_task(background_train_and_update, df, config)

    return {
        "message": "Retraining job submitted to background.",
        "status":  "training",
        "records": len(df),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /model/versions  — list versions + training history + promote
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/versions")
def list_model_versions(
    limit: int = 50,
    admin: dict = Depends(require_admin),
):
    """
    List all model versions and training history in one response.
    """
    engine = get_engine()
    versions = []
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT
                    id, model_name, version, artifact_path,
                    dataset_size, metrics, status,
                    trained_at, promoted_at, notes
                FROM model_versions
                ORDER BY trained_at DESC NULLS LAST
                LIMIT :lim
            """), {"lim": limit}).fetchall()
        versions = [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error("list_model_versions error: %s", e)

    # Training history
    history = get_training_metadata_history(limit=limit)

    return {
        "versions": versions,
        "training_history": history,
    }


@router.post("/versions/{version_id}/promote")
def promote_model_version(version_id: str, admin: dict = Depends(require_admin)):
    """
    Promote a specific model version to 'active', retiring the current one.
    """
    engine = get_engine()
    now = datetime.now(timezone.utc)

    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT model_name FROM model_versions WHERE id = :id::UUID"),
            {"id": version_id},
        ).fetchone()

        if not row:
            raise HTTPException(404, f"Model version '{version_id}' not found")

        model_name = row[0]

        # Retire current active version
        conn.execute(
            text("""
                UPDATE model_versions
                SET status = 'retired', updated_at = :now
                WHERE model_name = :name AND status = 'active'
            """),
            {"name": model_name, "now": now},
        )

        # Promote the requested version
        conn.execute(
            text("""
                UPDATE model_versions
                SET status      = 'active',
                    promoted_at = :now,
                    updated_at  = :now
                WHERE id = :id::UUID
            """),
            {"id": version_id, "now": now},
        )

    logger.info("[ModelRoute] Promoted version %s to active", version_id)
    return {"status": "ok", "promoted_version_id": version_id}