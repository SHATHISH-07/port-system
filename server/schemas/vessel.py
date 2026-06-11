# cspell:disable
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict

class HeatmapRequest(BaseModel):
    unit_ids: List[str]
    yard_id: Optional[str] = None
    vessel_id: Optional[str] = None
    load_moves: Optional[int] = None
    discharge_moves: Optional[int] = None

class DiscoverServicesRequest(BaseModel):
    unit_ids: List[str]
    yard_id: Optional[str] = None

class VesselAnalysisRequest(BaseModel):
    vessel_id: str
    load_moves: Optional[int] = None
    discharge_moves: Optional[int] = None
    crane_count: Optional[int] = None
    equipment_breakdown: Optional[Dict[str, int]] = None

class VesselAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra='allow')
    
class YardSummaryResponse(BaseModel):
    yard_filter: Optional[str] = None
    counts: Dict[str, int]
    yards: List[Dict[str, Any]]
    recent_ingestions: List[Dict[str, Any]]

class PortStayPredictionRequest(BaseModel):
    vessel_id: str
    load_moves: int

class PortStayPredictionResponse(BaseModel):
    vessel_id: str
    total_moves: int
    historical_avg_cranes: int
    historical_avg_mph: float
    recommended_cranes: int
    predicted_port_stay_hours: float
