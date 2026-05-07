from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from routes.vessel_routes import router as vessel_router
from routes.model_routes import router as model_router
from routes.ingest_routes import router as ingest_router
from routes.config_routes import router as config_router
from routes.auth_routes import router as auth_router
from routes.user_routes import router as user_router
from routes.request_routes import router as request_router
from routes.mapping_routes import router as mapping_router
from routes.source_profile_routes import router as source_profile_router
from routes.model_version_routes import router as model_version_router
from routes.analytics_routes import router as analytics_router

from contextlib import asynccontextmanager
from services.retraining_service import scheduled_retraining_job
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from db.schema import init_training_metadata_schema, init_auth_schema, init_canonical_schema
from db.connection import get_engine
from config import settings
from auth.utils import get_password_hash

# Initialize the scheduler
scheduler = AsyncIOScheduler()

# Lifespan context manager for startup/shutdown tasks
@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    # Startup: Ensure DB schema (training_metadata, auth, and canonical tables)
    try:
        init_training_metadata_schema(engine)
        init_auth_schema(engine)
        init_canonical_schema(engine)
        
        # Seed default admin if it doesn't exist
        with engine.begin() as conn:
            admin_check = conn.execute(
                text("SELECT id FROM users WHERE username = :username"),
                {"username": settings.DEFAULT_ADMIN_USER}
            ).fetchone()
            
            if not admin_check:
                conn.execute(
                    text("INSERT INTO users (username, password_hash, role) VALUES (:username, :hash, 'admin')"),
                    {
                        "username": settings.DEFAULT_ADMIN_USER,
                        "hash": get_password_hash(settings.DEFAULT_ADMIN_PASSWORD)
                    }
                )
                import logging; logging.getLogger("port_system").info(f"[Auth] Seeded default admin: {settings.DEFAULT_ADMIN_USER}")
                
    except Exception as e:
        import logging; logging.getLogger("port_system").error(f"Schema init failed: {e}")
        
    # Schedule the nightly retraining check at 2:00 AM
    scheduler.add_job(scheduled_retraining_job, 'cron', hour=2, minute=0)
    scheduler.start()
    yield
    # Shutdown: Stop the scheduler
    scheduler.shutdown()

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
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(request_router)
app.include_router(vessel_router)
app.include_router(model_router)
app.include_router(ingest_router)
app.include_router(config_router)
app.include_router(mapping_router)
app.include_router(source_profile_router)
app.include_router(model_version_router)
app.include_router(analytics_router)
