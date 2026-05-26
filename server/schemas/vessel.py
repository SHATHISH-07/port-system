from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

class HeatmapRequest(BaseModel):
    vessel_id: str
    unit_ids: List[str]
    yard_id: Optional[str] = None

class VesselAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra='allow')
    
class YardSummaryResponse(BaseModel):
    yard_filter: Optional[str] = None
    counts: Dict[str, int]
    yards: List[Dict[str, Any]]
    recent_ingestions: List[Dict[str, Any]]
