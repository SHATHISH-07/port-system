import logging
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from typing import Optional

from models.retraining_config import retraining_config
from services.retraining_service import get_history_count, get_metadata
from db.training_metadata import get_training_metadata_history

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/config", tags=["Config"])


class RetrainingConfigPatch(BaseModel):
    retrain_threshold: Optional[int] = Field(None, ge=1, description="New record count to trigger auto-retraining")


# ─── GET current retraining config + live stats ───────────────────────────────
@router.get("/retraining")
def get_retraining_config():
    """
    Returns the current retraining trigger configuration along with
    live stats (current DB record count vs threshold) — sourced from DB.
    """
    cfg           = retraining_config.get()
    history_count = get_history_count()
    metadata      = get_metadata()
    last_size     = metadata.get("last_trained_dataset_size", 0)
    last_ts       = metadata.get("last_trained_timestamp")

    return {
        **cfg,
        "history_record_count":       history_count,
        "last_trained_record_count":  last_size,
        "new_records_since_training": max(0, history_count - last_size),
        "last_trained_timestamp":     last_ts,
    }


# ─── PATCH retraining config ──────────────────────────────────────────────────
@router.patch("/retraining")
def patch_retraining_config(body: RetrainingConfigPatch):
    """
    Update the retraining trigger threshold at runtime.
    Takes effect immediately — no server restart required.
    """
    updated = retraining_config.update(threshold=body.retrain_threshold)
    logger.info(f"Retraining config updated: threshold={updated['retrain_threshold']}")
    return {"status": "ok", "config": updated}


# ─── GET training history (audit log) ────────────────────────────────────────
@router.get("/training-history")
def get_training_history(limit: int = Query(default=20, ge=1, le=100)):
    """
    Returns the most recent training run records from training_metadata table.
    Each row includes id, dataset_size, timestamp, data_source, training_type,
    status, notes, created_at, updated_at, deleted_at.
    """
    rows = get_training_metadata_history(limit=limit)
    # Serialize datetimes to ISO strings for JSON
    for row in rows:
        for key in ("last_trained_timestamp", "created_at", "updated_at", "deleted_at"):
            if row.get(key) is not None:
                row[key] = row[key].isoformat()
    return {"count": len(rows), "rows": rows}

