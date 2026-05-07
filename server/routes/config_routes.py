import logging
from fastapi import APIRouter, Depends
from auth.dependencies import require_admin
from models.retraining_config import retraining_config

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/config", tags=["Configuration"])

@router.get("/retraining")
def get_retraining_config(admin: dict = Depends(require_admin)):
    """Return the current dynamic retraining configuration."""
    return retraining_config.get()

@router.patch("/retraining")
def update_retraining_config(threshold: int, admin: dict = Depends(require_admin)):
    """Update the dynamic retraining configuration."""
    logger.info(f"Updating retraining threshold to {threshold}")
    return retraining_config.update(threshold=threshold)
