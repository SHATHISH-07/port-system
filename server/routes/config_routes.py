import logging
from fastapi import APIRouter, Depends
from auth.dependencies import require_admin
from models.retraining_config import retraining_config

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/config", tags=["Configuration"])

# get retraining configuration
@router.get("/retraining")
# only admin can access this endpoint
def get_retraining_config(admin: dict = Depends(require_admin)):
    data = retraining_config.get()
    
    from db.connection import get_engine
    from sqlalchemy import text
    engine = get_engine()
    
    history_count = 0
    with engine.connect() as conn:
        try:
            res = conn.execute(text("SELECT relname FROM pg_class WHERE relkind IN ('p','r') AND relname LIKE '%_history_containers' AND oid NOT IN (SELECT inhrelid FROM pg_inherits)")).fetchall()
            for r in res:
                history_count += conn.execute(text(f"SELECT COUNT(*) FROM {r[0]}")).scalar()
        except Exception:
            pass

        try:
            last_training = conn.execute(text("SELECT model_version, records_at_training, created_at FROM training_metadata ORDER BY created_at DESC LIMIT 1")).fetchone()
        except Exception:
            last_training = None

    data["history_record_count"] = history_count
    
    if last_training:
        data["last_trained_record_count"] = last_training[1] or 0
        data["last_trained_timestamp"] = last_training[2].isoformat() if last_training[2] else None
        data["new_records_since_training"] = max(0, history_count - data["last_trained_record_count"])
    else:
        data["last_trained_record_count"] = 0
        data["last_trained_timestamp"] = None
        data["new_records_since_training"] = history_count

    return data

from pydantic import BaseModel

class ConfigUpdate(BaseModel):
    retrain_threshold: int

# update retraining configuration
@router.patch("/retraining")
# only admin can access this endpoint
def update_retraining_config(payload: ConfigUpdate, admin: dict = Depends(require_admin)):
    logger.info(f"Updating retraining threshold to {payload.retrain_threshold}")
    new_config = retraining_config.update(threshold=payload.retrain_threshold)
    return {"config": new_config}
