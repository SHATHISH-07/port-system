import logging
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form

from models.stay_model import train_stay_model
from models.training_status import training_status
from db.queries import load_from_db, save_to_history
from services.retraining_service import background_train_and_update
from utils.data_loader import load_from_file, validate_dataframe

logger = logging.getLogger("port_system")

# Router for model endpoints
router = APIRouter(prefix="/model", tags=["Model"])

# Train vessel stay model from history database
@router.post("/vessel-stay/training")
async def train_vessel_stay_model(
    background_tasks: BackgroundTasks,
    data_source: str = Form("db"),
    update_db: bool = Form(False),
    file: Optional[UploadFile] = File(None)
):
    try:
        # Prevent concurrent training
        if training_status.get().get("status") == "training":
            return {"status": "error", "message": "A training process is already running."}

        # Log the request
        logger.info(f"POST /model/vessel-stay/training — source: {data_source}, update_db: {update_db}")

        if data_source == "db":
            # Load the data from the database
            df = load_from_db("history")
            if df.empty:
                return {
                    "status": "error",
                    "message": "No history data found in database. Upload data first via POST /upload/history."
                }
        elif data_source == "file":
            if not file:
                return {"status": "error", "message": "File is required when data_source is 'file'"}
            if not file.filename.endswith(".csv"):
                return {"status": "error", "message": "Only CSV files are accepted."}
            
            content = await file.read()
            try:
                df = load_from_file(content)
                df = validate_dataframe(df)
            except ValueError as e:
                return {"status": "error", "message": str(e)}

            # Append to history DB if requested
            if update_db:
                try:
                    save_to_history(df)
                    logger.info(f"Appended {len(df)} records to history from uploaded file.")
                except Exception as db_err:
                    return {"status": "error", "message": f"Failed to save to database: {db_err}"}
        else:
            return {"status": "error", "message": "Invalid data_source. Must be 'db' or 'file'."}

        # Set training status and train the model
        source_label = "database" if data_source == "db" else "uploaded file"
        
        training_status.set(
            status="training", 
            message=f"Training from {source_label} started",
            records_count=len(df),
            data_source=data_source,
            training_type="manual"
        )
        
        # Add training task to background tasks
        background_tasks.add_task(background_train_and_update, df)

        return {
            "status": "started",
            "message": f"Training started on {len(df):,} records from {source_label}."
        }

    except Exception as e:
        logger.error(f"POST /model/vessel-stay/training error: {e}")
        return {"status": "error", "message": str(e)}

# Get training status
@router.get("/vessel-stay/training/status")
def get_training_status():
    return training_status.get()