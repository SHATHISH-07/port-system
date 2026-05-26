from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class ModelTrainingResponse(BaseModel):
    message: str
    status: str
    records: int

class ModelVersionsResponse(BaseModel):
    versions: List[Dict[str, Any]]
    training_history: List[Dict[str, Any]]

class PromoteVersionResponse(BaseModel):
    status: str
    promoted_version_id: str

class ModelStatusResponse(BaseModel):
    training: Dict[str, Any]
    last_trained: Optional[Dict[str, Any]] = None
    active_version: Optional[Dict[str, Any]] = None
