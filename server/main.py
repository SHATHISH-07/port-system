import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text

from auth.utils import get_password_hash
from config import settings
from db.connection import get_engine
from db.queries import init_auth_schema, init_simplified_schema, init_training_metadata_schema
from routes.analytics_routes import router as analytics_router
from routes.auth_routes import router as auth_router
from routes.config_routes import router as config_router
from routes.ingest_routes import router as ingest_router
from routes.model_routes import router as model_router
from routes.vessel_routes import router as vessel_router
from services.retraining_service import scheduled_retraining_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[logging.StreamHandler()],
)

logger = logging.getLogger("port_system")
scheduler = AsyncIOScheduler()

# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database schema and admin user on startup
    engine = get_engine()
    # Create tables if they don't exist
    try:
        # Initialize tables for training metadata, authentication, and the main data model
        init_training_metadata_schema(engine)
        init_auth_schema(engine)
        init_simplified_schema(engine)

        # Check if the admin user exists and create it if not
        with engine.begin() as conn:
            admin_check = conn.execute(
                text("SELECT id, role FROM users WHERE username = :username"),
                {"username": settings.DEFAULT_ADMIN_USER},
            ).fetchone()
            # Create the admin user if it doesn't exist
            if not admin_check:
                conn.execute(
                    text("INSERT INTO users (username, password_hash, role) VALUES (:username, :hash, 'admin')"),
                    {
                        "username": settings.DEFAULT_ADMIN_USER,
                        "hash": get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                    },
                )
            elif admin_check._mapping["role"] != "admin":
                # Ensure the user has the admin role
                conn.execute(
                    text("UPDATE users SET role = 'admin' WHERE username = :username"),
                    {"username": settings.DEFAULT_ADMIN_USER},
                )
    except Exception as e:
        logger.error("Schema init failed: %s", e)
    
    # Schedule the retraining job to run daily at 2:00 AM
    scheduler.add_job(scheduled_retraining_job, "cron", hour=2, minute=0)
    scheduler.start()
    yield
    scheduler.shutdown()


# FastAPI application instance
app = FastAPI(title="PortSync API", version="1.0.0", lifespan=lifespan)


# Middleware for logging requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    # Call the next middleware or route handler
    try:
        response = await call_next(request)
        # Calculate the process time
        process_time = time.time() - start_time
        # Log the request and response
        logger.info("%s %s - %s - %.4fs", request.method, request.url.path, response.status_code, process_time)
        return response
    except Exception as e:
        process_time = time.time() - start_time
        # Log the error
        logger.error(
            "Unhandled Exception on %s %s - %.4fs: %s",
            request.method,
            request.url.path,
            process_time,
            str(e),
            exc_info=True,
        )
        return JSONResponse(status_code=500, content={"error": "Internal server error. Please try again later."})


# Middleware to add CORS headers to the response
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Include routers
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(analytics_router)
app.include_router(model_router)
app.include_router(config_router)
app.include_router(vessel_router)
