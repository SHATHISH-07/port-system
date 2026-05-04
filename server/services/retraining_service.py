import json
import os
import logging
from db.connection import get_engine
from sqlalchemy import text
from models.stay_model import train_stay_model
from models.training_status import training_status
from config import settings
from db.queries import load_df_from_db
from fastapi import BackgroundTasks

logger = logging.getLogger("port_system")

METADATA_FILE = "data/training_metadata.json"

def get_metadata():
    if not os.path.exists(METADATA_FILE):
        return {"last_trained_dataset_size": 0, "last_trained_timestamp": None}
    try:
        with open(METADATA_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"last_trained_dataset_size": 0, "last_trained_timestamp": None}

def update_metadata(size: int):
    import datetime
    os.makedirs(os.path.dirname(METADATA_FILE), exist_ok=True)
    with open(METADATA_FILE, "w") as f:
        json.dump({
            "last_trained_dataset_size": size,
            "last_trained_timestamp": datetime.datetime.now().isoformat()
        }, f)

def get_history_count() -> int:
    try:
        engine = get_engine()
        from sqlalchemy import inspect
        inspector = inspect(engine)
        if not inspector.has_table("history_containers"):
            return 0
        with engine.connect() as conn:
            result = conn.execute(text('SELECT COUNT(*) FROM "history_containers" WHERE deleted_at IS NULL'))
            return result.scalar()
    except Exception as e:
        logger.error(f"Error getting history count: {e}")
        return 0

def background_train_and_update(df):
    try:
        train_stay_model(df)
        if training_status.get()["status"] == "completed":
            update_metadata(len(df))
    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"Background training failed: {e}")

def check_and_trigger_retraining(background_tasks: BackgroundTasks):
    current_count = get_history_count()
    if current_count == 0:
        return
    
    metadata = get_metadata()
    last_size = metadata.get("last_trained_dataset_size", 0)
    
    difference = current_count - last_size
    threshold = settings.RETRAIN_THRESHOLD_NEW_RECORDS
    
    if difference >= threshold or last_size == 0:
        logger.info(f"Retraining triggered: {difference} new records (threshold: {threshold})")
        try:
            df = load_df_from_db("history")
            if not df.empty:
                training_status.set("training", "Automated retraining started")
                background_tasks.add_task(background_train_and_update, df)
        except Exception as e:
            logger.error(f"Failed to load history for retraining: {e}")
