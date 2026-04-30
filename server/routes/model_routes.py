import logging
from fastapi import APIRouter, File, UploadFile, BackgroundTasks

from models.stay_model import train_model
from models.training_status import training_status
from utils.data_loader import load_csv
from db.queries import load_df_from_db
from utils.endpoint_cache import set_cache, get_cache

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/model", tags=["Model"])


def background_train(df):
    try:
        train_model(df)
    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"Background training failed: {e}")


@router.post("/train-stay")
async def train_stay(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(None)
):
    """Train the model from an uploaded CSV file, or the last uploaded file in cache."""
    try:
        if file:
            content = await file.read()
            df = load_csv(content)
            set_cache("model", df)
        else:
            df = get_cache("model")

        training_status.set("training", "Training started")
        logger.info("POST /model/train-stay — training started from uploaded file")

        background_tasks.add_task(background_train, df)

        return {
            "status": "started",
            "message": "Training started in background"
        }

    except Exception as e:
        logger.error(f"POST /model/train-stay error: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/retrain-from-db")
async def retrain_from_db(background_tasks: BackgroundTasks):
    """
    Retrain the stay-time model directly from the history data stored in PostgreSQL.
    This is the recommended retraining path after new data is ingested via /upload/history.
    """
    try:
        logger.info("POST /model/retrain-from-db — loading history from DB")
        df = load_df_from_db("history")

        if df.empty:
            return {
                "status": "error",
                "message": "No history data found in database. Upload data first via POST /upload/history."
            }

        training_status.set("training", "Retraining from database")
        background_tasks.add_task(background_train, df)

        return {
            "status": "started",
            "message": f"Retraining started on {len(df):,} records from the database."
        }

    except Exception as e:
        logger.error(f"POST /model/retrain-from-db error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/status")
def get_training_status():
    return training_status.get()