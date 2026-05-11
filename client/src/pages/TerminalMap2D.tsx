// TerminalMap2D.tsx
import { useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import type { VesselHeatmapResponse } from "../types/vessel";

// ─── Layout constants ─────────────────────────────────────────────────────────
const VIEWBOX_X = -60;
const VIEWBOX_Y = -60;
const VIEWBOX_W = 1270;
const VIEWBOX_H = 960;

const BLK_W = 80, BLK_H = 50, BLK_GAP_X = 20, BLK_GAP_Y = 15;
const BLK_START_X = 60, BLK_START_Y = 150;

function getZones(layout: Record<string, { x: number; y: number }>) {
  return Object.entries(layout || {}).map(([id, pos]) => ({
    id,
    x: BLK_START_X + pos.x * (BLK_W + BLK_GAP_X),
    y: BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y),
    w: BLK_W,
    h: BLK_H,
  }));
}

const getHeatFill = (c: string) => {
  if (c === "High") return "rgba(239, 68, 68, 0.9)";
  if (c === "Medium") return "rgba(249, 115, 22, 0.75)";
  if (c === "Low") return "rgba(34, 197, 94, 0.65)";
  return "transparent";
};

const BERTHS = [
  { id: "T1", label: "BERTH T1", lx: 260, ly: 140, lrot: 0, x: 260, y: 60, rot: 0, defaultShip: { name: "MSC OSCAR", color: "#1e293b" } },
  { id: "T2", label: "BERTH T2", lx: 600, ly: 140, lrot: 0, x: 600, y: 60, rot: 0, defaultShip: { name: "EVER GIVEN", color: "#1e293b" } },
  { id: "B1", label: "BERTH B1", lx: 260, ly: 680, lrot: 0, x: 260, y: 760, rot: 0, defaultShip: { name: "CMA CGM MARCO POLO", color: "#1e293b" } },
  { id: "B2", label: "BERTH B2", lx: 600, ly: 680, lrot: 0, x: 600, y: 760, rot: 0, defaultShip: { name: "HAPAG-LLOYD", color: "#1e293b" } },
  { id: "R1", label: "BERTH R1", lx: 930, ly: 280, lrot: -90, x: 1010, y: 280, rot: 90, defaultShip: { name: "OOCL HONG KONG", color: "#1e293b" } },
  { id: "R2", label: "BERTH R2", lx: 930, ly: 580, lrot: -90, x: 1010, y: 580, rot: 90, defaultShip: { name: "MAERSK MC-KINNEY", color: "#1e293b" } },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const STS = ({ x, y, rot, isDark }: { x: number; y: number; rot: number; isDark: boolean }) => {
  const craneBase = isDark ? "#475569" : "#cbd5e1";
  const craneTop = isDark ? "#64748b" : "#94a3b8";
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
      <rect x={-20} y={10} width={10} height={50} fill={craneBase} />
      <rect x={10} y={10} width={10} height={50} fill={craneBase} />
      <rect x={-25} y={20} width={50} height={6} fill={craneTop} />
      <rect x={-3} y={-40} width={6} height={60} fill="#38bdf8" />
      <rect x={-2} y={-80} width={4} height={100} fill="#38bdf8" />
      <rect x={-2} y={20} width={4} height={40} fill="#38bdf8" />
      <rect x={-5} y={-60} width={10} height={6} fill={isDark ? "#e2e8f0" : "#f8fafc"} />
    </g>
  );
};

const Ship = ({
  x, y, w, h, name, color, rot = 0, isTarget = false, isDark,
}: {
  x: number; y: number; w: number; h: number; name: string;
  color: string; rot?: number; isTarget?: boolean; isDark: boolean;
}) => {
  const targetHull = isDark ? "#0f172a" : "#e0f2fe";
  const defaultHull = isDark ? color : "#f1f5f9";
  const strokeColor = isTarget ? "#38bdf8" : isDark ? "#0f172a" : "#cbd5e1";
  const bayFill = isDark ? "#334155" : "#cbd5e1";
  const textColor = isTarget
    ? isDark ? "#38bdf8" : "#0284c7"
    : isDark ? "#94a3b8" : "#64748b";

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
      <g transform={`translate(${-w / 2}, ${-h / 2})`}>
        <path
          d={`M 0,${h / 2} L 40,2 L ${w - 15},2 Q ${w},2 ${w},10 L ${w},${h - 10} Q ${w},${h - 2} ${w - 15},${h - 2} L 40,${h - 2} Z`}
          fill={isTarget ? targetHull : defaultHull}
          stroke={strokeColor}
          strokeWidth={isTarget ? 3 : 1.5}
        />
        <path d={`M 45,6 L ${w - 20},6 L ${w - 20},${h - 6} L 45,${h - 6} Z`} fill="rgba(0,0,0,0.2)" />

        {Array.from({ length: Math.floor(w / 35) }).map((_, i) => (
          <g key={i} transform={`translate(${45 + i * 28}, 8)`}>
            <rect width={24} height={h - 16} rx={1} fill={bayFill} opacity="0.8" />
            <line x1={12} y1={2} x2={12} y2={h - 18} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
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
        <circle cx={w - 19} cy={h / 2} r={3} fill={isDark ? "#1e293b" : "#475569"} />
        <rect x={w - 68} y={2} width={10} height={4} rx={2} fill="#f97316" />
        <rect x={w - 68} y={h - 6} width={10} height={4} rx={2} fill="#f97316" />

        <g transform={`translate(${w / 2 - 10}, ${h + 12})`}>
          <text
            fill={textColor}
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
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface TerminalMap2DProps {
  data: VesselHeatmapResponse | null;
  targetBerthId: string;
  computedMaxBlock: string | null;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TerminalMap2D({
  data,
  targetBerthId,
  computedMaxBlock,
  loading,
}: TerminalMap2DProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const bgColor = isDark ? "#0b0e14" : "#f8fafc";
  const gridColor = isDark ? "#38bdf8" : "#0284c7";
  const asphaltFill = isDark ? "url(#asphalt)" : "url(#asphalt-light)";
  const edgeColor = isDark ? "#272e3d" : "#cbd5e1";
  const dockColor = isDark ? "#1e2433" : "#e2e8f0";
  const blockBg = isDark ? "#161b24" : "#ffffff";
  const blockStroke = isDark ? "#334155" : "#cbd5e1";
  const blockDotBg = isDark ? "#0b0e14" : "#f1f5f9";
  const blockDotStr = isDark ? "#1e2433" : "#e2e8f0";
  const textPrimary = isDark ? "#f8fafc" : "#0f172a";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        bgcolor: bgColor,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes scan2d {
          0%   { transform: translateY(-120px) }
          100% { transform: translateY(100%) }
        }
        .zone-block { transition: filter 0.2s; }
        .zone-block:hover { filter: brightness(1.15); }
      `}</style>

      {/* Loading scan line */}
      {loading && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 120,
            background: isDark
              ? "linear-gradient(transparent,rgba(56,189,248,0.18),transparent)"
              : "linear-gradient(transparent,rgba(2,132,199,0.18),transparent)",
            animation: "scan2d 1.8s linear infinite",
            pointerEvents: "none",
            zIndex: 99,
          }}
        />
      )}

      {/* Legend */}
      <Box
        sx={{
          position: "absolute",
          top: 14,
          right: 16,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 0.8,
          px: 1.8,
          py: 1.2,
          bgcolor: isDark ? "rgba(18,22,31,0.92)" : "rgba(255,255,255,0.92)",
          backdropFilter: "blur(4px)",
          border: "1px solid",
          borderColor: isDark ? "#272e3d" : "#cbd5e1",
          borderRadius: 1,
        }}
      >
        <Typography
          sx={{
            fontSize: "0.52rem",
            color: "text.secondary",
            fontWeight: 800,
            letterSpacing: "1.5px",
            fontFamily: "'Roboto Mono', monospace",
            mb: 0.1,
          }}
        >
          HEAT INDEX
        </Typography>
        {[
          { c: "#ef4444", l: "High" },
          { c: "#f97316", l: "Medium" },
          { c: "#10b981", l: "Low" },
        ].map(({ c, l }) => (
          <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: c, borderRadius: "2px" }} />
            <Typography sx={{ fontSize: "0.6rem", color: "text.primary", fontWeight: 500 }}>
              {l}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Hovered block tooltip */}
      {hovered && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            left: 14,
            zIndex: 10,
            px: 2,
            py: 1.4,
            bgcolor: isDark ? "rgba(18,22,31,0.97)" : "rgba(255,255,255,0.97)",
            border: "1px solid",
            borderColor: "primary.main",
            borderRadius: 1,
            boxShadow: `0 0 16px ${isDark ? "rgba(56,189,248,0.22)" : "rgba(2,132,199,0.18)"}`,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.72rem",
              color: "primary.main",
              fontWeight: 800,
              fontFamily: "'Roboto Mono', monospace",
              letterSpacing: "1px",
            }}
          >
            BLOCK {hovered}
          </Typography>
          {data?.blocks?.[hovered] && (
            <>
              <Typography sx={{ fontSize: "0.66rem", color: "text.primary", mt: 0.4 }}>
                Volume:{" "}
                <span style={{ color: theme.palette.info.main }}>
                  {data.blocks[hovered].count} CTN
                </span>
              </Typography>
              <Typography sx={{ fontSize: "0.66rem", color: "text.primary" }}>
                Density:{" "}
                <span style={{ color: theme.palette.info.main }}>
                  {data.blocks[hovered].concentration}
                </span>
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* SVG — fills entire container via preserveAspectRatio */}
      <svg
        width="100%"
        height="100%"
        viewBox={`${VIEWBOX_X} ${VIEWBOX_Y} ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", flex: 1 }}
      >
        <defs>
          <filter id="unifiedHeat">
            <feGaussianBlur stdDeviation="35" />
          </filter>
          <pattern id="asphalt" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="#0f1219" />
            <rect width="40" height="40" fill="#161b24" opacity="0.5" />
          </pattern>
          <pattern id="asphalt-light" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="#e2e8f0" />
            <rect width="40" height="40" fill="#cbd5e1" opacity="0.5" />
          </pattern>
        </defs>

        {/* Background */}
        <rect
          x={VIEWBOX_X}
          y={VIEWBOX_Y}
          width={VIEWBOX_W}
          height={VIEWBOX_H}
          fill={bgColor}
        />

        {/* Wave grid */}
        <g opacity={isDark ? 0.2 : 0.3}>
          {Array.from({ length: Math.ceil(VIEWBOX_H / 30) + 2 }).map((_, i) => (
            <path
              key={i}
              d={`M ${VIEWBOX_X},${VIEWBOX_Y + i * 30} Q 0,${VIEWBOX_Y + i * 30 - 10} 200,${VIEWBOX_Y + i * 30} T 600,${VIEWBOX_Y + i * 30} T 1000,${VIEWBOX_Y + i * 30} T 1400,${VIEWBOX_Y + i * 30}`}
              fill="none"
              stroke={gridColor}
              strokeWidth="1.5"
            />
          ))}
        </g>

        {/* Terminal apron (Extends to the West to show peninsular topography) */}
        <path d="M -60,120 L 960,120 L 960,700 L -60,700 Z" fill={asphaltFill} stroke={edgeColor} strokeWidth="2" />

        {/* Quay walls (Ensuring 3-sided water boundaries: North, South, East) */}
        <rect x="-60" y="120" width="1020" height="15" fill={dockColor} />
        <line x1="-60" y1="125" x2="960" y2="125" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />
        <rect x="-60" y="685" width="1020" height="15" fill={dockColor} />
        <line x1="-60" y1="695" x2="960" y2="695" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />
        <rect x="945" y="120" width="15" height="580" fill={dockColor} />
        <line x1="955" y1="120" x2="955" y2="700" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

        {/* Drive lanes properly woven between blocks */}
        {[130, 410, 620].map((ly) => (
          <g key={ly}>
            <rect x="-60" y={ly} width="1005" height="20" fill={bgColor} opacity={isDark ? 0.8 : 0.5} />
            <line
              x1="-60" y1={ly + 10} x2="945" y2={ly + 10}
              stroke={blockStroke} strokeWidth="1" strokeDasharray="16 8"
            />
          </g>
        ))}
        {[140, 340, 540, 740, 940].map((lx) => (
          <rect key={lx} x={lx} y="120" width="20" height="580" fill={bgColor} opacity={isDark ? 0.7 : 0.5} />
        ))}

        {/* Block zones */}
        {data &&
          getZones(data.layout).map((z) => {
            const block = (data.blocks || {})[z.id];
            const isHot = !!block && block.count > 0;
            const isMax = z.id === computedMaxBlock;
            const isRec =
              typeof data.recommended_berth === "string"
                ? data.recommended_berth.includes(z.id)
                : Array.isArray(data.recommended_berth)
                  ? (data.recommended_berth as string[]).includes(z.id)
                  : false;
            const isH = hovered === z.id;

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
                    x={z.x - 4} y={z.y - 4}
                    width={z.w + 8} height={z.h + 8}
                    rx="5" fill="none"
                    stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="8 4" opacity="0.9"
                  />
                )}

                <rect
                  x={z.x} y={z.y} width={z.w} height={z.h}
                  fill={blockBg}
                  stroke={isH ? "#fcd34d" : isMax ? "#ef4444" : isRec ? "#38bdf8" : blockStroke}
                  strokeWidth={isH || isMax ? 2.5 : isRec ? 2 : 1}
                  rx="3"
                />

                {/* Slot dots correctly scaled */}
                {[0, 1, 2, 3].map((row) =>
                  [0, 1, 2, 3, 4, 5, 6].map((col) => (
                    <rect
                      key={`${row}-${col}`}
                      x={z.x + 4 + col * 10} y={z.y + 16 + row * 8}
                      width="7" height="5"
                      fill={blockDotBg} stroke={blockDotStr} strokeWidth="0.5" rx="1" opacity={0.8}
                    />
                  ))
                )}

                {/* ID badge scaled */}
                <rect
                  x={z.x + 2} y={z.y + 2} width={30} height={12} rx="2"
                  fill={
                    isMax ? "rgba(239,68,68,0.95)"
                      : isRec ? "rgba(14,165,233,0.9)"
                        : isDark ? "rgba(30,36,51,0.95)" : "rgba(241,245,249,0.95)"
                  }
                  stroke={isMax ? "#ef4444" : isRec ? "#38bdf8" : isDark ? "#475569" : "#cbd5e1"}
                  strokeWidth="1"
                />
                <text
                  x={z.x + 17} y={z.y + 10}
                  fill={isMax || isRec ? "#ffffff" : textPrimary}
                  fontSize="7" fontWeight="800" fontFamily="sans-serif" textAnchor="middle"
                >
                  {z.id}
                </text>

                {/* Count badge scaled */}
                {isHot && (
                  <g>
                    <circle cx={z.x + z.w - 10} cy={z.y + 8} r="7" fill={bgColor} stroke={blockStroke} strokeWidth="1" />
                    <text
                      x={z.x + z.w - 10} y={z.y + 11}
                      fill={textPrimary} fontSize="7" fontWeight="800"
                      fontFamily="sans-serif" textAnchor="middle"
                    >
                      {block.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Consolidated Unified Heat blobs mapped exactly as requested */}
        {data && (
          <g
            filter="url(#unifiedHeat)"
            style={{ mixBlendMode: isDark ? "screen" : "multiply" }}
            opacity="0.95"
          >
            {getZones(data.layout)
              .map((z) => {
                const block = data.blocks[z.id];
                if (!block || block.count === 0) return null;
                let effectiveConc = block.concentration;
                if (z.id === computedMaxBlock) effectiveConc = "High";
                else if (effectiveConc === "High") effectiveConc = "Medium";
                return { z, effectiveConc };
              })
              .filter((item): item is { z: ReturnType<typeof getZones>[0]; effectiveConc: string } => item !== null)
              .sort((a, b) => {
                const idx: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
                return (idx[a.effectiveConc] || 0) - (idx[b.effectiveConc] || 0);
              })
              .map(({ z, effectiveConc }) => {
                // Larger scaling forces fusion of ellipses into one contiguous heat map
                const scale = effectiveConc === "High" ? 2.5 : effectiveConc === "Medium" ? 2.0 : 1.5;
                return (
                  <ellipse
                    key={`heat-${z.id}`}
                    cx={z.x + z.w / 2}
                    cy={z.y + z.h / 2}
                    rx={z.w * scale}
                    ry={z.h * scale}
                    fill={getHeatFill(effectiveConc)}
                  />
                );
              })}
          </g>
        )}

        {/* STS cranes */}
        {[200, 320, 540, 660].map((cx, i) => <STS key={`top-${i}`} x={cx} y={120} rot={0} isDark={isDark} />)}
        {[200, 320, 540, 660].map((cx, i) => <STS key={`bot-${i}`} x={cx} y={700} rot={180} isDark={isDark} />)}
        {[220, 340, 500, 620].map((cy, i) => <STS key={`right-${i}`} x={960} y={cy} rot={90} isDark={isDark} />)}

        {/* Ships */}
        {BERTHS.map((berth) => {
          const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
          const shipName = isTarget ? (data ? data.vessel : "TARGET VESSEL") : berth.defaultShip.name;
          const shipColor = isTarget ? "#0284c7" : berth.defaultShip.color;
          return (
            <Ship
              key={berth.id}
              x={berth.x} y={berth.y}
              w={280} h={60}
              name={shipName} color={shipColor}
              rot={berth.rot} isTarget={isTarget}
              isDark={isDark}
            />
          );
        })}

        {/* Berth labels */}
        {BERTHS.map((berth) => {
          const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
          return (
            <text
              key={`label-${berth.id}`}
              x={berth.lx} y={berth.ly}
              transform={`rotate(${berth.lrot}, ${berth.lx}, ${berth.ly})`}
              fill={isTarget ? (isDark ? "#38bdf8" : "#0284c7") : isDark ? "#94a3b8" : "#64748b"}
              fontSize="11" fontFamily="sans-serif"
              textAnchor="middle" fontWeight="800" letterSpacing="1px"
            >
              {berth.label}
            </text>
          );
        })}
      </svg>
    </Box>
  );
}