
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
}
