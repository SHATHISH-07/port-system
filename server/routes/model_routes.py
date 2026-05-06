import json
import logging
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form

from models.stay_model import train_stay_model
from models.training_status import training_status, DEFAULT_CONFIG
from db.queries import load_from_db, save_to_history
from services.retraining_service import background_train_and_update
from utils.data_loader import load_from_file, validate_dataframe

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/model", tags=["Model"])


# Training endpoint
@router.post("/vessel-stay/training")
async def train_vessel_stay_model(
    background_tasks: BackgroundTasks,
    data_source: str = Form("db"),
    update_db: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    config: Optional[str] = Form(None),
):
    try:
        # Prevent concurrent training
        if training_status.get().get("status") == "training":
            return {"status": "error", "message": "A training process is already running."}

        logger.info(f"POST /model/vessel-stay/training — source: {data_source}, update_db: {update_db}")

        # Parse config
        parsed_config = training_status.get_last_config()   # start from last known config
        if config:
            try:
                overrides = json.loads(config)
                parsed_config.update({k: v for k, v in overrides.items() if v is not None})
            except json.JSONDecodeError:
                return {"status": "error", "message": "Invalid config JSON."}

        # Load data
        if data_source == "db":
            df = load_from_db("history")
            if df.empty:
                return {
                    "status": "error",
                    "message": "No history data in database. Upload data via POST /ingest/vessel-data first.",
                }

        elif data_source == "file":
            if not file:
                return {"status": "error", "message": "A CSV file is required when data_source is 'file'."}
            if not file.filename.endswith(".csv"):
                return {"status": "error", "message": "Only CSV files are accepted."}

            content = await file.read()
            try:
                df = load_from_file(content)
                df = validate_dataframe(df)
            except ValueError as e:
                return {"status": "error", "message": str(e)}

            # Optionally persist to history
            if update_db:
                try:
                    save_to_history(df)
                    logger.info(f"Appended {len(df)} records to history from uploaded file.")
                except Exception as db_err:
                    return {"status": "error", "message": f"Failed to save to database: {db_err}"}

        else:
            return {"status": "error", "message": "Invalid data_source. Must be 'db' or 'file'."}

        # Start training
        source_label = "database" if data_source == "db" else "uploaded file"
        training_status.set(
            status="training",
            message=f"Training from {source_label} started",
            records_count=len(df),
            data_source=data_source,
            training_type="manual",
            config=parsed_config,
        )

        background_tasks.add_task(background_train_and_update, df, parsed_config)

        return {
            "status": "started",
            "message": f"Training started on {len(df):,} records from {source_label}.",
            "config": parsed_config,
        }

    except Exception as e:
        logger.error(f"POST /model/vessel-stay/training error: {e}")
        return {"status": "error", "message": str(e)}


# Status endpoint
@router.get("/vessel-stay/training/status")
def get_training_status():
    return training_status.get()