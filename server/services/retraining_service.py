import json
import os
import logging
from db.connection import get_engine
from sqlalchemy import text
from models.stay_model import train_stay_model
from models.training_status import training_status
from config import settings
from db.queries import load_from_db
from fastapi import BackgroundTasks
import asyncio

logger = logging.getLogger("port_system")

METADATA_FILE = "data/training_metadata.json"

# Function to get the metadata of the last training
def get_metadata():
    # If no metadata file, return default metadata
    if not os.path.exists(METADATA_FILE):
        return {"last_trained_dataset_size": 0, "last_trained_timestamp": None}
    try:
        # Open and load the metadata from the JSON file
        with open(METADATA_FILE, "r") as f:
            return json.load(f)
    except Exception:
        # If the metadata file is corrupted, return default metadata
        return {"last_trained_dataset_size": 0, "last_trained_timestamp": None}

# Function to update the metadata of the last training
def update_metadata(size: int):
    import datetime
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(METADATA_FILE), exist_ok=True)
    # Write the metadata to a JSON file
    with open(METADATA_FILE, "w") as f:
        json.dump({
            "last_trained_dataset_size": size,
            "last_trained_timestamp": datetime.datetime.now().isoformat()
        }, f)

# Function to get the count of the history containers
def get_history_count() -> int:
    try:
        engine = get_engine()
        from sqlalchemy import inspect
        inspector = inspect(engine)
        # If no history containers table, return 0
        if not inspector.has_table("history_containers"):
            return 0
        # Get the count of history containers
        with engine.connect() as conn:
            result = conn.execute(text('SELECT COUNT(*) FROM "history_containers" WHERE deleted_at IS NULL'))
            return result.scalar()
    except Exception as e:
        logger.error(f"Error getting history count: {e}")
        return 0

# Function to train and update the model in the background
def background_train_and_update(df):
    try:
        train_stay_model(df)
        # If the model is trained successfully, update the metadata
        if training_status.get()["status"] == "completed":
            update_metadata(len(df))
    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"Background training failed: {e}")

# Function to check and trigger retraining
def check_and_trigger_retraining(background_tasks: BackgroundTasks):
    current_count = get_history_count()
    # If no history containers, return
    if current_count == 0:
        return
    
    # Get the metadata of the last training
    metadata = get_metadata()
    # Get the size of the last trained dataset
    last_size = metadata.get("last_trained_dataset_size", 0)
    
    # Calculate the difference between the current count and the last trained dataset size
    difference = current_count - last_size
    
    # Get the threshold for retraining
    threshold = settings.RETRAIN_THRESHOLD_NEW_RECORDS
    
    # Trigger retraining if the difference is greater than or equal to the threshold or if it's the first training
    if difference >= threshold or last_size == 0:
        logger.info(f"Retraining triggered: {difference} new records (threshold: {threshold})")
        try:
            df = load_from_db("history")
            if not df.empty:
                training_status.set(
                    status="training", 
                    message="Automated retraining started",
                    records_count=len(df),
                    data_source="db",
                    training_type="automated"
                )
                background_tasks.add_task(background_train_and_update, df)
        except Exception as e:
            logger.error(f"Failed to load history for retraining: {e}")

# Nightly scheduled retraining job
async def scheduled_retraining_job():
    try:
        # Don't start if already training
        if training_status.get().get("status") == "training":
            return

        # Don't start if no history
        current_count = get_history_count()
        if current_count == 0:
            return
        
        # Get the difference between the current count and the last trained dataset size
        metadata = get_metadata()
        last_size = metadata.get("last_trained_dataset_size", 0)
        
        # Get the difference between the current count and the last trained dataset size
        difference = current_count - last_size
        
        # Get the threshold for retraining
        threshold = settings.RETRAIN_THRESHOLD_NEW_RECORDS
        
        # Start retraining if the difference is greater than or equal to the threshold or if it's the first training
        if difference >= threshold or last_size == 0:
            logger.info(f"Nightly Cron: Retraining triggered for {difference} new records.")
            df = await asyncio.to_thread(load_from_db, "history")
            if not df.empty:
                training_status.set(
                    status="training", 
                    message="Automated nightly retraining started",
                    records_count=len(df),
                    data_source="db",
                    training_type="scheduled"
                )
                await asyncio.to_thread(background_train_and_update, df)
    except Exception as e:
        logger.error(f"Error in nightly retraining job: {e}")
