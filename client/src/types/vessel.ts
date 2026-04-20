export interface HeatmapData {
  count: number;
  level: string;
}

export interface BlockConcentration {
  count: number;
  percentage: number;
  level: "High" | "Medium" | "Low";
}

export interface BerthAnalysis {
  berth: string;
  block: string;
  cargo_concentration: string;   // ✅ updated
  total_travel_distance: string; // "Low" | "Medium" | "High"
  congestion_risk: "Low" | "Medium" | "High";
}

export interface VesselAnalysisData {
  vessel: string;
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
}