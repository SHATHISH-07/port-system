from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from utils.data_loader import load_data
from models.stay_model import train_model
from models.training_status import training_status

from routes.vessel_routes import router as vessel_router
from routes.model_routes import router as model_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():

    # 🔥 Load dataset
    load_data()

    # 🔥 Train model if not exists
    if not os.path.exists("models/stay_model.pkl"):
        print("⚠️ Model not found → Training...")
        training_status.set("training", "Training started")

        train_model()  # ✅ blocking (correct)

    else:
        training_status.set("completed", "Model already available")


# ✅ Register routes
app.include_router(vessel_router)
app.include_router(model_router)