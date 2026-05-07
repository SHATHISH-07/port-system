import logging
from db.connection import get_engine
from sqlalchemy import text
from models.stay_model import train_stay_model
from models.training_status import training_status
from models.retraining_config import retraining_config
from db.queries import load_from_db
from db.training_metadata import (
    save_training_metadata,
    get_latest_training_metadata,
)
from fastapi import BackgroundTasks
import asyncio

logger = logging.getLogger("port_system")


# History record count
def get_history_count() -> int:
    try:
        engine = get_engine()
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(engine)
        if not inspector.has_table("history_containers"):
            return 0
        with engine.connect() as conn:
            result = conn.execute(
                text('SELECT COUNT(*) FROM "history_containers" WHERE deleted_at IS NULL')
            )
            return result.scalar() or 0
    except Exception as e:
        logger.error(f"Error getting history count: {e}")
        return 0


# Metadata helpers (now DB-backed)
def get_metadata() -> dict:
    row = get_latest_training_metadata()
    if not row:
        return {"last_trained_dataset_size": 0, "last_trained_timestamp": None}
    return {
        "last_trained_dataset_size": row["last_trained_dataset_size"],
        "last_trained_timestamp":    row["last_trained_timestamp"].isoformat() if row["last_trained_timestamp"] else None,
    }


# Update metadata
def update_metadata(size: int, data_source: str = "db", training_type: str = "manual"):
    try:
        save_training_metadata(
            dataset_size=size,
            data_source=data_source,
            training_type=training_type,
            status="completed",
        )
        logger.info(f"Training metadata saved — size={size}, source={data_source}, type={training_type}")
    except Exception as e:
        logger.error(f"Failed to save training metadata: {e}")


# Background training
def background_train_and_update(df, config: dict = None):
    current_status = training_status.get()
    data_source   = current_status.get("data_source", "db")
    training_type = current_status.get("training_type", "manual")
    try:
        train_stay_model(df, config=config)
        if training_status.get()["status"] == "completed":
            update_metadata(len(df), data_source=data_source, training_type=training_type)
    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"Background training failed: {e}")
        try:
            save_training_metadata(
                dataset_size=len(df),
                data_source=data_source,
                training_type=training_type,
                status="error",
                notes=str(e),
            )
        except Exception:
            pass


# Celery-based retraining trigger (with APScheduler fallback)
def trigger_retraining_celery(config_overrides: dict = None) -> dict:
    """
    Send retraining job to Celery queue.
    Falls back silently if Redis / Celery is not available.
    Returns task info dict.
    """
    import os
    use_celery = os.getenv("USE_CELERY", "false").lower() == "true"
    if not use_celery:
        return {"status": "skipped", "reason": "celery_disabled"}
    try:
        from worker.tasks import retrain_model_task
        task = retrain_model_task.delay(config_overrides or {})
        logger.info(f"[Celery] Retraining task queued: task_id={task.id}")
        return {"status": "queued", "task_id": task.id}
    except Exception as e:
        logger.warning(f"[Celery] Could not queue retraining task (Redis may be down): {e}")
        return {"status": "celery_unavailable", "error": str(e)}


# Upload-triggered threshold check (auto-selects Celery or background task)
def check_and_trigger_retraining(background_tasks: BackgroundTasks):
    current_count = get_history_count()
    if current_count == 0:
        return

    metadata  = get_metadata()
    last_size = metadata.get("last_trained_dataset_size", 0)
    difference = current_count - last_size
    threshold  = retraining_config.threshold

    if difference >= threshold or last_size == 0:
        logger.info(f"Retraining triggered: {difference} new records (threshold: {threshold})")

        # Try Celery first
        celery_result = trigger_retraining_celery()
        if celery_result.get("status") == "queued":
            return  # Celery is handling it

        # Fallback: FastAPI background task
        try:
            df = load_from_db("history")
            if not df.empty:
                config = training_status.get_last_config()
                training_status.set(
                    status="training",
                    message="Automated retraining started",
                    records_count=len(df),
                    data_source="db",
                    training_type="automated",
                )
                background_tasks.add_task(background_train_and_update, df, config)
        except Exception as e:
            logger.error(f"Failed to load history for retraining: {e}")


# Nightly scheduled job (APScheduler cron at 02:00)
async def scheduled_retraining_job():
    try:
        if training_status.get().get("status") == "training":
            logger.info("Nightly job skipped — training already in progress.")
            return

        current_count = get_history_count()
        if current_count == 0:
            return

        metadata  = get_metadata()
        last_size = metadata.get("last_trained_dataset_size", 0)
        difference = current_count - last_size
        threshold  = retraining_config.threshold

        if difference >= threshold or last_size == 0:
            logger.info(f"Nightly Cron: Retraining triggered for {difference} new records.")
            df = await asyncio.to_thread(load_from_db, "history")
            if not df.empty:
                config = training_status.get_last_config()
                training_status.set(
                    status="training",
                    message="Automated nightly retraining started",
                    records_count=len(df),
                    data_source="db",
                    training_type="scheduled",
                )
                await asyncio.to_thread(background_train_and_update, df, config)
    except Exception as e:
        logger.error(f"Error in nightly retraining job: {e}")
