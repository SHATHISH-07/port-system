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
    bay?: string;
    row?: string;
    tier?: string;
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
    laden_travel_distance_m?: number;
    unladen_travel_distance_m?: number;
    avg_laden_distance_m?: number;
    avg_unladen_distance_m?: number;
    block_distances?: Record<string, number>;
    corridor_congestion: "High" | "Moderate" | "Low";
    mitigation: string;
    recommendation_reason?: string;
}

export interface ConflictVessel {
    vessel_service: string;
    visit_id: string;
    shared_blocks: string[];
    shared_corridors?: string[];
    shared_equipment?: string[];
    overlap_hours: number;
}

export interface ConflictEntry {
    berth: string;
    contested_blocks?: string[];
    conflict_risk: "High" | "Medium" | "Low";
    conflict_with: ConflictVessel[];
    impact_score: number;
    reason: string;
}

export interface TerminalLayout {
    yard_code: string;
    model_name: string;
    bbox: { min_x: number; max_x: number; min_y: number; max_y: number };
    yard_polygon: [number, number][];
    blocks: Record<string, {
        name: string;
        type: string;
        purpose: string;
        polygon: [number, number][];
        center: [number, number];
        bbox: { width: number; height: number; min_x: number; max_x: number; min_y: number; max_y: number };
        rotation_rad: number;
    }>;
    berths: Record<string, {
        name: string;
        polygon: [number, number][];
        center: [number, number];
        facing_deg: number;
        bollards: [number, number][];
    }>;
}

export interface VesselHeatmapResponse {
    vessel: string;
    yard_id?: string;
    visit_id?: string;
    recommended_berth?: string;
    max_block?: string;
    summary: Summary;
    layout: Record<string, { x: number; y: number; w?: number; h?: number }>;
    terminal_layout?: TerminalLayout;
    shapes?: { type: string; name: string; points: { x: number; y: number }[] }[];
    berths?: Record<string, { x: number; y: number }[]>;
    blocks: Record<string, BlockData>;
    primary_berth?: BerthAnalysis;
    berth_analysis?: BerthAnalysis[];
    conflict_table?: ConflictEntry[];
    timestamp?: string;
}

export type VesselHeatmapViewData = VesselHeatmapResponse & {
    targetBerthId?: string;
    computedMaxBlock?: string | null;
    terminalLayout?: TerminalLayout | null;
    terminalGeo?: Record<string, unknown> | null;
};