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
    return retraining_config.get()

# update retraining configuration
@router.patch("/retraining")
# only admin can access this endpoint
def update_retraining_config(threshold: int, admin: dict = Depends(require_admin)):
    logger.info(f"Updating retraining threshold to {threshold}")
    return retraining_config.update(threshold=threshold)
