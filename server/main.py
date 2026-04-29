from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.vessel_routes import router as vessel_router
from routes.model_routes import router as model_router
from routes.upload_routes import router as upload_router

# Initialize FastAPI app
app = FastAPI(title="Port System API", version="2.0.0")

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
app.include_router(upload_router)