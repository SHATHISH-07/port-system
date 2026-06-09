
export interface NormPoint { x: number; y: number }

export interface BerthInfo {
  id: string;
  /** Normalised centroid */
  cx: number;
  cy: number;
  /** Normalised polygon corners */
  polygon: NormPoint[];
  facing_deg: number;
}

export interface BlockInfo {
  id: string;
  /** Normalised centroid */
  cx: number;
  cy: number;
  /** Normalised width / height of bounding box */
  w: number;
  h: number;
  polygon: NormPoint[];
  type: string;
  purpose: string;
}

export interface RailTrackInfo {
  name: string;
  center_line: NormPoint[];
}

export interface RoadInfo {
  from_vertex: string;
  to_vertex: string;
  graph: string;
  points: NormPoint[];
}

export interface TerminalGeometry {
  /** All berths parsed from XML */
  berths: BerthInfo[];
  /** All blocks parsed from XML */
  blocks: BlockInfo[];
  /** Yard boundary polygon */
  yardPolygon: NormPoint[];
  /** Rail tracks */
  railTracks: RailTrackInfo[];
  /** Roads */
  roads: RoadInfo[];
  /**
   * Given a map from blockId → containerCount, returns the berth id
   * closest (by Euclidean distance between centroids) to the highest-density
   * block.  Returns null when there is no data.
   */
  recommendedBerth(blockCounts: Record<string, number>): string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Raw XML layout shape produced by xml_layout_service */
export interface RawTerminalLayout {
  yard_polygon?: [number, number][];
  blocks?: Record<string, {
    name: string;
    type: string;
    purpose: string;
    polygon: [number, number][];
    center: [number, number];
    bbox: { min_x: number; min_y: number; max_x: number; max_y: number; width: number; height: number };
    rotation_rad: number;
  }>;
  berths?: Record<string, {
    name: string;
    polygon: [number, number][];
    center: [number, number];
    facing_deg: number;
    bollards: [number, number][];
  }>;
  rail_tracks?: {
    name: string;
    center_line: [number, number][];
  }[];
  roads?: {
    from_vertex: string;
    to_vertex: string;
    graph: string;
    points: [number, number][];
  }[];
}

function centroid(polygon: NormPoint[]): NormPoint {
  if (!polygon.length) return { x: 0.5, y: 0.5 };
  const sum = polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

function euclidean(a: NormPoint, b: NormPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toPairs(arr: [number, number][]): NormPoint[] {
  return (arr || []).map(([x, y]) => ({ x, y: 1 - y }));
}

// ─── Main factory ─────────────────────────────────────────────────────────────

export function buildTerminalGeometry(raw: RawTerminalLayout | null | undefined): TerminalGeometry {
  if (!raw) {
    return {
      berths: [],
      blocks: [],
      yardPolygon: [],
      railTracks: [],
      roads: [],
      recommendedBerth: () => null,
    };
  }

  // ── Berths ──────────────────────────────────────────────────────────────
  const berths: BerthInfo[] = Object.entries(raw.berths ?? {}).map(([id, b]) => {
    const polygon = toPairs(b.polygon ?? []);
    const c = b.center?.length === 2
      ? { x: b.center[0], y: 1 - b.center[1] }
      : centroid(polygon);
    return {
      id,
      cx: c.x,
      cy: c.y,
      polygon,
      facing_deg: b.facing_deg ?? 0,
    };
  });

  // ── Blocks ───────────────────────────────────────────────────────────────
  const blocks: BlockInfo[] = Object.entries(raw.blocks ?? {}).map(([id, b]) => {
    const polygon = toPairs(b.polygon ?? []);
    const c = b.center?.length === 2
      ? { x: b.center[0], y: 1 - b.center[1] }
      : centroid(polygon);
    const bbox = b.bbox ?? { width: 0.05, height: 0.025, min_x: c.x, min_y: c.y, max_x: c.x, max_y: c.y };
    return {
      id,
      cx: c.x,
      cy: c.y,
      w: bbox.width,
      h: bbox.height,
      polygon,
      type: b.type ?? 'UNKNOWN',
      purpose: b.purpose ?? 'BLCK',
    };
  });

  // ── Yard polygon ─────────────────────────────────────────────────────────
  const yardPolygon = toPairs(raw.yard_polygon ?? []);

  // ── Recommended berth ────────────────────────────────────────────────────
  function recommendedBerth(blockCounts: Record<string, number>): string | null {
    if (!berths.length || !Object.keys(blockCounts).length) return null;

    // Find the block with the most containers
    let maxCount = -1;
    let maxBlockId: string | null = null;
    for (const [id, count] of Object.entries(blockCounts)) {
      if (count > maxCount) { maxCount = count; maxBlockId = id; }
    }
    if (!maxBlockId || maxCount === 0) return null;

    // Resolve its centroid from XML block data
    const xmlBlock = blocks.find(b => b.id === maxBlockId);
    const blockCentroid: NormPoint = xmlBlock
      ? { x: xmlBlock.cx, y: xmlBlock.cy }
      : { x: 0.5, y: 0.5 };

    // Pick the closest berth by centroid distance
    let minDist = Infinity;
    let closest: string | null = null;
    for (const berth of berths) {
      const d = euclidean({ x: berth.cx, y: berth.cy }, blockCentroid);
      if (d < minDist) { minDist = d; closest = berth.id; }
    }
    return closest;
  }

  // ── Rail tracks ──────────────────────────────────────────────────────────
  const railTracks: RailTrackInfo[] = (raw.rail_tracks ?? []).map(r => ({
    name: r.name,
    center_line: toPairs(r.center_line),
  }));

  // ── Roads ────────────────────────────────────────────────────────────────
  const roads: RoadInfo[] = (raw.roads ?? []).map(r => ({
    from_vertex: r.from_vertex,
    to_vertex: r.to_vertex,
    graph: r.graph,
    points: toPairs(r.points),
  }));

  return { berths, blocks, yardPolygon, railTracks, roads, recommendedBerth };
}

// ─── 2-D SVG helpers ─────────────────────────────────────────────────────────

/** Map a normalised point into the SVG viewport */
export function n2svg(
  nx: number,
  ny: number,
  viewW: number,
  viewH: number,
  padX = 0,
  padY = 0,
): { x: number; y: number } {
  return {
    x: padX + nx * (viewW - 2 * padX),
    y: padY + ny * (viewH - 2 * padY),
  };
}

/** Build a SVG points string from a normalised polygon */
export function polygonToSvgPoints(
  poly: NormPoint[],
  viewW: number,
  viewH: number,
  padX = 0,
  padY = 0,
): string {
  return poly
    .map(p => {
      const { x, y } = n2svg(p.x, p.y, viewW, viewH, padX, padY);
      return `${x},${y}`;
    })
    .join(' ');
}

/**
 * Returns a CSS transform string for a berth ship/label inside the SVG.
 * rotates the element so it is perpendicular to the berth edge.
 */
export function berthRotationDeg(berth: BerthInfo): number {
  // Use facing_deg from XML when available (subtract 90 to lay ship parallel to berth)
  if (berth.facing_deg !== 0) return berth.facing_deg - 90;
  if (berth.polygon.length >= 2) {
    const dx = berth.polygon[1].x - berth.polygon[0].x;
    const dy = berth.polygon[1].y - berth.polygon[0].y;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  return 0;
}

// ─── 3-D Three.js helpers ─────────────────────────────────────────────────────

/**
 * Map a normalised (nx,ny) to a Three.js (x, 0, z) centred on origin.
 * WORLD_SCALE controls how many Three.js units span the full terminal.
 */
export const WORLD_SCALE = 60;

export function n2world(nx: number, ny: number): { x: number; y: number; z: number } {
  return {
    x: (nx - 0.5) * WORLD_SCALE,
    y: 0,
    z: (ny - 0.5) * WORLD_SCALE,
  };
}

/** Build a flat list of Three.js {x,z} pairs from a normalised polygon */
export function polygonToWorld(poly: NormPoint[]): { x: number; z: number }[] {
  return poly.map(p => {
    const w = n2world(p.x, p.y);
    return { x: w.x, z: w.z };
  });
}

/**
 * Approximate ship heading (rotation around Y axis, radians) from a berth polygon.
 * Returns the angle of the longest edge so the ship lies along the berth face.
 */
export function berthHeadingRad(berth: BerthInfo): number {
  if (berth.facing_deg !== 0) {
    return ((berth.facing_deg - 90) * Math.PI) / 180;
  }
  if (berth.polygon.length >= 2) {
    // find longest edge
    let maxLen = -1;
    let angle = 0;
    for (let i = 0; i < berth.polygon.length; i++) {
      const a = berth.polygon[i];
      const b = berth.polygon[(i + 1) % berth.polygon.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > maxLen) {
        maxLen = len;
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      }
    }
    return angle;
  }
  return 0;
}

/**
 * Computes a coordinate pushed out from the berth's centroid into the sea.
 * It finds the perpendicular to the longest edge and points it away from the terminal center.
 */
export function getSeaPoint(berth: BerthInfo, offsetNorm: number = 0.04): NormPoint {
  if (berth.polygon.length < 2) return { x: berth.cx, y: berth.cy };
  
  let maxLen = -1;
  let ex = 0, ey = 0;
  for (let i = 0; i < berth.polygon.length; i++) {
    const a = berth.polygon[i];
    const b = berth.polygon[(i + 1) % berth.polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > maxLen) {
      maxLen = len;
      ex = dx; ey = dy;
    }
  }
  
  // Perpendicular vector
  let px = -ey;
  let py = ex;
  const plen = Math.hypot(px, py);
  if (plen > 0) { px /= plen; py /= plen; }
  
  // Point away from terminal center (0.5, 0.5)
  const vx = berth.cx - 0.5;
  const vy = berth.cy - 0.5;
  if (px * vx + py * vy < 0) {
    px = -px;
    py = -py;
  }
  
  return {
    x: berth.cx + px * offsetNorm,
    y: berth.cy + py * offsetNorm,
  };
}