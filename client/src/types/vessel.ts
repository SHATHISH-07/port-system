export interface BerthAnalysisEntry {
  berth: string;
  block?: string;
  cargo_concentration: string;
  total_travel_distance?: string;
  congestion_risk?: "Low" | "Medium" | "High";
  [key: string]: unknown;
}

export interface VesselVisit {
  stay_hours: number;
  loaded_containers: number;
  discharged_containers: number;
  move_start: string;
  move_end: string;
  [key: string]: unknown;
}

export interface BlockData {
  count: number;
  hazardous: number;
  reefer: number;
  oog: number;
  intensity: number;
  concentration: "High" | "Medium" | "Low";
  [key: string]: unknown;
}

export interface VesselHeatmapResponse {
  vessel: string;
  visit_id: string;
  recommended_berth?: string;
  max_block: string;
  summary: {
    hazardous: number;
    reefer: number;
    oog: number;
  };
  blocks: Record<string, BlockData>;
  layout: Record<string, { x: number; y: number; [key: string]: unknown }>;
  error?: string;
  [key: string]: unknown;
}

export interface VesselAnalysisData {
  mode: string;

  vessel: string | null;

  actual: {
    avg_hours: number | null;
    visits: Record<string, VesselVisit>;
  };

  predicted: {
    avg_hours: number;
    max_hours?: number | null;
    min_hours?: number | null;
    visits?: number;
  };

  risks: string[];
  execution_plan: string[];
  berth_analysis: BerthAnalysisEntry[];

  yard_strategy?: {
    weight_distribution: Record<string, number>;
    top_discharge_ports: Record<string, number>;
    avg_moves_per_container: number;
    reshuffle_risk: string;
  };

  input?: {
    loaded: number;
    discharged: number;
  };

  top_visit_stats?: {
    loaded: number;
    discharged: number;
    hazardous: number;
    reefer: number;
    oog: number;
    total_units: number;
  };
}