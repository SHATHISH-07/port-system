import asyncio
import logging
import os
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text

from db.connection import get_engine
from db.training_metadata import get_latest_training_metadata, save_training_metadata
from db.queries import load_from_db
from models.retraining_config import retraining_config
from models.stay_model import train_stay_model
from models.training_status import training_status

logger = logging.getLogger("port_system")


def get_history_count() -> int:
    """
    Count records in history_containers safely.
    Never raises.
    """
    try:
        engine = get_engine()
        inspector = sa_inspect(engine)
        if not inspector.has_table("history_containers"):
            return 0

        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM history_containers"))
            return int(result.scalar() or 0)
    except Exception as e:
        logger.error("Error getting history count: %s", e)
        return 0


def get_metadata() -> dict:
    """
    Return latest training metadata in a backward-compatible shape.

    The DB schema stores `dataset_size`, not `last_trained_dataset_size`.
    This function maps it safely for older callers.
    """
    try:
        row = get_latest_training_metadata()
        if not row:
            return {
                "last_trained_dataset_size": 0,
                "dataset_size": 0,
                "last_trained_timestamp": None,
                "data_source": None,
                "training_type": None,
                "status": None,
                "notes": None,
            }

        dataset_size = int(row.get("dataset_size") or row.get("last_trained_dataset_size") or 0)
        ts = row.get("last_trained_timestamp")
        if hasattr(ts, "isoformat"):
            ts = ts.isoformat()

        return {
            "last_trained_dataset_size": dataset_size,
            "dataset_size": dataset_size,
            "last_trained_timestamp": ts,
            "data_source": row.get("data_source"),
            "training_type": row.get("training_type"),
            "status": row.get("status"),
            "notes": row.get("notes"),
        }
    except Exception as e:
        logger.error("Error reading training metadata: %s", e)
        return {
            "last_trained_dataset_size": 0,
            "dataset_size": 0,
            "last_trained_timestamp": None,
            "data_source": None,
            "training_type": None,
            "status": None,
            "notes": None,
        }


def update_metadata(size: int, data_source: str = "db", training_type: str = "manual"):
    """
    Save a completed training run.
    """
    try:
        save_training_metadata(
            dataset_size=int(size or 0),
            data_source=data_source,
            training_type=training_type,
            status="completed",
        )
        logger.info(
            "Training metadata saved — size=%s, source=%s, type=%s",
            size,
            data_source,
            training_type,
        )
    except Exception as e:
        logger.error("Failed to save training metadata: %s", e)


def background_train_and_update(df, config: dict = None):
    """
    Background training worker used by FastAPI background tasks.
    """
    current_status = training_status.get()
    data_source = current_status.get("data_source", "db")
    training_type = current_status.get("training_type", "manual")

    try:
        train_stay_model(df, config=config)
        if training_status.get().get("status") == "completed":
            update_metadata(len(df), data_source=data_source, training_type=training_type)
    except Exception as e:
        training_status.set("failed", str(e))
        logger.error("Background training failed: %s", e)
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


def trigger_retraining_celery(config_overrides: dict = None) -> dict:
    """
    Send retraining job to Celery queue.
    Falls back cleanly if Celery is disabled or unavailable.
    """
    use_celery = os.getenv("USE_CELERY", "false").lower() == "true"
    if not use_celery:
        return {"status": "skipped", "reason": "celery_disabled"}

    try:
        from worker.tasks import retrain_model_task

        task = retrain_model_task.delay(config_overrides or {})
        logger.info("[Celery] Retraining task queued: task_id=%s", task.id)
        return {"status": "queued", "task_id": task.id}
    except Exception as e:
        logger.warning("[Celery] Could not queue retraining task: %s", e)
        return {"status": "celery_unavailable", "error": str(e)}


def _should_trigger(current_count: int, last_size: int) -> bool:
    threshold = int(getattr(retraining_config, "threshold", 1000))
    difference = max(current_count - last_size, 0)
    return difference >= threshold or last_size == 0


def check_and_trigger_retraining(background_tasks: BackgroundTasks):
    """
    Called after ingestion.

    Important:
    This function must never fail ingestion. Any retraining error is logged
    and swallowed so the upload endpoint can still return success.
    """
    try:
        current_count = get_history_count()
        if current_count == 0:
            return

        metadata = get_metadata()
        last_size = int(metadata.get("last_trained_dataset_size") or 0)

        if not _should_trigger(current_count, last_size):
            logger.info(
                "Retraining not triggered: current=%s last=%s threshold=%s",
                current_count,
                last_size,
                getattr(retraining_config, "threshold", 1000),
            )
            return

        logger.info(
            "Retraining triggered: current=%s last=%s threshold=%s",
            current_count,
            last_size,
            getattr(retraining_config, "threshold", 1000),
        )

        celery_result = trigger_retraining_celery()
        if celery_result.get("status") == "queued":
            return

        # Fallback: FastAPI background task
        df = load_from_db("history")
        if df.empty:
            logger.warning("Retraining skipped — no history data loaded")
            return

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
        logger.error("Failed in check_and_trigger_retraining: %s", e)


async def scheduled_retraining_job():
    """
    Nightly scheduled job (APScheduler cron at 02:00).
    """
    try:
        if training_status.get().get("status") == "training":
            logger.info("Nightly job skipped — training already in progress.")
            return

        current_count = get_history_count()
        if current_count == 0:
            return

        metadata = get_metadata()
        last_size = int(metadata.get("last_trained_dataset_size") or 0)

        if not _should_trigger(current_count, last_size):
            return

        logger.info("Nightly Cron: Retraining triggered for %s new records.", current_count - last_size)

        df = await asyncio.to_thread(load_from_db, "history")
        if df.empty:
            return

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
        logger.error("Error in nightly retraining job: %s", e)