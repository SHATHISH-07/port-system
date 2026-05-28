
export interface StepData {
  unitId?: string;
  actualOutboundCarrierVisitId?: string;
  recommendedDeck?: string;
  recommendedBay?: string;
  recommendedRow?: string;
  recommendedTier?: number;
  parsedBay?: string;
  parsedRow?: string;
  parsedTier?: string;
  parsedDeck?: string;
  reshuffleRisk?: string;
  weightCategory?: string;
  weightKg?: number;
  portOfDischarge?: string;
  loadingPriority?: number;
  stepIndex?: number;
  freightKind?: string;
  containerLength?: string;
  status?: string;
  outboundService?: string;
  currentSlotPosition?: string;
  currentYardBlock?: string;
  isHazardous?: boolean;
  hazmat?: boolean;
  recommendedReason?: string;
}

export interface VisualizationGroup {
  groupId: string;
  positions?: StepData[];
}

export interface VisualizationData {
  map?: {
    groups?: VisualizationGroup[];
  };
}

export interface OptimizedData {
  dischargeSequence: { port: string }[];
  recommendations: StepData[];
  strategyInsights: string[];
  dischargePortGrouping?: { port: string; count: number; percentage: number }[];
  equipmentClassDistribution?: { equipmentClass: string; count: number; percentage: number }[];
  housekeepingPlan?: PreConsolidationData | null;
}

export interface HousekeepingMove {
  unitId: string;
  fromPosition: string;
  block: string;
  bay: string;
  row: string;
  tier: string;
  weightBand: string;
  portOfDischarge: string | null;
  dischargeOrder: number | null;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  priorityScore: number;
}

export interface StackViolation {
  block: string;
  bay: string;
  row: string;
  totalContainers: number;
  weightInversions: number;
  dischargeInversions: number;
  combinedViolations: number;
}

export interface PreConsolidationSummary {
  totalContainersAnalyzed: number;
  totalStacksAnalyzed: number;
  totalMovesRequired: number;
  highPriorityMoves: number;
  mediumPriorityMoves: number;
  lowPriorityMoves: number;
  weightInversionsFound: number;
  dischargeInversionsFound: number;
}

export interface PreConsolidationData {
  vesselId: string;
  summary: PreConsolidationSummary;
  moves: HousekeepingMove[];
  stackViolations: StackViolation[];
}
