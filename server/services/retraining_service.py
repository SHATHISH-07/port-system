from __future__ import annotations

import logging
from datetime import datetime, timezone

from config import settings
from db.training_metadata import (
    get_latest_training_metadata,
    save_training_metadata,
)
from models.training_status import training_status

logger = logging.getLogger("port_system")


# ─────────────────────────────────────────────────────────────────────────────
# Core background training task
# ─────────────────────────────────────────────────────────────────────────────

def background_train_and_update(df, config: dict = None) -> None:
    """
    Run model training synchronously (called from a background task).
    Saves training metadata on completion or failure.
    """
    import pandas as pd
    from models.stay_model import train_stay_model

    if df is None or (hasattr(df, "empty") and df.empty):
        training_status.set("failed", "No data provided for training")
        logger.error("[Retraining] background_train_and_update called with empty DataFrame")
        return

    # Only keep rows that have the essential training column
    if "actual_outbound_carrier_visit_id" not in df.columns:
        training_status.set(
            "failed",
            "Missing column: actual_outbound_carrier_visit_id",
        )
        logger.error("[Retraining] DataFrame missing actual_outbound_carrier_visit_id")
        return

    # Drop rows missing the visit ID (can't group without it)
    df = df.dropna(subset=["actual_outbound_carrier_visit_id"]).copy()
    n_rows = len(df)

    if n_rows == 0:
        training_status.set("failed", "All rows missing actual_outbound_carrier_visit_id")
        return

    logger.info("[Retraining] Starting training on %d rows", n_rows)

    try:
        train_stay_model(df, config=config)

        # Persist metadata only when training succeeded
        if training_status.get().get("status") == "completed":
            save_training_metadata(
                dataset_size=n_rows,
                data_source=training_status.get().get("data_source", "db"),
                training_type=training_status.get().get("training_type", "auto"),
                status="completed",
                notes=f"Trained at {datetime.now(timezone.utc).isoformat()}",
            )
            logger.info("[Retraining] Training metadata saved. samples=%d", n_rows)
        else:
            # training_status already set to "failed" inside train_stay_model
            save_training_metadata(
                dataset_size=n_rows,
                data_source="db",
                training_type="auto",
                status="failed",
                notes=training_status.get().get("message", "unknown error"),
            )

    except Exception as exc:
        msg = str(exc)
        training_status.set("failed", msg)
        logger.error("[Retraining] Unexpected error during training: %s", msg)
        try:
            save_training_metadata(
                dataset_size=n_rows,
                data_source="db",
                training_type="auto",
                status="failed",
                notes=msg,
            )
        except Exception as meta_exc:
            logger.warning("[Retraining] Could not save failure metadata: %s", meta_exc)


# ─────────────────────────────────────────────────────────────────────────────
# Auto-retrain trigger  (called after each successful ingestion)
# ─────────────────────────────────────────────────────────────────────────────

def check_and_trigger_retraining(background_tasks) -> None:
    """
    Compare the number of history rows ingested since the last training run
    against the configured threshold.  If exceeded, queue a background retrain.
    """
    try:
        from db.connection import get_engine
        from sqlalchemy import text

        engine = get_engine()

        # Count total history rows across all yard tables
        total_history_rows = 0
        with engine.connect() as conn:
            # Discover all *_history_containers_core tables
            tbls = conn.execute(text("""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r', 'p')
                  AND relname LIKE '%_history_containers_core'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                ORDER BY relname
            """)).fetchall()

            for (tbl,) in tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    total_history_rows += (n or 0)
                except Exception:
                    pass

        # Compare against last training run size
        latest = get_latest_training_metadata()
        last_trained_size = latest.get("dataset_size", 0) if latest else 0
        new_records = max(total_history_rows - last_trained_size, 0)

        threshold = settings.RETRAIN_THRESHOLD_NEW_RECORDS
        logger.info(
            "[Retraining] history_rows=%d  last_trained=%d  new=%d  threshold=%d",
            total_history_rows, last_trained_size, new_records, threshold,
        )

        if new_records >= threshold:
            current_status = training_status.get().get("status")
            if current_status == "training":
                logger.info("[Retraining] Skipping — training already in progress")
                return

            logger.info(
                "[Retraining] Threshold met (%d >= %d). Queuing retrain …",
                new_records, threshold,
            )
            training_status.set(
                status="training",
                message="Auto-retraining triggered by ingestion threshold",
                records_count=total_history_rows,
                data_source="db",
                training_type="auto",
            )
            from db.queries import load_from_db
            df = load_from_db("history", full_load=True)

            if df.empty:
                training_status.set("failed", "No history data found for auto-retrain")
                return

            config = training_status.get_last_config()
            background_tasks.add_task(background_train_and_update, df, config)

    except Exception as exc:
        logger.error("[Retraining] check_and_trigger_retraining error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Scheduled nightly retrain  (called by APScheduler at 02:00)
# ─────────────────────────────────────────────────────────────────────────────

async def scheduled_retraining_job() -> None:
    """
    Nightly cron-style retrain.  Loads all history data and retrains if there
    are enough rows, without requiring the ingestion threshold to be met.
    """
    logger.info("[Scheduler] Nightly retraining job started")

    current_status = training_status.get().get("status")
    if current_status == "training":
        logger.info("[Scheduler] Skipping — training already in progress")
        return

    try:
        from db.queries import load_from_db
        df = load_from_db("history", full_load=True)

        if df.empty:
            logger.warning("[Scheduler] No history data found — skipping retrain")
            return

        n_rows = len(df)
        logger.info("[Scheduler] Loaded %d history rows for scheduled retrain", n_rows)

        if n_rows < settings.MIN_VISIT_ROWS * 10:
            logger.warning(
                "[Scheduler] Too few rows (%d) — skipping retrain", n_rows
            )
            return

        training_status.set(
            status="training",
            message="Scheduled nightly retraining started",
            records_count=n_rows,
            data_source="db",
            training_type="scheduled",
        )

        config = training_status.get_last_config()
        background_train_and_update(df, config)

    except Exception as exc:
        logger.error("[Scheduler] scheduled_retraining_job error: %s", exc)
        training_status.set("failed", f"Scheduled retrain error: {exc}")