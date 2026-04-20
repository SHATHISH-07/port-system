export interface LayoutBlock {
  x: number;
  y: number;
}

export interface BlockData {
  count: number;
  hazardous?: number;
  reefer?: number;
  oog?: number;
}

export interface VesselHeatmapResponse {
  vessel: string;
  visit_id: string;
  recommended_berth: string;
  max_block: string;

  layout: Record<string, LayoutBlock>;

  blocks?: Record<string, BlockData>; // 🔥 optional (backend issue safe)

  summary?: {
    hazardous: number;
    reefer: number;
    oog: number;
  };
}