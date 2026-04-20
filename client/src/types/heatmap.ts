export interface CellData {
    row: number;
    bay: number;
    count: number;
    tiers: Record<string, number>;
}

export interface BlockData {
    count: number;
    hazardous: number;
    reefer: number;
    oog: number;

    // ✅ ADDED (from backend — DO NOT REMOVE OLD)
    intensity: number;
    concentration: "High" | "Medium" | "Low";

    cells?: CellData[];
}

export interface Summary {
    hazardous: number;
    reefer: number;
    oog: number;
}

export interface VesselHeatmapResponse {
    vessel: string;
    visit_id: string;
    recommended_berth: string;
    max_block: string;
    summary: Summary;

    layout: Record<string, { x: number; y: number }>;

    blocks: Record<string, BlockData>;
}