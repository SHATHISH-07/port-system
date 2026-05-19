from typing import List, Optional
from pydantic import BaseModel, Field


class CurrentPlanningRequest(BaseModel):
    vesselId: str
    yardId: Optional[str] = None
    containerIds: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# History Analysis Schemas
# ---------------------------------------------------------------------------

class HistorySummary(BaseModel):
    totalContainers: int
    heavyCount: int
    lightCount: int
    mediumCount: int


class FreightKindDistribution(BaseModel):
    freightKind: str
    count: int
    percentage: float


class ContainerSizeDistribution(BaseModel):
    containerSize: str
    count: int
    percentage: float


class SpecialCargoSummary(BaseModel):
    reeferCount: int
    hazardousCount: int
    oogCount: int


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


# NEW – REQ 6.2: equipment class distribution
class EquipmentClassDistribution(BaseModel):
    equipmentClass: str
    count: int
    percentage: float


class HistoricalVisit(BaseModel):
    visitId: str
    containerCount: int
    moveCompleteTime: Optional[str] = None


class HistoryAnalysisResponse(BaseModel):
    summary: HistorySummary
    freightKindDistribution: List[FreightKindDistribution]
    containerSizeDistribution: List[ContainerSizeDistribution]
    specialCargoSummary: SpecialCargoSummary
    dischargePortGrouping: List[DischargePortGrouping]
    weightDistribution: WeightDistribution
    # NEW – REQ 6.2: breakdown of container / equipment classes seen in history
    equipmentClassDistribution: List[EquipmentClassDistribution]
    historicalVisits: List[HistoricalVisit]


# ---------------------------------------------------------------------------
# Current Planning Schemas
# ---------------------------------------------------------------------------

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


class CurrentPlanningResponse(BaseModel):
    vesselId: str
    outboundService: str
    visitId: Optional[str] = None
    summary: PlanningSummary
    recommendations: List[Recommendation]


# ---------------------------------------------------------------------------
# Visualization Schemas
# ---------------------------------------------------------------------------

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
    # Layout metadata
    parsedBay: Optional[str] = None
    parsedRow: Optional[str] = None
    parsedTier: Optional[str] = None
    parsedBlock: Optional[str] = None
    parsedDeck: Optional[str] = None


class MapGroup(BaseModel):
    groupId: str
    groupType: str
    containerCount: int
    positions: List[MapPosition]


class UnifiedMap(BaseModel):
    groups: List[MapGroup]


class VisualizationSummary(BaseModel):
    totalContainers: int
    resolvedCount: int


class StowageVisualizationResponse(BaseModel):
    mode: str  # "CURRENT" or "HISTORICAL"
    vesselId: str
    yardId: Optional[str] = None
    visitId: Optional[str] = None
    map: UnifiedMap
    summary: VisualizationSummary