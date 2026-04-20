export interface VesselAnalysisData {
  mode: "vessel" | "manual" | "override";

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

  input?: {
    loaded: number;
    discharged: number;
  };
}