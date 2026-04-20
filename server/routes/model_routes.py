from fastapi import APIRouter, File, UploadFile, BackgroundTasks
import os

from models.stay_model import train_model
from models.training_status import training_status
from utils.data_loader import load_data, _df

router = APIRouter(prefix="/model", tags=["Model"])


# =========================================================
# BACKGROUND TRAIN FUNCTION
# =========================================================
def background_train():
    try:
        # 🔥 reset cached data so new file is used
        global _df
        _df = None

        load_data()
        train_model()

    except Exception as e:
        training_status.set("failed", str(e))


# =========================================================
# TRAIN ENDPOINT
# =========================================================
@router.post("/train-stay")
async def train_stay(background_tasks: BackgroundTasks, file: UploadFile = File(...)):

    try:
        # Save uploaded dataset
        content = await file.read()

        data_path = os.getenv("DATA_PATH", "data/data.csv")
        os.makedirs(os.path.dirname(data_path), exist_ok=True)

        with open(data_path, "wb") as f:
            f.write(content)

        # Start async training
        training_status.set("training", "Training started")
        background_tasks.add_task(background_train)

        return {
            "status": "started",
            "message": "Dataset uploaded. Training started in background."
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# =========================================================
# TRAINING STATUS ENDPOINT
# =========================================================
@router.get("/status")
def get_training_status():
    return training_status.get()