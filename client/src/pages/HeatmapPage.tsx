import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Button,
  CircularProgress,
} from "@mui/material";
// IMPORTANT: Update this import to match your actual api path
import { api } from "../api/api";

// ─── TYPESCRIPT INTERFACES ────────────────────────────────────────────────────
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

// ─── HEATMAP COLOR (3-color system) ───────────────────────────────────────────
const getHeatColor = (concentration?: "High" | "Medium" | "Low"): string => {
  if (concentration === "High") return "rgba(220, 38, 38, 0.88)";
  if (concentration === "Medium") return "rgba(249, 115, 22, 0.86)";
  if (concentration === "Low") return "rgba(34, 197, 94, 0.82)";
  return "rgba(255,255,255,0)";
};

// ─── APM TERMINALS PORT ELIZABETH — REAL LAYOUT ───────────────────────────────
//
// SVG canvas: 980 × 860
//
// Real-world geography (5080 McLester St, Elizabeth NJ):
//   The terminal is a peninsula on Newark Bay / Elizabeth Channel.
//   Water wraps THREE sides: North (top), East (right), South (bottom).
//   Truck Gate (McLester St):  West side  x=0   → x=160
//   Terminal land:             x=160 → x=820,  y=80 → y=780
//   North quay apron:          y=80  → y=135   (top)
//   East quay apron (main):    x=765 → x=820   (right — deepest berth)
//   South quay apron:          y=725 → y=780   (bottom)
//   Rail yard (Millennium):    x=160..345, y=80..210  (NW corner)
//   Container yard blocks:     3 cols × 3 rows (G1–G9) in the center
//
// Grid → SVG mapping (blocks are horizontal, landscape orientation):
//   col 0: x=195,  col 1: x=400,  col 2: x=605
//   row 0: y=165,  row 1: y=345,  row 2: y=525
//   G1–G3 wide blocks  w=175, G3/G6/G9 narrower w=140 (east col, near main quay), h=155
//
// Berths:
//   B1 — North berth: ship above north apron (y<80), spans x=640..820
//   B2 — East berth (main deep quay): ship right of east apron (x>820), spans y=80..500
//   B3 — South berth: ship below south apron (y>780), spans x=160..720
//
const CANVAS_W = 980;
const CANVAS_H = 860;

// Block layout config: blockId → grid col/row
const BLOCK_GRID: Record<string, { col: number; row: number }> = {
  G1: { col: 0, row: 0 },
  G2: { col: 1, row: 0 },
  G3: { col: 2, row: 0 },
  G4: { col: 0, row: 1 },
  G5: { col: 1, row: 1 },
  G6: { col: 2, row: 1 },
  G7: { col: 0, row: 2 },
  G8: { col: 1, row: 2 },
  G9: { col: 2, row: 2 },
};

const COL_X = [195, 400, 605];
const ROW_Y = [165, 345, 525];
const BLOCK_W_MAIN = 175; // cols 0 & 1
const BLOCK_W_EAST = 140; // col 2 (near east quay, tighter)
const BLOCK_H = 155;
const BAY_COUNT = 10;

function getBlockRect(col: number, row: number) {
  const x = COL_X[col];
  const y = ROW_Y[row];
  const w = col === 2 ? BLOCK_W_EAST : BLOCK_W_MAIN;
  const h = BLOCK_H;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

// Build block layout from API layout grid (maps API x/y → our actual SVG positions)
function buildBlockLayout(
  layout: Record<string, { x: number; y: number }>
): Record<string, { x: number; y: number; w: number; h: number; cx: number; cy: number }> {
  const result: Record<
    string,
    { x: number; y: number; w: number; h: number; cx: number; cy: number }
  > = {};
  Object.entries(layout).forEach(([blockId, pos]) => {
    const grid = BLOCK_GRID[blockId];
    if (grid) {
      result[blockId] = getBlockRect(grid.col, grid.row);
    } else {
      // Fallback: use API coords as col/row indices
      result[blockId] = getBlockRect(
        Math.min(pos.x, 2),
        Math.min(pos.y, 2)
      );
    }
  });
  return result;
}

// ─── CRANE POSITIONS ──────────────────────────────────────────────────────────
const NORTH_CRANES = [230, 360, 480, 610, 720]; // x positions along north quay
const SOUTH_CRANES = [230, 360, 480, 610, 720]; // x positions along south quay
const EAST_CRANES = [155, 290, 425, 560, 695]; // y positions along east quay

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Heatmap() {
  const [vesselInput, setVesselInput] = useState("AA7");
  const [data, setData] = useState<VesselHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHeatmap = () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    setError(null);
    api
      .get(`/vessel/heatmap?vessel_id=${encodeURIComponent(vesselInput.trim())}`)
      .then((res) => setData(res.data))
      .catch((err) => {
        console.error("Error loading heatmap:", err);
        setError("Failed to load data. Check vessel ID and try again.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockLayout = data ? buildBlockLayout(data.layout) : {};

  // ── RENDER HELPERS ───────────────────────────────────────────────────────────

  /** One container yard block (base grid + RTG rails) */
  const renderBlockBase = (blockId: string, pos: ReturnType<typeof getBlockRect>) => {
    const stepX = pos.w / BAY_COUNT;
    return (
      <g key={`base-${blockId}`}>
        <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h}
          fill="#F8F7F0" stroke="#94A3B8" strokeWidth="0.8" />
        {Array.from({ length: BAY_COUNT - 1 }).map((_, i) => (
          <line key={i}
            x1={pos.x + stepX * (i + 1)} y1={pos.y}
            x2={pos.x + stepX * (i + 1)} y2={pos.y + pos.h}
            stroke="#CBD5E1" strokeWidth="0.5" />
        ))}
        <line x1={pos.x} y1={pos.cy} x2={pos.x + pos.w} y2={pos.cy}
          stroke="#94A3B8" strokeWidth="0.8" strokeDasharray="5 4" />
        {/* RTG rails top/bottom */}
        <rect x={pos.x} y={pos.y} width={pos.w} height={4} fill="#64748B" opacity="0.25" />
        <rect x={pos.x} y={pos.y + pos.h - 4} width={pos.w} height={4} fill="#64748B" opacity="0.25" />
      </g>
    );
  };

  /** Heatmap heat cloud overlay for a block */
  const renderHeatCloud = (blockId: string, pos: ReturnType<typeof getBlockRect>) => {
    if (!data) return null;
    const block = data.blocks[blockId];
    if (!block || block.count === 0) return null;
    return (
      <ellipse key={`heat-${blockId}`}
        cx={pos.cx} cy={pos.cy}
        rx={pos.w * 0.6} ry={pos.h * 0.7}
        fill={getHeatColor(block.concentration)}
      />
    );
  };

  /** Block ID badge, count label, intensity bar */
  const renderBlockLabels = (blockId: string, pos: ReturnType<typeof getBlockRect>) => {
    if (!data) return null;
    const block = data.blocks[blockId];
    const count = block?.count ?? 0;
    const intensity = block?.intensity ?? 0;
    const isMax = blockId === data.max_block;

    return (
      <g key={`lbl-${blockId}`}>
        {data.recommended_berth.includes(blockId) && (
          <rect x={pos.x - 3} y={pos.y - 3} width={pos.w + 6} height={pos.h + 6}
            rx="5" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeDasharray="6 3" />
        )}
        <rect x={pos.x + 4} y={pos.y + 5} width={30} height={18} rx="3"
          fill={isMax ? "rgba(220,38,38,0.85)" : "rgba(15,23,42,0.72)"} />
        <text x={pos.x + 19} y={pos.y + 18} fill="#f8fafc" fontSize="9" fontWeight="800"
          fontFamily="sans-serif" textAnchor="middle">{blockId}</text>
        {count > 0 && (
          <text x={pos.cx} y={pos.cy - 8} fill="#0f172a" fontSize="17" fontWeight="800"
            fontFamily="sans-serif" textAnchor="middle"
            style={{ textShadow: "0 0 5px rgba(255,255,255,0.95)" }}>
            {count}
          </text>
        )}
        {count > 0 && (
          <>
            <rect x={pos.x + 8} y={pos.y + pos.h - 22} width={pos.w - 16} height={8}
              rx="3" fill="rgba(0,0,0,0.12)" />
            <rect x={pos.x + 8} y={pos.y + pos.h - 22}
              width={(pos.w - 16) * intensity} height={8} rx="3"
              fill={block?.concentration === "High" ? "#dc2626"
                : block?.concentration === "Medium" ? "#f97316" : "#22c55e"}
              opacity="0.85"
            />
            <text x={pos.cx} y={pos.y + pos.h - 8} fill="#475569" fontSize="9" fontWeight="600"
              fontFamily="sans-serif" textAnchor="middle">
              {`${(intensity * 100).toFixed(0)}% intensity`}
            </text>
          </>
        )}
      </g>
    );
  };

  /** One quay crane — direction: "down" (north quay), "up" (south quay), "right" (east quay) */
  const renderCrane = (key: string, cx: number, cy: number, dir: "down" | "up" | "right") => {
    if (dir === "down") {
      // North quay: mast vertical, boom extends toward water (upward)
      return (
        <g key={key}>
          <rect x={cx - 4} y={cy - 4} width={9} height={50} fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
          <rect x={cx - 65} y={cy - 4} width={70} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
          <rect x={cx + 5} y={cy - 4} width={35} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
          <line x1={cx - 30} y1={cy + 1} x2={cx - 30} y2={cy + 30} stroke="#92400E" strokeWidth="1" />
          <rect x={cx - 42} y={cy + 28} width={24} height={4} rx="1" fill="#B45309" />
        </g>
      );
    }
    if (dir === "up") {
      // South quay: mast vertical, boom extends toward water (downward)
      return (
        <g key={key}>
          <rect x={cx - 4} y={cy - 44} width={9} height={50} fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
          <rect x={cx - 65} y={cy} width={70} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
          <rect x={cx + 5} y={cy} width={35} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
          <line x1={cx - 30} y1={cy - 10} x2={cx - 30} y2={cy} stroke="#92400E" strokeWidth="1" />
          <rect x={cx - 42} y={cy - 14} width={24} height={4} rx="1" fill="#B45309" />
        </g>
      );
    }
    // East quay: mast horizontal (rotated), boom extends toward water (rightward)
    return (
      <g key={key}>
        <rect x={cx - 4} y={cy - 4} width={50} height={9} fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
        <rect x={cx - 4} y={cy - 65} width={5} height={70} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
        <rect x={cx - 4} y={cy + 5} width={5} height={35} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
        <line x1={cx + 1} y1={cy - 30} x2={cx + 32} y2={cy - 30} stroke="#92400E" strokeWidth="1" />
        <rect x={cx + 28} y={cy - 42} width={4} height={24} rx="1" fill="#B45309" />
      </g>
    );
  };

  /** Ship hull — north (horizontal, bow right), east (vertical, bow up), south (horizontal, bow left) */
  const renderShip = (berth: "B1" | "B2" | "B3", vesselName: string) => {
    if (berth === "B1") {
      // North berth — ship sits above north quay (y < 80), bow points west (left)
      return (
        <g key="ship-B1">
          <path d="M 820,8 L 820,72 L 655,72 L 636,40 L 655,8 Z"
            fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
          <path d="M 820,8 L 820,20 L 660,20 L 642,40 L 660,60 L 820,60 L 820,72 L 655,72 L 636,40 L 655,8 Z"
            fill="#3D5068" />
          <rect x="696" y="16" width="48" height="44" rx="2" fill="#475569" stroke="#334155" strokeWidth="0.8" />
          {[0.3, 0.5, 0.7].map((t) => (
            <rect key={t} x="703" y={16 + 44 * t - 4} width="10" height="7" rx="1" fill="#BAE6FD" opacity="0.9" />
          ))}
          <text x="745" y="46" fill="#E2E8F0" fontSize="8" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">
            MSC OSCAR
          </text>
          <rect x="812" y="29" width="34" height="22" rx="3" fill="#1e40af" />
          <text x="829" y="44" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B1</text>
        </g>
      );
    }
    if (berth === "B2") {
      // East berth — ship sits right of east quay (x > 820), bow points north (up)
      return (
        <g key="ship-B2">
          <path d="M 836,80 L 836,510 L 905,510 L 926,295 L 905,80 Z"
            fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
          <path d="M 836,80 L 848,80 L 912,80 L 912,510 L 836,510 Z" fill="#3D5068" />
          <rect x="852" y="220" width="44" height="76" rx="2" fill="#475569" stroke="#334155" strokeWidth="0.8" />
          {[0.3, 0.5, 0.7].map((t) => (
            <rect key={t} x="858" y={220 + 76 * t - 4} width="10" height="7" rx="1" fill="#BAE6FD" opacity="0.9" />
          ))}
          <text x="875" y="280" fill="#E2E8F0" fontSize="8" fontWeight="600" fontFamily="sans-serif"
            textAnchor="middle" transform="rotate(90,875,280)">{vesselName}</text>
          <rect x="824" y="284" width="34" height="22" rx="3" fill="#1e40af" />
          <text x="841" y="299" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B2</text>
        </g>
      );
    }
    // B3 — South berth: ship below south quay (y > 780), bow points east (right)
    return (
      <g key="ship-B3">
        <path d="M 160,790 L 160,852 L 705,852 L 726,820 L 705,790 Z"
          fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
        <path d="M 160,790 L 160,802 L 703,802 L 722,820 L 703,840 L 160,840 L 160,852 L 705,852 L 726,820 L 705,790 Z"
          fill="#3D5068" />
        <rect x="372" y="798" width="50" height="44" rx="2" fill="#475569" stroke="#334155" strokeWidth="0.8" />
        {[0.3, 0.5, 0.7].map((t) => (
          <rect key={t} x="379" y={798 + 44 * t - 3} width="10" height="6" rx="1" fill="#BAE6FD" opacity="0.9" />
        ))}
        <text x="397" y="836" fill="#E2E8F0" fontSize="8" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">
          MAERSK ESSEX
        </text>
        <rect x="155" y="808" width="34" height="22" rx="3" fill="#1e40af" />
        <text x="172" y="823" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B3</text>
      </g>
    );
  };

  return (
    <Box sx={{ p: 3, bgcolor: "#f1f5f9", minHeight: "100vh" }}>
      {/* Title */}
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2, color: "#0f172a", letterSpacing: "-0.3px" }}>
        APM Terminals Port Elizabeth — Container Yard Heatmap
      </Typography>

      {/* Input bar */}
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <TextField
          value={vesselInput}
          onChange={(e) => setVesselInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchHeatmap()}
          placeholder="Vessel ID (e.g. AA7)"
          size="small"
          variant="outlined"
          sx={{ bgcolor: "#fff", borderRadius: 1, width: "260px" }}
        />
        <Button
          variant="contained"
          onClick={fetchHeatmap}
          disableElevation
          sx={{ bgcolor: "#0284c7", "&:hover": { bgcolor: "#0369a1" }, textTransform: "none", fontWeight: 700 }}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : "Load Data"}
        </Button>
      </Box>

      {/* Error */}
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

      {data ? (
        <>
          {/* Summary cards */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            {[
              { label: "Vessel", value: data.vessel, color: "#0f172a" },
              { label: "Visit ID", value: data.visit_id, color: "#334155" },
              { label: "Recommended Berth", value: data.recommended_berth, color: "#0284c7" },
              { label: "Max Block", value: data.max_block, color: "#dc2626" },
              { label: "Hazardous", value: String(data.summary?.hazardous ?? 0), color: "#ef4444" },
              { label: "Reefer", value: String(data.summary?.reefer ?? 0), color: "#3b82f6" },
              { label: "OOG", value: String(data.summary?.oog ?? 0), color: "#8b5cf6" },
            ].map(({ label, value, color }) => (
              <Paper key={label} sx={{ p: "10px 16px", borderRadius: 2, minWidth: 110 }}>
                <Typography variant="caption" color="text.secondary"
                  sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {label}
                </Typography>
                <Typography variant="h6" fontWeight="800" color={color} sx={{ lineHeight: 1.2 }}>
                  {value}
                </Typography>
              </Paper>
            ))}
          </Box>

          {/* SVG Terminal Map */}
          <Box sx={{ overflowX: "auto", pb: 2 }}>
            <Paper elevation={2} sx={{ display: "inline-block", borderRadius: "10px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <svg
                width={CANVAS_W}
                height={CANVAS_H}
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                style={{ display: "block" }}
              >
                <defs>
                  <filter id="hblur" x="-70%" y="-70%" width="240%" height="240%">
                    <feGaussianBlur stdDeviation="30" />
                  </filter>
                </defs>

                {/* ── 1. WATER (full canvas — wraps N, E, S) ─────── */}
                <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="#7EC8E3" />
                {/* Ripples */}
                {[120, 260, 440, 620, 760].map((ry) => (
                  <ellipse key={`rE${ry}`} cx={900} cy={ry} rx="52" ry="8"
                    fill="none" stroke="#A8D8EA" strokeWidth="0.9" opacity="0.45" />
                ))}
                {[340, 580].map((rx) => (
                  <ellipse key={`rN${rx}`} cx={rx} cy={30} rx="50" ry="7"
                    fill="none" stroke="#A8D8EA" strokeWidth="0.8" opacity="0.38" />
                ))}
                {[350, 600].map((rx) => (
                  <ellipse key={`rS${rx}`} cx={rx} cy={840} rx="52" ry="7"
                    fill="none" stroke="#A8D8EA" strokeWidth="0.8" opacity="0.38" />
                ))}
                <text x="935" y="430" fill="#1B6CA8" fontSize="10" fontWeight="600"
                  fontFamily="sans-serif" textAnchor="middle" transform="rotate(90,935,430)">
                  NEWARK BAY / ELIZABETH CHANNEL
                </text>

                {/* ── 2. TERMINAL LAND (peninsula) ────────────────── */}
                <rect x="160" y="80" width="660" height="700" fill="#DDD8C4" />

                {/* ── 3. WEST — TRUCK GATE (McLester St) ──────────── */}
                <rect x="0" y="80" width="160" height="700" fill="#C8C4B0" />
                <text x="80" y="440" fill="#555" fontSize="11" fontWeight="600"
                  fontFamily="sans-serif" textAnchor="middle" transform="rotate(-90,80,440)">
                  TRUCK GATE — McLESTER ST
                </text>
                {[140, 240, 370, 510, 650].map((gy) => (
                  <rect key={`gs${gy}`} x="0" y={gy} width="160" height="9" fill="#F5C518" opacity="0.5" />
                ))}
                <rect x="120" y="180" width="30" height="22" rx="3" fill="#1e40af" opacity="0.8" />
                <text x="135" y="195" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">GATE</text>
                <rect x="120" y="440" width="30" height="22" rx="3" fill="#1e40af" opacity="0.8" />
                <text x="135" y="455" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">GATE</text>

                {/* ── 4. NORTH QUAY APRON ──────────────────────────── */}
                <rect x="160" y="80" width="660" height="55" fill="#9CA3AF" />
                <rect x="160" y="130" width="660" height="5" fill="#4B5563" opacity="0.8" />
                <rect x="160" y="135" width="660" height="2" fill="#6B7280" opacity="0.5" />
                <rect x="358" y="88" width="82" height="18" rx="3" fill="#1e40af" opacity="0.85" />
                <text x="399" y="101" fill="#fff" fontSize="9" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">
                  APM TERMINALS
                </text>

                {/* ── 5. EAST QUAY APRON (main deep quay) ─────────── */}
                <rect x="765" y="80" width="55" height="700" fill="#9CA3AF" />
                <rect x="765" y="80" width="5" height="700" fill="#4B5563" opacity="0.8" />
                <rect x="770" y="80" width="2" height="700" fill="#6B7280" opacity="0.5" />
                <text x="795" y="440" fill="#4B5563" fontSize="10" fontWeight="600"
                  fontFamily="sans-serif" textAnchor="middle" transform="rotate(90,795,440)">
                  ELIZABETH CHANNEL — MAIN DEEP QUAY
                </text>

                {/* ── 6. SOUTH QUAY APRON ──────────────────────────── */}
                <rect x="160" y="725" width="660" height="55" fill="#9CA3AF" />
                <rect x="160" y="725" width="660" height="2" fill="#6B7280" opacity="0.5" />
                <rect x="160" y="727" width="660" height="5" fill="#4B5563" opacity="0.8" />
                <rect x="518" y="738" width="82" height="18" rx="3" fill="#1e40af" opacity="0.85" />
                <text x="559" y="751" fill="#fff" fontSize="9" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">
                  APM TERMINALS
                </text>

                {/* ── 7. RAIL YARD (NW corner — Millennium Marine Rail) */}
                <rect x="160" y="80" width="190" height="135" fill="#AAAAAA" />
                <rect x="164" y="84" width="182" height="127" rx="2" fill="none" stroke="#6B7280"
                  strokeWidth="1" strokeDasharray="4 3" />
                {[100, 112, 124, 136, 148, 160, 172, 184, 196].map((ry) => (
                  <line key={`rt${ry}`} x1="168" y1={ry} x2="342" y2={ry}
                    stroke="#6B7280" strokeWidth="1.4" />
                ))}
                {[175, 193, 211, 229, 247, 265, 283, 301, 319, 337].map((rx) => (
                  <rect key={`sl${rx}`} x={rx} y="97" width="3" height="104" fill="#78716C" opacity="0.5" />
                ))}
                <rect x="170" y="86" width="128" height="15" rx="2" fill="#1e3a5f" opacity="0.8" />
                <text x="234" y="97" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">
                  MILLENNIUM MARINE RAIL
                </text>

                {/* ── 8. INTER-BLOCK ROADS ─────────────────────────── */}
                {/* Horizontal roads between block rows */}
                <rect x="175" y="328" width="578" height="16" fill="#B8B4A4" opacity="0.7" />
                <rect x="175" y="508" width="578" height="16" fill="#B8B4A4" opacity="0.7" />
                {/* Vertical roads between block cols */}
                <rect x="378" y="152" width="16" height="584" fill="#B8B4A4" opacity="0.7" />
                <rect x="588" y="152" width="16" height="584" fill="#B8B4A4" opacity="0.7" />

                {/* ── 9. BLOCK BASES ───────────────────────────────── */}
                {Object.entries(BLOCK_GRID).map(([blockId, grid]) => {
                  const pos = getBlockRect(grid.col, grid.row);
                  return renderBlockBase(blockId, pos);
                })}

                {/* ── 10. HEATMAP CLOUDS ───────────────────────────── */}
                <g filter="url(#hblur)" style={{ mixBlendMode: "multiply" }}>
                  {Object.entries(BLOCK_GRID).map(([blockId, grid]) => {
                    const pos = getBlockRect(grid.col, grid.row);
                    return renderHeatCloud(blockId, pos);
                  })}
                </g>

                {/* ── 11. BLOCK LABELS & STATS ─────────────────────── */}
                {Object.entries(BLOCK_GRID).map(([blockId, grid]) => {
                  const pos = getBlockRect(grid.col, grid.row);
                  return renderBlockLabels(blockId, pos);
                })}

                {/* ── 12. NORTH CRANES ─────────────────────────────── */}
                {NORTH_CRANES.map((cx, i) => renderCrane(`nC${i}`, cx, 135, "down"))}

                {/* ── 13. EAST CRANES ──────────────────────────────── */}
                {EAST_CRANES.map((cy, i) => renderCrane(`eC${i}`, 765, cy, "right"))}

                {/* ── 14. SOUTH CRANES ─────────────────────────────── */}
                {SOUTH_CRANES.map((cx, i) => renderCrane(`sC${i}`, cx, 727, "up"))}

                {/* ── 15. SHIPS ────────────────────────────────────── */}
                {renderShip("B1", "MSC OSCAR")}
                {renderShip("B2", data.vessel)}
                {renderShip("B3", "MAERSK ESSEX")}

                {/* ── 16. RECOMMENDED BERTH LEGEND ────────────────── */}
                <g transform="translate(170, 700)">
                  <rect x="0" y="0" width="14" height="8" rx="1"
                    fill="none" stroke="#1d4ed8" strokeWidth="2" strokeDasharray="4 2" />
                  <text x="20" y="8" fill="#334155" fontSize="10" fontFamily="sans-serif">
                    Recommended berth: {data.recommended_berth}
                  </text>
                </g>

                {/* ── 17. COMPASS ROSE ─────────────────────────────── */}
                <g transform="translate(930, 750)">
                  <circle cx="0" cy="0" r="22" fill="rgba(255,255,255,0.88)"
                    stroke="#94A3B8" strokeWidth="0.8" />
                  <polygon points="0,-15 -4,-6 4,-6" fill="#0F172A" />
                  <polygon points="0,15 -4,6 4,6" fill="#94A3B8" />
                  <text x="0" y="-5" fill="#0F172A" fontSize="9" fontWeight="700"
                    fontFamily="sans-serif" textAnchor="middle">N</text>
                </g>

                {/* ── 18. SCALE BAR ────────────────────────────────── */}
                <g transform="translate(170, 848)">
                  <rect x="0" y="0" width="100" height="3" fill="#64748B" />
                  <line x1="0" y1="-4" x2="0" y2="7" stroke="#64748B" strokeWidth="1" />
                  <line x1="100" y1="-4" x2="100" y2="7" stroke="#64748B" strokeWidth="1" />
                  <text x="50" y="-6" fill="#64748B" fontSize="9" textAnchor="middle" fontFamily="sans-serif">250 m</text>
                </g>

                {/* ── 19. BERTH BADGES (water side) ────────────────── */}
                <rect x="820" y="795" width="80" height="44" rx="4" fill="rgba(255,255,255,0.6)" />
                <text x="860" y="810" fill="#334155" fontSize="9" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B1: North</text>
                <text x="860" y="822" fill="#334155" fontSize="9" fontFamily="sans-serif" textAnchor="middle">B2: East (main)</text>
                <text x="860" y="834" fill="#334155" fontSize="9" fontFamily="sans-serif" textAnchor="middle">B3: South</text>
              </svg>
            </Paper>
          </Box>

          {/* Block stats chips */}
          {Object.keys(data.blocks).length > 0 && (
            <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 1.5 }}>
              {Object.entries(data.blocks).map(([blockId, block]) => (
                <Paper key={blockId} sx={{
                  p: "8px 14px", borderRadius: 2, minWidth: 130,
                  borderLeft: `4px solid ${block.concentration === "High" ? "#dc2626" :
                    block.concentration === "Medium" ? "#f97316" : "#22c55e"
                    }`,
                }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    Block {blockId}
                  </Typography>
                  <Typography variant="body2" fontWeight={700} color="#0f172a">
                    {block.count} containers
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {block.concentration} · {(block.intensity * 100).toFixed(0)}%
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}

          {/* Legend */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={700}>HEAT INDEX:</Typography>
            <Chip label="Empty" size="small" sx={{ bgcolor: "#f1f5f9", border: "1px solid #cbd5e1" }} />
            <Chip label="Low" size="small" sx={{ bgcolor: "#22c55e", color: "white", fontWeight: "bold" }} />
            <Chip label="Medium" size="small" sx={{ bgcolor: "#f97316", color: "white", fontWeight: "bold" }} />
            <Chip label="High" size="small" sx={{ bgcolor: "#dc2626", color: "white", fontWeight: "bold" }} />
          </Box>
        </>
      ) : (
        !loading && !error && (
          <Typography color="text.secondary">
            Enter a Vessel ID and click Load Data to view the terminal heatmap.
          </Typography>
        )
      )}
    </Box>
  );
}