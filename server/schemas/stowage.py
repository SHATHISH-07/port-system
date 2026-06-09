# cspell:disable
from typing import List, Optional
from pydantic import BaseModel, Field

class CurrentPlanningRequest(BaseModel):
    vesselId: str
    yardId: Optional[str] = None
    containerIds: List[str] = Field(default_factory=list)

# History Analysis Schemas
class HistorySummary(BaseModel):
    totalContainers: int
    heavyCount: int
    lightCount: int
    mediumCount: int
    aboveDeckCount: int = 0
    belowDeckCount: int = 0

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
    containerIds: List[str] = Field(default_factory=list)

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

# Crane Metrics (for history/analysis response)
class BlockReshuffleCount(BaseModel):
    block: str
    count: int
    percentage: float   # of total restow moves
class CraneMetrics(BaseModel):
    totalMoves: int
    loadMoves: int
    dischargeMoves: int
    restowMoves: int
    reshuffleRate: float          # restowMoves / (load + discharge) * 100
    dualCycleCount: int
    dualCycleRate: float          # dualCycleCount / productive * 100
    avgMoveGapMinutes: float      # median gap between consecutive moves per crane
    reshuffleByBlock: List[BlockReshuffleCount]

class DischargeSequenceEntry(BaseModel):
    port: str
    dischargeOrder: int

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
    dischargeSequence: List[DischargeSequenceEntry] = Field(default_factory=list)
    craneMetrics: Optional[CraneMetrics] = None   # None when crane data unavailable

# Current Planning Schemas
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
    recommendedBay: Optional[str] = None
    recommendedRow: Optional[str] = None
    recommendedTier: Optional[str] = None
    loadingPriority: int
    reshuffleRisk: str
    recommendedReason: str
    dischargeOrder: Optional[int] = None

class DischargePortCount(BaseModel):
    port: str
    count: int

class YardGroupSummary(BaseModel):
    block: str
    terminal: str
    berthProximity: str
    containerCount: int
    inYardCount: int
    loadedCount: int
    heavyCount: int
    mediumCount: int
    lightCount: int
    avgWeightKg: float
    dominantDischargePort: str
    dischargePortGroups: List[DischargePortCount]
    reshuffleRisk: str
    containerIds: List[str]

class DischargePortStrategy(BaseModel):
    port: str
    dischargeOrder: int
    containerCount: int
    heavyCount: int
    mediumCount: int
    lightCount: int
    inYardCount: int
    loadedCount: int
    currentBlocks: List[str]
    recommendedBlocks: List[str]
    concentrationScore: float
    containerIds: List[str]

class CurrentPlanningResponse(BaseModel):
    vesselId: str
    outboundService: str
    visitId: Optional[str] = None
    terminal: str
    summary: PlanningSummary
    recommendations: List[Recommendation]
    dischargePortGrouping: List[DischargePortGrouping] = Field(default_factory=list)
    yardBlockSummary: List[YardGroupSummary]
    dischargePortStrategy: List[DischargePortStrategy]
    reshuffleStats: dict
    dischargeSequence: List[DischargeSequenceEntry] = Field(default_factory=list)
    strategyInsights: List[str]
    equipmentClassDistribution: List[EquipmentClassDistribution] = Field(default_factory=list)
    housekeepingPlan: Optional['PreConsolidationResponse'] = None

# Visualization Schemas
class MapPosition(BaseModel):
    unitId: str
    status: str                             # "LOADED" | "IN_YARD"
    weightCategory: str
    weightKg: Optional[float] = None
    freightKind: Optional[str] = None
    equipmentClass: Optional[str] = None
    containerLength: Optional[str] = None
    loadingPriority: int
    reshuffleRisk: str
    outboundService: Optional[str] = None
    actualOutboundCarrierVisitId: Optional[str] = None
    portOfDischarge: Optional[str] = None

    # Yard coordinates (where it is/was in the yard)
    yardBlock: Optional[str] = None
    yardRow: Optional[str] = None
    yardCol: Optional[str] = None
    yardTier: Optional[str] = None
    yardSlotRaw: Optional[str] = None

    # Vessel coordinates (populated only when status == "LOADED")
    vesselBay: Optional[int] = None
    vesselRow: Optional[int] = None
    vesselTier: Optional[int] = None
    vesselDeck: Optional[str] = None        # "ABOVE_DECK" | "BELOW_DECK"
    vesselVisitId: Optional[str] = None

    # Keep legacy fields so existing clients don't break
    currentYardBlock: Optional[str] = None
    currentSlotPosition: Optional[str] = None
    recommendedDeck: Optional[str] = None
    recommendedTier: Optional[str] = None
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

class YardBlockSummary(BaseModel):
    blockId: str                    # e.g. "1A", "F"
    zone: Optional[str] = None      # CWIT zone digit e.g. "1", None for PEB
    blockLetter: Optional[str] = None  # e.g. "A"
    terminal: str
    berthProximity: str
    colLabels: List[str]            # sorted unique columns seen in this block
    tierMax: int                    # max tier observed
    containerCount: int
    loadedToVessel: int
    inYard: int
    dominantPod: Optional[str] = None
    podGroups: List[DischargePortCount]
    weightProfile: dict             # {"HEAVY": N, "MEDIUM": N, "LIGHT": N}
    avgReshuffleRisk: str

class YardGrid(BaseModel):
    blocks: List[YardBlockSummary]
    loadedTotal: int
    inYardTotal: int

class StowageVisualizationResponse(BaseModel):
    mode: str  # "CURRENT" or "HISTORICAL"
    vesselId: str
    yardId: Optional[str] = None
    visitId: Optional[str] = None
    map: UnifiedMap                         # keep existing for compatibility
    yardGrid: Optional[YardGrid] = None     # NEW
    summary: VisualizationSummary
    dischargeSequence: List[DischargeSequenceEntry] = Field(default_factory=list)


# ─── Pre-Consolidation / Housekeeping Schemas ────────────────────────────────

class HousekeepingMove(BaseModel):
    unitId: str
    fromPosition: str
    block: str
    bay: str
    row: str
    tier: str
    weightBand: str
    portOfDischarge: Optional[str] = None
    dischargeOrder: Optional[int] = None
    reason: str                  # e.g. "Weight Inversion", "Discharge Inversion"
    priority: str                # "HIGH" | "MEDIUM" | "LOW"
    priorityScore: int           # raw numeric score for sorting

class StackViolationSummary(BaseModel):
    block: str
    bay: str
    row: str
    totalContainers: int
    weightInversions: int
    dischargeInversions: int
    combinedViolations: int

class PreConsolidationSummary(BaseModel):
    totalContainersAnalyzed: int
    totalStacksAnalyzed: int
    totalMovesRequired: int
    highPriorityMoves: int
    mediumPriorityMoves: int
    lowPriorityMoves: int
    weightInversionsFound: int
    dischargeInversionsFound: int

class PreConsolidationResponse(BaseModel):
    vesselId: str
    yardId: Optional[str] = None
    summary: PreConsolidationSummary
    moves: List[HousekeepingMove]
    stackViolations: List[StackViolationSummary]