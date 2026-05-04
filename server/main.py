from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.vessel_routes import router as vessel_router
from routes.model_routes import router as model_router
from routes.upload_routes import router as upload_router

from contextlib import asynccontextmanager
import asyncio
from services.retraining_service import continuous_retraining_check

# Lifespan context manager for startup/shutdown tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the continuous retraining check task
    task = asyncio.create_task(continuous_retraining_check())
    yield
    # Shutdown: Cancel the task
    task.cancel()

# Initialize FastAPI app
app = FastAPI(title="Port System API", version="2.0.0", lifespan=lifespan)

import logging
import time
from fastapi import Request
from fastapi.responses import JSONResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)

# Get the logger
logger = logging.getLogger("port_system")

# Middleware function to log requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info(f"{request.method} {request.url.path} - {response.status_code} - {process_time:.4f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"Unhandled Exception on {request.method} {request.url.path} - {process_time:.4f}s: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error. Please try again later."}
        )

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