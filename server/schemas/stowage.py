from typing import List, Optional
from pydantic import BaseModel, Field


class CurrentPlanningRequest(BaseModel):
    vesselId: str
    yardId: Optional[str] = None
    containerIds: List[str] = Field(default_factory=list)


class HistorySummary(BaseModel):
    totalContainers: int
    heavyCount: int
    lightCount: int
    mediumCount: int


class EquipmentClassDistribution(BaseModel):
    equipmentClass: str
    count: int
    percentage: float


class DischargePortGrouping(BaseModel):
    port: str
    count: int
    percentage: float


class WeightBandDistribution(BaseModel):
    band: str
    count: int
    percentage: float


class WeightDistribution(BaseModel):
    aboveDeck: List[WeightBandDistribution]
    belowDeck: List[WeightBandDistribution]


class HistoricalVisit(BaseModel):
    visitId: str
    containerCount: int
    moveCompleteTime: Optional[str] = None


class HistoryAnalysisResponse(BaseModel):
    summary: HistorySummary
    equipmentClassDistribution: List[EquipmentClassDistribution]
    dischargePortGrouping: List[DischargePortGrouping]
    weightDistribution: WeightDistribution
    historicalVisits: List[HistoricalVisit]


class PlanningSummary(BaseModel):
    totalRequested: int
    resolvedCount: int
    unresolvedCount: int


class Recommendation(BaseModel):
    unitId: str
    actualOutboundCarrierVisitId: Optional[str] = None
    outboundService: Optional[str] = None
    equipmentClass: Optional[str] = None
    weightCategory: str
    portOfDischarge: Optional[str] = None
    currentYardBlock: Optional[str] = None
    currentSlotPosition: Optional[str] = None
    recommendedDeck: str
    recommendedTier: Optional[str] = None
    loadingPriority: int
    reshuffleRisk: str
    recommendedReason: str


class MapPosition(BaseModel):
    unitId: str
    currentYardBlock: Optional[str] = None
    currentSlotPosition: Optional[str] = None
    weightCategory: str
    loadingPriority: int
    recommendedDeck: str
    recommendedTier: Optional[str] = None
    reshuffleRisk: str
    outboundService: Optional[str] = None
    actualOutboundCarrierVisitId: Optional[str] = None


class MapGroup(BaseModel):
    groupId: str
    groupType: str
    containerCount: int
    positions: List[MapPosition]


class UnifiedMap(BaseModel):
    groups: List[MapGroup]


class CurrentPlanningResponse(BaseModel):
    vesselId: str
    outboundService: str
    visitId: Optional[str] = None
    summary: PlanningSummary
    recommendations: List[Recommendation]
    map: UnifiedMap