from fastapi import APIRouter, File, UploadFile, BackgroundTasks
from models.training_status import training_status
from models.stay_model import train_model
from utils.data_loader import load_data
import os

router = APIRouter(prefix="/model", tags=["Model"])


@router.get("/status")
def get_status():
    return training_status.get()

def background_train():
    try:
        training_status.set("training", "Training started")
        train_model()
        training_status.set("completed", "Model successfully trained")
    except Exception as e:
         training_status.set("failed", f"Failed: {str(e)}")

@router.post("/train-stay")
async def train_stay(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Save the file correctly over the data path
    content = await file.read()
    
    # We write it directly to the designated DATA_PATH so the loader uses it
    data_path = os.getenv("DATA_PATH", "data/dummy_data.csv")
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    
    with open(data_path, "wb") as f:
        f.write(content)
        
    # Reload and train!
    load_data()
    background_tasks.add_task(background_train)
    
    return {"message": "Data uploaded successfully. Training has started!"}