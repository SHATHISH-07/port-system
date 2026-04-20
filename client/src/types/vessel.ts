export interface BlockConcentration {
  count: number;
  percentage: number;
  level: "High" | "Medium" | "Low";
}

export interface BerthAnalysis {
  berth: string;
  block: string;
  cargo_concentration: string;
  total_travel_distance: "Low" | "Medium" | "High";
  congestion_risk: "Low" | "Medium" | "High";
}

export interface VesselAnalysisData {
  vessel: string;
  visit_id: string;
  actual: {
    visits: Record<string, number>;
    avg_hours: number;
    max_hours: number;
    min_hours: number;
  };
  predicted: {
    avg_hours: number;
    max_hours: number;
    min_hours: number;
    visits: number;
  };
  summary: {
    loaded: number;
    discharged: number;
    hazardous: number;
    reefer: number;
    oog: number;
  };
  risks: string[];
  execution_plan: string[];
  berth_analysis: BerthAnalysis[];
  overall_risk_level: "Low" | "Medium" | "High";
}