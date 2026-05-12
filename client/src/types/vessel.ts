export interface BerthAnalysisEntry {
  rank: number;
  berth: string;
  terminal: string;
  block: string;
  total_moves: number;
  load_moves: number;
  discharge_moves: number;
  cargo_concentration_pct: number;
  intensity: number;
  recommended_cranes: number;
  congestion_risk: "Low" | "Medium" | "High";
  hazardous: number;
  reefer: number;
  oog: number;
  unique_containers: number;
  impact_score?: number;
}

export interface VesselVisit {
  stay_hours: number;
  loaded_containers: number;
  discharged_containers: number;
  move_start: string;
  move_end: string;
  [key: string]: unknown;
}

export interface HeatmapBlock {
  count: number;
  load_moves?: number;
  discharge_moves?: number;
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
  cargo_summary?: {
    hazardous: number;
    reefer: number;
    oog: number;
  };
  berth_recommendation_reason?: string;
  blocks: Record<string, HeatmapBlock>;
  layout: Record<string, { x: number; y: number; [key: string]: unknown }>;
  error?: string;
}

export interface TopVisitStats {
  loaded: number;
  discharged: number;
  hazardous: number;
  reefer: number;
  oog: number;
  total_units: number;
  crane_count?: number;
  crane_ids?: string[];
  crane_mphc?: number;
  avg_weight_kg?: number;
  freight_kind_breakdown?: Record<string, number>;
  port_of_discharge_top5?: Record<string, number>;
}

export interface OperationalPredictions {
  recommended_crane_count: number;
  strategy_label: string;
  strategy_description: string;
  conflict_risk: string;
  itv_impact: {
    avg_travel_score: number;
    itv_cycle_impact: string;
    estimated_itv_needs: number;
  };
  operational_impact_score: number;
  operational_rules_applied: string[];
}

export interface CraneConflict {
  type: string;
  cranes: string[];
  block: string;
  time: string;
}

export interface IndividualCraneStat {
  crane_id: string;
  total_moves: number;
  effective_moves: number;
  moves_per_hour: number;
  utilization_pct: number;
  avg_cycle_minutes: number;
  restow_count: number;
  idle_gap_count: number;
  timeline: {
    start: string | null;
    end: string | null;
    sequence: Array<{
      unit_id: string;
      crane_move_kind: string;
      crane_time: string;
    }>;
  };
}

export interface VesselAnalysisData {
  mode: string;
  vessel: string | null;
  yard_id?: string;
  is_history: boolean;
  stay_time?: {
    actual: number | null;
    predicted: number | null;
    unit: string;
  };
  operational_predictions?: OperationalPredictions;
  delay_analysis?: Array<{
    factor: string;
    impact: string;
    reason: string;
  }>;
  crane_analytics?: {
    active_cranes: number;
    crane_details: IndividualCraneStat[];
    conflicts: CraneConflict[];
    total_moves: number;
  };
  berth_recommendation?: {
    rank?: number;
    berth?: string;
    block?: string;
    total_moves?: number;
    cargo_concentration_pct?: number;
    intensity?: number;
    congestion_risk?: string;
    travel_distance_score?: number;
    operational_cost?: number;
    recommendation?: string;
    recommendation_reason?: string;
    logic_applied?: string[];
  };
  berth_analysis: BerthAnalysisEntry[];
  berth_conflicts?: Array<{
    berth: string;
    block: string;
    conflict_risk: "Low" | "Medium" | "High";
    conflict_with: string[];
    impact_score: number;
    reason: string;
  }>;
  cargo_summary?: {
    loaded: number;
    discharged: number;
    hazardous: number;
    reefer: number;
    reshuffle_impact: {
      score: number;
      label: string;
    };
  };
  safety_and_strategy?: {
    guidance: string[];
    rules: string[];
  };
  // Deprecated / Legacy fields below if needed for backward compatibility
  actual?: {
    avg_hours: number | null;
    visits: Record<string, VesselVisit>;
  };
  predicted?: {
    avg_hours: number;
    max_hours?: number | null;
    min_hours?: number | null;
    visits?: number;
  };
  risks?: string[];
  execution_plan?: string[];
  top_visit_stats?: TopVisitStats;
  crane_assignment?: CraneAssignmentEntry[];
  yard_strategy?: {
    weight_distribution: Record<string, number>;
    top_discharge_ports: Record<string, number>;
    avg_moves_per_container: number;
    reshuffle_risk: string;
  };
  input?: { loaded?: number; discharged?: number; [key: string]: unknown };
}

export interface CraneAssignmentEntry {
  visit_id: string;
  vessel_service?: string;
  crane_count: number;
  crane_ids: string;
  crane_mphc: number;
  duration_hours: number;
  loaded: number;
  discharged: number;
  total_units: number;
}

export interface CraneStats {
  crane_id: string;
  total_moves: number;
  moves_per_hour: number;
  productivity_rating: string;
  avg_cycle_minutes: number;
  restow_ratio: number;
}

export interface VisitCraneAllocation {
  visit_id: string;
  crane_count: number;
  total_moves: number;
  cranes_used: string[];
}

export interface HourlyProductivity {
  hour: string;
  moves: number;
}

export interface CraneMove {
  id: string;
  crane_id: string | null;
  unit_id: string | null;
  carrier_visit: string | null;
  move_kind: string | null;
  from_position: string | null;
  to_position: string | null;
  time_completed: string | null;
  line_op: string | null;
}

export interface CranePerformanceResponse {
  summary: {
    total_moves: number;
    effective_moves: number;
    anomaly_rate: number;
    active_cranes: number;
    unique_visits_served: number;
  };
  crane_stats: CraneStats[];
  visit_crane_allocation: VisitCraneAllocation[];
  hourly_productivity: HourlyProductivity[];
  moves: CraneMove[];
  error?: string;
}