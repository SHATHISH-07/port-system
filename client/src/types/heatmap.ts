export interface CellData {
    row: string;         // ← was number, backend sends strings ("0", "29615", etc.)
    bay: string;         // ← was number
    tier?: string;       // ← add this, backend includes tier
    count: number;
    tiers: Record<string, number>;
}

export interface ContainerData {
    unit_id: string;
    position: string;
    freight_kind: string;
    outbound_service: string;
    category: string;
    hazardous: boolean;
    reefer: boolean;
    oog: boolean;
}

export interface BlockData {
    count: number;
    hazardous: number;
    reefer: number;
    oog: number;
    intensity: number;
    concentration: "High" | "Medium" | "Low";
    cells?: CellData[];
    containers?: ContainerData[];  // ← add this, backend sends full container list
}

export interface Summary {
    hazardous: number;
    reefer: number;
    oog: number;
    total_containers?: number;
    total_blocks?: number;
    hazmat_total?: number;
    reefer_total?: number;
    oog_total?: number;
}

export interface BerthAnalysis {
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
    congestion_risk: "High" | "Medium" | "Low";
    hazardous: number;
    reefer: number;
    oog: number;
    unique_containers: number;
    impact_score: number;
    travel_distance_score: number;
    travel_distance_label: "Short" | "Moderate" | "Long";
    corridor_congestion: "High" | "Moderate" | "Low";
    mitigation: string;
    recommendation_reason?: string;
}

export interface ConflictEntry {
    berth: string;
    block: string;
    conflict_risk: "High" | "Medium" | "Low";
    conflict_with: string[];
    impact_score: number;
    reason: string;
}

export interface VesselHeatmapResponse {
    vessel: string;
    yard_id?: string;
    visit_id?: string;
    recommended_berth?: string;
    max_block?: string;
    summary: Summary;
    layout: Record<string, { x: number; y: number }>;
    blocks: Record<string, BlockData>;
    primary_berth?: BerthAnalysis;
    berth_analysis?: BerthAnalysis[];
    conflict_table?: ConflictEntry[];
    timestamp?: string;
}

export type VesselHeatmapViewData = VesselHeatmapResponse & {
    targetBerthId?: string;
    computedMaxBlock?: string | null;
};