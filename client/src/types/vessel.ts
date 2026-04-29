export interface VesselAnalysisData {
  mode: string;

  vessel: string | null;

  actual: {
    avg_hours: number | null;
    visits: Record<string, any>;
  };

  predicted: {
    avg_hours: number;
    max_hours?: number | null;
    min_hours?: number | null;
    visits?: number;
  };

  risks: string[];
  execution_plan: string[];
  berth_analysis: any[];

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
}