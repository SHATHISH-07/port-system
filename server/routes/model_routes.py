from fastapi import APIRouter, File, UploadFile, BackgroundTasks

from models.stay_model import train_model
from models.training_status import training_status
from utils.data_loader import load_csv

from utils.endpoint_cache import set_cache, get_cache

router = APIRouter(prefix="/model", tags=["Model"])


def background_train(df):
    try:
        train_model(df)
    except Exception as e:
        training_status.set("failed", str(e))


@router.post("/train-stay")
async def train_stay(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(None)
):
    try:
        if file:
            content = await file.read()
            df = load_csv(content)
            set_cache("model", df)
        else:
            df = get_cache("model")

        training_status.set("training", "Training started")

        background_tasks.add_task(background_train, df)

        return {
            "status": "started",
            "message": "Training started in background"
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/status")
def get_training_status():
    return training_status.get()