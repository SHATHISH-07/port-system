import logging
from fastapi import APIRouter, BackgroundTasks

from models.stay_model import train_stay_model
from models.training_status import training_status
from db.queries import load_df_from_db
from services.retraining_service import background_train_and_update

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/model", tags=["Model"])

# Train vessel stay model from history database
@router.post("/vessel-stay/train")
async def train_vessel_stay_model(background_tasks: BackgroundTasks):
    try:
        # Log the request
        logger.info("POST /model/vessel-stay/train — loading history from DB")

        # Load the data from the database
        df = load_df_from_db("history")

        # Check if the data is empty
        if df.empty:
            return {
                "status": "error",
                "message": "No history data found in database. Upload data first via POST /upload/history."
            }

        # Set training status and train the model
        training_status.set("training", "Training from database started")
        
        # Add training task to background tasks
        background_tasks.add_task(background_train_and_update, df)

        return {
            "status": "started",
            "message": f"Training started on {len(df):,} records from the database."
        }

    except Exception as e:
        logger.error(f"POST /model/vessel-stay/train error: {e}")
        return {"status": "error", "message": str(e)}

# Get training status
@router.get("/status")
def get_training_status():
    return training_status.get()