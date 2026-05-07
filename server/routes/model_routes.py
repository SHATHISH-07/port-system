import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import text
from typing import Optional
from datetime import datetime, timezone

from db.connection import get_engine
from auth.dependencies import require_admin
from services.retraining_service import check_and_trigger_retraining, background_train_and_update
from db.training_metadata import get_latest_training_metadata
from db.queries import load_from_db
from models.training_status import training_status

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/model", tags=["ML Model"])

@router.get("/status")
def get_model_status(admin: dict = Depends(require_admin)):
    """Return the current status of the stay-time model."""
    try:
        metadata = get_latest_training_metadata()
        if not metadata:
            return {"status": "no_data", "message": "No training metadata found."}
        return {
            "status": "active",
            "last_trained": metadata.get("training_date"),
            "dataset_size": metadata.get("dataset_size"),
            "training_type": metadata.get("training_type")
        }
    except Exception as e:
        logger.error(f"Error fetching model status: {e}")
        return {"status": "error", "message": str(e)}

@router.get("/vessel-stay/training/status")
def get_training_progress(admin: dict = Depends(require_admin)):
    """Return current training progress/status from memory."""
    return training_status.get()

@router.post("/retrain")
def trigger_manual_retraining(background_tasks: BackgroundTasks, admin: dict = Depends(require_admin)):
    """Manually trigger a background retraining job."""
    df = load_from_db("history")
    if df.empty:
        raise HTTPException(400, "No historical data available for training.")
    
    config = training_status.get_last_config()
    training_status.set(
        status="training",
        message="Manual retraining started",
        records_count=len(df),
        data_source="db",
        training_type="manual",
    )
    background_tasks.add_task(background_train_and_update, df, config)
    return {"message": "Retraining job submitted to background."}

@router.get("/versions")
def list_model_versions(admin: dict = Depends(require_admin)):
    """List all trained model versions."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, model_name, version, artifact_path,
                   dataset_size, metrics, status,
                   trained_at, promoted_at, notes
            FROM model_versions
            ORDER BY trained_at DESC LIMIT 50
        """)).fetchall()
    
    return {
        "versions": [
            dict(r._mapping) for r in rows
        ]
    }

@router.post("/versions/{version_id}/promote")
def promote_model_version(version_id: int, admin: dict = Depends(require_admin)):
    """Promote a specific model version to 'active'."""
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
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

    return {"status": "ok", "promoted_version_id": version_id}