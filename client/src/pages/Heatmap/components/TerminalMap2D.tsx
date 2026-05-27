import { useState } from "react";
import { Box, Typography, useTheme, IconButton, Tooltip } from "@mui/material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { RestartAltRounded } from "@mui/icons-material";

import type { VesselHeatmapViewData, BlockData } from "../../../types/heatmap";

// ── Constants ────────────────────────────────────────────────────────────────

const VIEW_BOX = "-100 -50 1300 950";

const BLK_W = 160,
  BLK_H = 120,
  BLK_GAP_X = 40,
  BLK_GAP_Y = 40;
const BLK_START_X = 80,
  BLK_START_Y = 190;

const BERTHS = [
  { id: "T1", label: "BERTH T1", lx: 260, ly: 140, labelRot: 0, x: 260, y: 60, rot: 0, defaultShip: { name: "MSC OSCAR", color: "#334155" } },
  { id: "T2", label: "BERTH T2", lx: 600, ly: 140, labelRot: 0, x: 600, y: 60, rot: 0, defaultShip: { name: "EVER GIVEN", color: "#334155" } },
  { id: "B1", label: "BERTH B1", lx: 260, ly: 680, labelRot: 0, x: 260, y: 760, rot: 0, defaultShip: { name: "CMA CGM MARCO POLO", color: "#334155" } },
  { id: "B2", label: "BERTH B2", lx: 600, ly: 680, labelRot: 0, x: 600, y: 760, rot: 0, defaultShip: { name: "HAPAG-LLOYD", color: "#334155" } },
  { id: "R1", label: "BERTH R1", lx: 930, ly: 280, labelRot: -90, x: 1010, y: 280, rot: 90, defaultShip: { name: "OOCL HONG KONG", color: "#334155" } },
  { id: "R2", label: "BERTH R2", lx: 930, ly: 580, labelRot: -90, x: 1010, y: 580, rot: 90, defaultShip: { name: "MAERSK MC-KINNEY", color: "#334155" } },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ZoneData {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function getZones(layout: Record<string, { x: number; y: number }>): ZoneData[] {
  return Object.entries(layout).map(([id, pos]) => ({
    id,
    x: BLK_START_X + pos.x * (BLK_W + BLK_GAP_X),
    y: BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y),
    w: BLK_W,
    h: BLK_H,
  }));
}

// ── Sub-components ───────────────────────────────────────────────────────────

const Controls = ({ resetTransform }: { resetTransform: () => void }) => (
  <Box sx={{ position: "absolute", top: { xs: 52, lg: "auto" }, bottom: { xs: "auto", lg: 16 }, right: 16, zIndex: 100 }}>
    <Tooltip title="Reset View" placement="left">
      <IconButton
        onClick={() => resetTransform()}
        sx={{
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: 3,
          "&:hover": { bgcolor: "action.hover" },
          p: 0.6,
          width: 28,
          height: 28,
        }}
      >
        <RestartAltRounded fontSize="small" />
      </IconButton>
    </Tooltip>
  </Box>
);

const STS = ({ x, y, rot, isDark }: { x: number; y: number; rot: number; isDark: boolean }) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`} style={{ pointerEvents: "none" }}>
    <rect x={-20} y={10} width={10} height={50} fill={isDark ? "#475569" : "#64748b"} />
    <rect x={10} y={10} width={10} height={50} fill={isDark ? "#475569" : "#64748b"} />
    <rect x={-25} y={20} width={50} height={6} fill={isDark ? "#64748b" : "#94a3b8"} />
    <rect x={-3} y={-40} width={6} height={60} fill="#0ea5e9" />
    <rect x={-2} y={-80} width={4} height={100} fill="#0ea5e9" />
    <rect x={-2} y={20} width={4} height={40} fill="#0ea5e9" />
    <rect x={-5} y={-60} width={10} height={6} fill={isDark ? "#e2e8f0" : "#ffffff"} />
  </g>
);

interface ShipProps {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  color: string;
  rot?: number;
  isTarget?: boolean;
  isDark: boolean;
}

const Ship = ({ x, y, w, h, name, color, rot = 0, isTarget = false, isDark }: ShipProps) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`} style={{ pointerEvents: "none" }}>

    {/* Target Berth Radar Pulse - Hugs the vessel and ends quickly */}
    {isTarget && (
      <ellipse cx="0" cy="0" rx="145" ry="35" fill="none" stroke={color} strokeWidth="2">
        <animate attributeName="rx" values="145; 170" dur="2s" repeatCount="indefinite" />
        <animate attributeName="ry" values="35; 60" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8; 0" dur="2s" repeatCount="indefinite" />
      </ellipse>
    )}

    <g transform={`translate(${-w / 2}, ${-h / 2})`}>
      <path
        d={`M 0,${h / 2} L 40,2 L ${w - 15},2 Q ${w},2 ${w},10 L ${w},${h - 10} Q ${w},${h - 2} ${w - 15},${h - 2} L 40,${h - 2} Z`}
        fill={isTarget ? (isDark ? "#0f172a" : "#ffffff") : color}
        stroke={isTarget ? "#0ea5e9" : isDark ? "#0f172a" : "#94a3b8"}
        strokeWidth={isTarget ? 3 : 1.5}
      />
      <path d={`M 45,6 L ${w - 20},6 L ${w - 20},${h - 6} L 45,${h - 6} Z`} fill="rgba(0,0,0,0.15)" />
      {Array.from({ length: Math.floor(w / 35) }).map((_, i) => (
        <g key={i} transform={`translate(${45 + i * 28}, 8)`}>
          <rect width={24} height={h - 16} rx={1} fill={isDark ? "#334155" : "#94a3b8"} opacity="0.8" />
          <line x1={12} y1={2} x2={12} y2={h - 18} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        </g>
      ))}
      <g transform={`translate(${w - 65}, ${h / 2 - 18})`}>
        <rect width={35} height={36} rx={2} fill={isDark ? "#f8fafc" : "#ffffff"} stroke="#64748b" strokeWidth={0.5} />
        <rect x={2} y={5} width={8} height={26} rx={1} fill="#0ea5e9" opacity={0.6} />
        <rect x={12} y={10} width={15} height={16} rx={1} fill={isDark ? "#e2e8f0" : "#f1f5f9"} />
        <line x1={20} y1={5} x2={20} y2={10} stroke="#475569" strokeWidth={2} />
        <line x1={15} y1={5} x2={25} y2={5} stroke="#475569" strokeWidth={1} />
      </g>
      <rect x={w - 25} y={h / 2 - 6} width={12} height={12} rx={2} fill="#ef4444" />
      <circle cx={w - 19} cy={h / 2} r={3} fill="#1e293b" />
      <rect x={w - 68} y={2} width={10} height={4} rx={2} fill="#f97316" />
      <rect x={w - 68} y={h - 6} width={10} height={4} rx={2} fill="#f97316" />
      <g transform={`translate(${w / 2 - 10}, ${h + 12})`}>
        <text
          fill={isTarget ? "#0ea5e9" : isDark ? "#94a3b8" : "#475569"}
          fontSize="11"
          fontWeight="800"
          fontFamily="'Roboto Mono', monospace"
          textAnchor="middle"
          letterSpacing="1px"
        >
          {name.toUpperCase()}
        </text>
      </g>
    </g>
  </g>
);

// ── Main Component ───────────────────────────────────────────────────────────

interface TerminalMap2DProps {
  data: VesselHeatmapViewData | null;
  loading: boolean;
  targetBerthId?: string;
}

export default function TerminalMap2D({ data, loading, targetBerthId: propTargetBerthId }: TerminalMap2DProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  let targetBerthId = propTargetBerthId || "R1";
  let computedMaxBlock: string | null = null;

  if (data) {
    let maxCount = -1;
    Object.entries(data.blocks).forEach(([id, b]) => {
      if (b.count > maxCount) {
        maxCount = b.count;
        computedMaxBlock = id;
      }
    });

    if (!propTargetBerthId) {
      const highestBlockId = computedMaxBlock ?? data.max_block;
      if (highestBlockId && data.layout?.[highestBlockId]) {
        const pos = data.layout[highestBlockId];
        const maxBlockX = BLK_START_X + pos.x * (BLK_W + BLK_GAP_X) + BLK_W / 2;
        const maxBlockY = BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y) + BLK_H / 2;
        let minDistance = Infinity;
        BERTHS.forEach((berth) => {
          const dist = Math.hypot(berth.x - maxBlockX, berth.y - maxBlockY);
          if (dist < minDistance) {
            minDistance = dist;
            targetBerthId = berth.id;
          }
        });
      }
    }
  }

  const allBlocks = data
    ? Object.entries(data.blocks)
      .filter(([, b]) => b.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
    : [];

  const maxCount = allBlocks.length > 0 ? allBlocks[0][1].count : 0;
  const highCountIds = allBlocks.filter(([, b]) => b.count === maxCount).map(([id]) => id);
  const mediumIds = allBlocks.filter(([id]) => !highCountIds.includes(id)).slice(0, 3).map(([id]) => id);

  const bgColor = isDark ? "#061324" : "#e0f2fe";
  const roadColor = isDark ? "#1e2433" : "#b4bfce";

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", bgcolor: bgColor }}>
      <style>{`
        @keyframes scan { 0% { transform:translateY(-120px) } 100% { transform:translateY(950px) } }
        .zone-block { transition: filter 0.2s; }
        .zone-block:hover { filter: brightness(1.1); }
      `}</style>

      {loading && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 120,
            background: "linear-gradient(transparent,rgba(56,189,248,0.18),transparent)",
            animation: "scan 1.8s linear infinite",
            pointerEvents: "none",
            zIndex: 99,
          }}
        />
      )}

      {hovered && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: 24,
            transform: "translateY(-50%)",
            zIndex: 10,
            px: 2,
            py: 1.4,
            bgcolor: isDark ? "rgba(18,22,31,0.95)" : "rgba(255,255,255,0.97)",
            border: "1px solid",
            borderColor: "primary.main",
            borderRadius: 1,
            minWidth: 140,
          }}
        >
          <Typography sx={{ fontSize: "0.72rem", color: "primary.main", fontWeight: 800 }}>BLOCK {hovered}</Typography>
          {data?.blocks?.[hovered] && (
            <Typography sx={{ fontSize: "0.85rem", color: "text.primary", fontWeight: 700, mt: 0.5 }}>
              Volume: <span style={{ color: isDark ? "#38bdf8" : "#0284c7" }}>{data.blocks[hovered].count} CTN</span>
            </Typography>
          )}
        </Box>
      )}

      <TransformWrapper
        initialScale={0.72}
        minScale={0.15}
        maxScale={5}
        centerOnInit
        wheel={{ step: 0.001 }}
        panning={{ disabled: false }}
        doubleClick={{ disabled: false, mode: "zoomIn" }}
      >
        {({ resetTransform }) => (
          <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
            <Controls resetTransform={resetTransform} />
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
              <svg width="1250" height="950" viewBox={VIEW_BOX} style={{ display: "block" }}>
                <defs>
                  <filter id="heatglow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="28" result="blur" />
                  </filter>

                  <pattern id="asphalt" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                    <rect width="40" height="40" fill={isDark ? "#0f1219" : "#dde3ec"} />
                    <rect x="0" y="0" width="40" height="40" fill={isDark ? "#161b24" : "#c8d0dc"} opacity="0.35" />
                  </pattern>

                  <linearGradient id="seaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={isDark ? "#061524" : "#bae6fd"} />
                    <stop offset="100%" stopColor={isDark ? "#020813" : "#7dd3fc"} />
                  </linearGradient>

                  <radialGradient id="gradHigh" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff0000" stopOpacity="1" />
                    <stop offset="30%" stopColor="#ff0000" stopOpacity="0.9" />
                    <stop offset="60%" stopColor="#ff4444" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
                  </radialGradient>

                  <radialGradient id="gradMedium" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff8800" stopOpacity="1" />
                    <stop offset="30%" stopColor="#ff8800" stopOpacity="0.85" />
                    <stop offset="60%" stopColor="#ffaa44" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#ff8800" stopOpacity="0" />
                  </radialGradient>

                  <radialGradient id="gradLow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#00ff00" stopOpacity="1" />
                    <stop offset="30%" stopColor="#00ff00" stopOpacity="0.85" />
                    <stop offset="60%" stopColor="#44ff44" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#00ff00" stopOpacity="0" />
                  </radialGradient>
                </defs>

                <rect x="-200" y="-150" width="1600" height="1200" fill="url(#seaGrad)" />

                <g opacity={isDark ? "0.15" : "0.35"} style={{ pointerEvents: "none" }}>
                  {Array.from({ length: 50 }).map((_, i) => (
                    <path
                      key={i}
                      d={`M -200,${i * 25 - 50} Q -100,${i * 25 - 60} 0,${i * 25 - 50} T 200,${i * 25 - 50} T 400,${i * 25 - 50} T 600,${i * 25 - 50} T 800,${i * 25 - 50} T 1000,${i * 25 - 50} T 1200,${i * 25 - 50} T 1400,${i * 25 - 50}`}
                      fill="none"
                      stroke={isDark ? "#38bdf8" : "#0284c7"}
                      strokeWidth="1.5"
                    />
                  ))}
                </g>

                <path d="M -200,128 L 966,128 L 966,708 L -200,708 Z" fill={isDark ? "#090d16" : "#94a3b8"} />
                <path d="M -200,120 L 960,120 L 960,700 L -200,700 Z" fill="url(#asphalt)" stroke={isDark ? "#272e3d" : "#cbd5e1"} strokeWidth="2" />

                <rect x="-200" y="120" width="1160" height="15" fill={roadColor} />
                <line x1="-200" y1="125" x2="960" y2="125" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

                <rect x="-200" y="685" width="1160" height="15" fill={roadColor} />
                <line x1="-200" y1="695" x2="960" y2="695" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

                <rect x="945" y="120" width="15" height="580" fill={roadColor} />
                <line x1="955" y1="120" x2="955" y2="700" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

                {[135, 310, 470, 630].map((ly) => (
                  <g key={ly}>
                    <rect x="-200" y={ly} width="1145" height="20" fill={isDark ? "#0b0e14" : "#e8edf5"} opacity="0.75" />
                    <line x1="-200" y1={ly + 10} x2="945" y2={ly + 10} stroke={isDark ? "#334155" : "#94a3b8"} strokeWidth="1" strokeDasharray="16 8" />
                  </g>
                ))}

                {[240, 440, 640].map((lx) => (
                  <rect key={lx} x={lx} y="120" width="20" height="580" fill={isDark ? "#0b0e14" : "#e8edf5"} opacity="0.65" />
                ))}

                {data &&
                  getZones(data.layout).map((z) => {
                    const block = data.blocks[z.id] as BlockData | undefined;
                    const isHot = !!block && block.count > 0;
                    const isMax = z.id === (computedMaxBlock ?? data.max_block);
                    const isRec = data.recommended_berth?.includes(z.id) ?? false;
                    const isHover = hovered === z.id;

                    return (
                      <g
                        key={z.id}
                        className="zone-block"
                        onMouseEnter={() => setHovered(z.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: "pointer" }}
                      >
                        {isRec && (
                          <rect
                            x={z.x - 4} y={z.y - 4} width={z.w + 8} height={z.h + 8}
                            rx="5" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="8 4" opacity="0.9"
                          />
                        )}
                        <rect
                          x={z.x} y={z.y} width={z.w} height={z.h}
                          fill={isDark ? "#161b24" : "#ffffff"}
                          stroke={isHover ? "#fcd34d" : isMax ? "#ef4444" : isRec ? "#38bdf8" : isDark ? "#334155" : "#cbd5e1"}
                          strokeWidth={isHover || isMax ? 2.5 : isRec ? 2 : 1} rx="3"
                        />
                        {(() => {
                          const maxCols = 4;
                          const maxRows = 7;
                          const loadedCount = isHot ? Math.min(block!.count, maxCols * maxRows) : 0;

                          const cells = [];
                          for (let row = 0; row < maxRows; row++) {
                            for (let col = 0; col < maxCols; col++) {
                              const index = row * maxCols + col;
                              const isLoaded = index < loadedCount;

                              const cx = z.x + 6 + col * 38;
                              const cy = z.y + 8 + row * 15;

                              if (isLoaded) {
                                // Red and Blue containers
                                const colors = ["#991b1b", "#1d4ed8"];
                                const fillC = colors[(row * maxCols + col) % 2];
                                cells.push(
                                  <g key={`${row}-${col}`}>
                                    <rect x={cx} y={cy} width="34" height="11" fill={fillC} stroke="#0f172a" strokeWidth="0.5" rx="1" opacity="0.95" />
                                    <line x1={cx + 4} y1={cy} x2={cx + 4} y2={cy + 11} stroke="#ffffff" strokeOpacity="0.2" strokeWidth="0.5" />
                                    <line x1={cx + 30} y1={cy} x2={cx + 30} y2={cy + 11} stroke="#ffffff" strokeOpacity="0.2" strokeWidth="0.5" />
                                  </g>
                                );
                              } else {
                                // Empty slots
                                cells.push(
                                  <rect key={`${row}-${col}`} x={cx} y={cy} width="34" height="11" fill={isDark ? "#0b0e14" : "#e8edf5"} stroke={isDark ? "#1e2433" : "#dde3ec"} strokeWidth="0.5" rx="1" opacity="0.6" />
                                );
                              }
                            }
                          }
                          return cells;
                        })()}
                        <rect
                          x={z.x + 4} y={z.y + 4} width={36} height={16} rx="3"
                          fill={isMax ? "rgba(239,68,68,0.95)" : isRec ? "rgba(14,165,233,0.9)" : isDark ? "rgba(30,36,51,0.95)" : "rgba(241,245,249,0.95)"}
                          stroke={isMax ? "#ef4444" : isRec ? "#38bdf8" : isDark ? "#475569" : "#cbd5e1"} strokeWidth="1"
                        />
                        <text
                          x={z.x + 22} y={z.y + 15}
                          fill={isDark || isMax || isRec ? "#f8fafc" : "#0f172a"}
                          fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle"
                        >
                          {z.id}
                        </text>
                        {isHot && (
                          <g>
                            <circle
                              cx={z.x + z.w - 15} cy={z.y + 15} r="12" fill={isDark ? "#0b0e14" : "#ffffff"}
                              stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="1"
                            />
                            <text
                              x={z.x + z.w - 15} y={z.y + 19}
                              fill={theme.palette.text.primary}
                              fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle"
                            >
                              {block!.count}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                {data && (
                  <g
                    filter="url(#heatglow)"
                    style={{ mixBlendMode: isDark ? "screen" : "normal", pointerEvents: "none" }}
                    opacity={isDark ? 0.9 : 0.8}
                  >
                    {getZones(data.layout)
                      .map((z: ZoneData) => {
                        const block = data.blocks[z.id];
                        if (!block || block.count === 0) return null;
                        const tier = highCountIds.includes(z.id) ? "High" : mediumIds.includes(z.id) ? "Medium" : "Low";
                        return { z, tier };
                      })
                      .filter((item): item is { z: ZoneData; tier: string } => item !== null)
                      .sort((a, b) => {
                        const idx: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
                        return (idx[a.tier] ?? 0) - (idx[b.tier] ?? 0);
                      })
                      .map(({ z, tier }) => {
                        const scale = tier === "High" ? 2.0 : tier === "Medium" ? 1.65 : 1.3;
                        const gradId = tier === "High" ? "gradHigh" : tier === "Medium" ? "gradMedium" : "gradLow";
                        return <ellipse key={`heat-${z.id}`} cx={z.x + z.w / 2} cy={z.y + z.h / 2} rx={z.w * scale} ry={z.h * scale} fill={`url(#${gradId})`} />;
                      })}
                  </g>
                )}

                {[200, 320, 540, 660].map((cx, i) => <STS key={`top-${i}`} x={cx} y={120} rot={0} isDark={isDark} />)}
                {[200, 320, 540, 660].map((cx, i) => <STS key={`bot-${i}`} x={cx} y={700} rot={180} isDark={isDark} />)}
                {[220, 340, 500, 620].map((cy, i) => <STS key={`right-${i}`} x={960} y={cy} rot={90} isDark={isDark} />)}

                {BERTHS.map((berth) => {
                  const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
                  if (!isTarget) return null;
                  const shipName = data ? data.vessel : "TARGET VESSEL";
                  const shipColor = isDark ? "#0284c7" : "#0ea5e9";
                  return <Ship key={berth.id} x={berth.x} y={berth.y} w={280} h={60} name={shipName} color={shipColor} rot={berth.rot} isTarget={isTarget} isDark={isDark} />;
                })}

                {BERTHS.map((berth) => {
                  const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
                  return (
                    <text
                      key={`label-${berth.id}`}
                      x={berth.lx} y={berth.ly} transform={`rotate(${berth.labelRot}, ${berth.lx}, ${berth.ly})`}
                      fill={isTarget ? "#0ea5e9" : isDark ? "#94a3b8" : "#475569"}
                      fontSize="11" fontFamily="sans-serif" textAnchor="middle" fontWeight="800" letterSpacing="1px"
                      style={{ textShadow: isDark ? "0 2px 4px rgba(0,0,0,0.5)" : "0 2px 4px rgba(255,255,255,0.8)" }}
                    >
                      {berth.label}
                    </text>
                  );
                })}
              </svg>
            </TransformComponent>
          </Box>
        )}
      </TransformWrapper>

      <Box sx={{ position: "absolute", top: { xs: 88, lg: "auto" }, bottom: { xs: "auto", lg: 24 }, right: { xs: 16, lg: "auto" }, left: { xs: "auto", lg: 24 }, zIndex: 100 }}>
        <Box sx={{ display: "flex", alignItems: { xs: "flex-start", lg: "center" }, flexDirection: { xs: "column", lg: "row" }, gap: { xs: 1.5, lg: 1.2 }, px: { xs: 1.5, lg: 1.2 }, py: { xs: 1, lg: 0.4 }, bgcolor: isDark ? "rgba(18, 22, 31, 0.9)" : "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(4px)", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          <Typography sx={{ display: { xs: "none", lg: "block" }, fontSize: "0.45rem", color: "text.secondary", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", mr: 0.2 }}>Concentration</Typography>
          {[{ c: "#ff0000", l: "High" }, { c: "#ffaa00", l: "Medium" }, { c: "#00ff00", l: "Low" }].map(({ c, l }) => (
            <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: { xs: 7, lg: 6 }, height: { xs: 7, lg: 6 }, bgcolor: c, borderRadius: "1px" }} />
              <Typography sx={{ fontSize: { xs: "0.6rem", lg: "0.55rem" }, color: "text.secondary", fontWeight: 500 }}>{l}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}