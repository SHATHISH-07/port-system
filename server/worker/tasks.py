"""
Celery Tasks
------------
Background job tasks for PortSync.

Available tasks:
  - retrain_model_task     : Trigger ML model retraining
  - process_ingestion_task : Process a pending ingestion job (future use)
"""
import logging
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from worker.celery_app import celery_app

logger = logging.getLogger("port_system")


@celery_app.task(
    bind=True,
    name="worker.tasks.retrain_model_task",
    max_retries=3,
    default_retry_delay=60,
)
def retrain_model_task(self, config_overrides: dict = None):
    """
    Celery task to retrain the ML model.
    Wraps the existing train_stay_model pipeline.

    Args:
        config_overrides: optional dict with min_hours, max_hours, etc.
    """
    try:
        logger.info(f"[Celery] Retraining task started (config={config_overrides})")

        from db.queries import load_from_db
        from models.stay_model import train_stay_model
        from db.training_metadata import record_training_metadata

        df = load_from_db("history", full_load=True)
        if df.empty:
            logger.warning("[Celery] No history data found — retraining aborted")
            return {"status": "skipped", "reason": "no_history_data"}

        train_stay_model(df, config=config_overrides or {})

        record_training_metadata(
            dataset_size=len(df),
            data_source="celery_task",
            training_type="threshold" if not config_overrides else "manual",
        )

        logger.info(f"[Celery] Retraining completed — {len(df)} records")
        return {"status": "completed", "records": len(df)}

    except Exception as exc:
        logger.error(f"[Celery] Retraining failed: {exc}", exc_info=True)
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    name="worker.tasks.process_ingestion_task",
    max_retries=2,
    default_retry_delay=30,
)
def process_ingestion_task(self, job_id: int):
    """
    Process a pending ingestion job by job_id.
    Reserved for async ingestion flows where the frontend needs to poll for status.
    """
    try:
        logger.info(f"[Celery] Processing ingestion job_id={job_id}")
        # Future: implement async ingestion processing here
        return {"status": "processed", "job_id": job_id}
    except Exception as exc:
        logger.error(f"[Celery] Ingestion job {job_id} failed: {exc}", exc_info=True)
        raise self.retry(exc=exc)
