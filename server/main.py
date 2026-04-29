from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.vessel_routes import router as vessel_router
from routes.model_routes import router as model_router

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(vessel_router)
app.include_router(model_router)