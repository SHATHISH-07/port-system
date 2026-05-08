import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text

from auth.dependencies import get_current_user  # noqa: F401
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    try:
        init_training_metadata_schema(engine)
        init_auth_schema(engine)
        init_simplified_schema(engine)

        with engine.begin() as conn:
            admin_check = conn.execute(
                text("SELECT id FROM users WHERE username = :username"),
                {"username": settings.DEFAULT_ADMIN_USER},
            ).fetchone()

            if not admin_check:
                conn.execute(
                    text("INSERT INTO users (username, password_hash, role) VALUES (:username, :hash, 'admin')"),
                    {
                        "username": settings.DEFAULT_ADMIN_USER,
                        "hash": get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                    },
                )
    except Exception as e:
        logger.error("Schema init failed: %s", e)

    scheduler.add_job(scheduled_retraining_job, "cron", hour=2, minute=0)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="PortSync API", version="3.0.0", lifespan=lifespan)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info("%s %s - %s - %.4fs", request.method, request.url.path, response.status_code, process_time)
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(
            "Unhandled Exception on %s %s - %.4fs: %s",
            request.method,
            request.url.path,
            process_time,
            str(e),
            exc_info=True,
        )
        return JSONResponse(status_code=500, content={"error": "Internal server error. Please try again later."})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(analytics_router)
app.include_router(model_router)
app.include_router(config_router)
app.include_router(vessel_router)
