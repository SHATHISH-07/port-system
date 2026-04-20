export interface VisitDetails {
  stay_hours: number;
  loaded_containers: number;
  discharged_containers: number;
  move_start: string;
  move_end: string;
  start_time: string;
  end_time: string;
}

export interface VesselAnalysisData {
  vessel: string;
  visit_id: string;

  actual: {
    visits: Record<string, VisitDetails>;  // 🔥 FIX HERE
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
  berth_analysis: any[];
  overall_risk_level: "Low" | "Medium" | "High";
}