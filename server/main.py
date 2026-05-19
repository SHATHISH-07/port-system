from __future__ import annotations

import logging
import time
import os
import json
from datetime import datetime
from contextlib import asynccontextmanager
from starlette.concurrency import iterate_in_threadpool

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text

from auth.utils import get_password_hash
from config import settings
from db.connection import get_engine
from db.queries import (
    init_auth_schema,
    init_simplified_schema,
    init_training_metadata_schema,
)
from routes.auth_routes   import router as auth_router
from routes.config_routes import router as config_router
from routes.ingest_routes import router as ingest_router
from routes.model_routes  import router as model_router
from routes.vessel_routes import router as vessel_router
from routes.crane_routes  import router as crane_router
from routes.user_routes   import router as user_router
from routes.system_routes import router as system_router
from routes.stowage_routes import router as stowage_router
from services.retraining_service import scheduled_retraining_job


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("port_system")

scheduler = AsyncIOScheduler()


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()

    try:
        with engine.begin() as conn:
            # Enable pgcrypto so gen_random_uuid() works for UUID PKs
            try:
                conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'))
                logger.info("[DB] pgcrypto extension ensured")
            except Exception as ext_err:
                logger.warning("[DB] pgcrypto extension skipped: %s", ext_err)

        # Schema initialisation order matters:
        # 1. Training metadata (model_versions references feature_configs)
        # 2. Auth (users, audit_logs, operational_requests)
        # 3. Simplified (ingestion_logs, rejection_logs, yard discovery)
        init_training_metadata_schema(engine)
        init_auth_schema(engine)
        init_simplified_schema(engine)

        # Ensure default admin user exists
        with engine.begin() as conn:
            admin_row = conn.execute(
                text("SELECT id, role FROM users WHERE username = :u"),
                {"u": settings.DEFAULT_ADMIN_USER},
            ).fetchone()

            if not admin_row:
                conn.execute(
                    text("""
                        INSERT INTO users (username, password_hash, role)
                        VALUES (:u, :h, 'admin')
                    """),
                    {
                        "u": settings.DEFAULT_ADMIN_USER,
                        "h": get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                    },
                )
                logger.info("[Auth] Default admin user created: %s", settings.DEFAULT_ADMIN_USER)
            elif admin_row._mapping["role"] != "admin":
                conn.execute(
                    text("UPDATE users SET role = 'admin' WHERE username = :u"),
                    {"u": settings.DEFAULT_ADMIN_USER},
                )
                logger.info("[Auth] Default admin role corrected")

        logger.info("[Startup] Schema initialisation complete")

    except Exception as e:
        logger.error("[Startup] Schema init failed: %s", e)

    # Schedule nightly retrain at 02:00
    scheduler.add_job(scheduled_retraining_job, "cron", hour=2, minute=0)
    scheduler.start()
    logger.info("[Scheduler] APScheduler started — nightly retrain at 02:00")

    yield

    scheduler.shutdown()
    logger.info("[Shutdown] APScheduler stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PortSync API",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_LOG_DIR = os.path.join(os.path.dirname(__file__), "response_logs")

async def write_global_response_log(request: Request, response_body: bytes, status_code: int):
    try:
        path_str = request.url.path.strip("/")
        if not path_str:
            return
        
        # Translate e.g. "stowage/history/analysis" -> "stowage_history_analysis"
        endpoint_name = path_str.replace("/", "_").replace("-", "_")
        
        # Skip docs, redoc, openapi, and favicon
        if endpoint_name.startswith(("docs", "redoc", "openapi", "favicon", "static")):
            return
            
        target_dir = os.path.join(_LOG_DIR, endpoint_name)
        os.makedirs(target_dir, exist_ok=True)
        
        # Get query params
        query_input = dict(request.query_params)
        
        # Get body if application/json
        body_input = {}
        content_type = request.headers.get("content-type", "").lower()
        if "application/json" in content_type:
            try:
                body_bytes = await request.body()
                if body_bytes:
                    body_input = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                pass
                
        input_data = {**query_input, **body_input}
        
        try:
            response_data = json.loads(response_body.decode("utf-8"))
        except Exception:
            response_data = {"raw_response": response_body.decode("utf-8", errors="ignore")}
            
        # Stowage visualization specific filename override:
        if endpoint_name == "stowage_visualization":
            visit_id = input_data.get("visitId") or input_data.get("visit_id")
            filename = "stowage_visualization_historical.json" if visit_id else "stowage_visualization_current.json"
        else:
            filename = f"{endpoint_name}.json"
            
        log_entry = {
            "endpoint": endpoint_name,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "input": input_data,
            "status_code": status_code,
            "response": response_data,
        }
        
        log_path = os.path.join(target_dir, filename)
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(log_entry, f, indent=2, default=str)
            
    except Exception as e:
        logger.warning("Global response logging failed for %s: %s", request.url.path, e)


# ── Request logging middleware ────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    try:
        response     = await call_next(request)
        elapsed      = time.time() - start
        logger.info(
            "%s %s -> %s  (%.3fs)",
            request.method, request.url.path, response.status_code, elapsed,
        )
        
        if response.status_code == 200:
            # Capture response body
            response_body = b""
            async for chunk in response.body_iterator:
                response_body += chunk
            # Recreate iterator so the client can consume it
            response.body_iterator = iterate_in_threadpool(iter([response_body]))
            
            # Log response in separate subfolder
            await write_global_response_log(request, response_body, response.status_code)

        return response
    except Exception as exc:
        elapsed = time.time() - start
        logger.error(
            "Unhandled exception  %s %s  (%.3fs): %s",
            request.method, request.url.path, elapsed, exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error. Please try again later."},
        )


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(system_router)
app.include_router(ingest_router)
app.include_router(crane_router)
app.include_router(model_router)
app.include_router(config_router)
app.include_router(vessel_router)
app.include_router(stowage_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "version": "2.0.0"}