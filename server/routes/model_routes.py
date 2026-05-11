import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Form, File, UploadFile
from sqlalchemy import text
from datetime import datetime, timezone

from db.connection import get_engine
from auth.dependencies import require_admin
from services.retraining_service import background_train_and_update
from db.training_metadata import get_latest_training_metadata
from db.queries import load_from_db
from models.training_status import training_status

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/model", tags=["ML Model"])

# get model status
@router.get("/status")
def get_model_status(admin: dict = Depends(require_admin)):
    try:
        metadata = get_latest_training_metadata()
        if not metadata:
            return {"status": "no_data", "message": "No training metadata found."}
        return {
            "status": "active",
            "last_trained": metadata.get("last_trained_timestamp"),
            "dataset_size": metadata.get("dataset_size"),
            "training_type": metadata.get("training_type")
        }
    except Exception as e:
        logger.error(f"Error fetching model status: {e}")
        return {"status": "error", "message": str(e)}

# get training progress
@router.get("/vessel-stay/training/status")
def get_training_progress(admin: dict = Depends(require_admin)):
    return training_status.get()

# manual retraining
@router.post("/vessel-stay/training")
async def trigger_manual_retraining(
    background_tasks: BackgroundTasks,
    data_source: str = Form("db"),
    update_db: bool = Form(False),
    file: UploadFile = File(None),
    admin: dict = Depends(require_admin)
):
    import pandas as pd
    from io import BytesIO

    df = pd.DataFrame()
    
    if data_source == "file" and file:
        try:
            content = await file.read()
            if file.filename.endswith((".xlsx", ".xls")):
                df = pd.read_excel(BytesIO(content))
            else:
                df = pd.read_csv(BytesIO(content), low_memory=False)
            
            # If update_db is true, we should ideally trigger ingestion too.
            # For now, we just train on this data.
            if update_db:
                # We could call the ingestion service here, but for simplicity
                # let's just log that it's not implemented or handled separately.
                logger.info("update_db requested but skipped in training flow - use /ingest/upload instead")
        except Exception as e:
            raise HTTPException(400, f"Failed to parse uploaded file: {e}")
    else:
        # Default: Load from DB
        df = load_from_db("history", full_load=True)

    if df.empty:
        raise HTTPException(400, "No data available for training.")
    
    # Get the last training config
    config = training_status.get_last_config()
    
    # Update training status
    training_status.set(
        status="training",
        message="Manual retraining started",
        records_count=len(df),
        data_source=data_source,
        training_type="manual",
    )
    
    background_tasks.add_task(background_train_and_update, df, config)
    return {"message": "Retraining job submitted to background.", "status": "success"}

# list all trained model versions
@router.get("/versions")
def list_model_versions(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        # fetch all model versions
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

# promote model version
@router.post("/versions/{version_id}/promote")
def promote_model_version(version_id: int, admin: dict = Depends(require_admin)):
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        # fetch the model name
        row = conn.execute(text(
            "SELECT model_name FROM model_versions WHERE id = :id"
        ), {"id": version_id}).fetchone()
        if not row:
            raise HTTPException(404, "Model version not found")
        
        # set current active model to retired
        conn.execute(text("""
            UPDATE model_versions SET status = 'retired', updated_at = :now
            WHERE model_name = :name AND status = 'active'
        """), {"name": row[0], "now": now})

        # set new model version to active
        conn.execute(text("""
            UPDATE model_versions
            SET status = 'active', promoted_at = :now, updated_at = :now
            WHERE id = :id
        """), {"id": version_id, "now": now})
        
    return {"status": "ok", "promoted_version_id": version_id}