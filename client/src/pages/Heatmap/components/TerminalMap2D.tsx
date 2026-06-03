import { useState } from "react";
import { Box, Typography, useTheme, IconButton, Tooltip, useMediaQuery } from "@mui/material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { RestartAltRounded } from "@mui/icons-material";

import type { VesselHeatmapViewData } from "../../../types/heatmap";
import {
  buildTerminalGeometry,
  polygonToSvgPoints,
  n2svg,
  berthRotationDeg,
  type BerthInfo,
  type RawTerminalLayout,
} from "../utils/terminalGeometry";

// ── Constants ────────────────────────────────────────────────────────────────

/** SVG viewport size — all normalised coords map into this box */
const SVG_W = 1100;
const SVG_H = 900;
/** Padding so the yard boundary isn't flush with the edge */
const PAD_X = 60;
const PAD_Y = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a normalised point to SVG space with padding */
function np(nx: number, ny: number): { x: number; y: number } {
  return n2svg(nx, ny, SVG_W, SVG_H, PAD_X, PAD_Y);
}

/** Polygon → SVG points string with padding */
function svgPts(poly: { x: number; y: number }[]): string {
  return polygonToSvgPoints(poly, SVG_W, SVG_H, PAD_X, PAD_Y);
}

// ── Sub-components ───────────────────────────────────────────────────────────

const Controls = ({ resetTransform }: { resetTransform: () => void }) => (
  <Box
    sx={{
      position: "absolute",
      top: { xs: 52, lg: "auto" },
      bottom: { xs: "auto", lg: 16 },
      right: 16,
      zIndex: 100,
    }}
  >
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

/** Shore-to-ship crane — placed at berth positions */
const STS = ({
  x,
  y,
  rot,
  isDark,
}: {
  x: number;
  y: number;
  rot: number;
  isDark: boolean;
}) => (
  <g
    transform={`translate(${x}, ${y}) rotate(${rot})`}
    style={{ pointerEvents: "none" }}
  >
    <rect
      x={-20}
      y={10}
      width={10}
      height={50}
      fill={isDark ? "#475569" : "#64748b"}
    />
    <rect
      x={10}
      y={10}
      width={10}
      height={50}
      fill={isDark ? "#475569" : "#64748b"}
    />
    <rect
      x={-25}
      y={20}
      width={50}
      height={6}
      fill={isDark ? "#64748b" : "#94a3b8"}
    />
    <rect x={-3} y={-40} width={6} height={60} fill="#0ea5e9" />
    <rect x={-2} y={-80} width={4} height={100} fill="#0ea5e9" />
    <rect x={-2} y={20} width={4} height={40} fill="#0ea5e9" />
    <rect
      x={-5}
      y={-60}
      width={10}
      height={6}
      fill={isDark ? "#e2e8f0" : "#ffffff"}
    />
  </g>
);

/** Vessel silhouette drawn at a berth */
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

const Ship = ({
  x,
  y,
  w,
  h,
  name,
  color,
  rot = 0,
  isTarget = false,
  isDark,
}: ShipProps) => (
  <g
    transform={`translate(${x}, ${y}) rotate(${rot})`}
    style={{ pointerEvents: "none" }}
  >
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
      <path
        d={`M 45,6 L ${w - 20},6 L ${w - 20},${h - 6} L 45,${h - 6} Z`}
        fill="rgba(0,0,0,0.15)"
      />
      {Array.from({ length: Math.floor(w / 35) }).map((_, i) => (
        <g key={i} transform={`translate(${45 + i * 28}, 8)`}>
          <rect
            width={24}
            height={h - 16}
            rx={1}
            fill={isDark ? "#334155" : "#94a3b8"}
            opacity="0.8"
          />
          <line
            x1={12}
            y1={2}
            x2={12}
            y2={h - 18}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
          />
        </g>
      ))}
      <g transform={`translate(${w - 65}, ${h / 2 - 18})`}>
        <rect
          width={35}
          height={36}
          rx={2}
          fill={isDark ? "#f8fafc" : "#ffffff"}
          stroke="#64748b"
          strokeWidth={0.5}
        />
        <rect x={2} y={5} width={8} height={26} rx={1} fill="#0ea5e9" opacity={0.6} />
        <rect
          x={12}
          y={10}
          width={15}
          height={16}
          rx={1}
          fill={isDark ? "#e2e8f0" : "#f1f5f9"}
        />
        <line x1={20} y1={5} x2={20} y2={10} stroke="#475569" strokeWidth={2} />
        <line x1={15} y1={5} x2={25} y2={5} stroke="#475569" strokeWidth={1} />
      </g>
      <rect
        x={w - 25}
        y={h / 2 - 6}
        width={12}
        height={12}
        rx={2}
        fill="#ef4444"
      />
      <circle cx={w - 19} cy={h / 2} r={3} fill="#1e293b" />
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

// ── Block zone helpers ────────────────────────────────────────────────────────

interface ZoneData {
  id: string;
  /** SVG pixel coords */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Convert the VesselHeatmapViewData layout (normalised x/y/w/h from XML)
 * into SVG-pixel ZoneData.
 */
function getZones(layout: Record<string, any>): ZoneData[] {
  if (!layout || !Object.keys(layout).length) return [];

  return Object.entries(layout)
    .filter(([, pos]) => pos && pos.x >= 0 && pos.y >= 0) // skip ghost blocks (x:-1)
    .map(([id, pos]) => {
      const { x: sx, y: sy } = np(pos.x, pos.y);
      // w/h are normalised extents; convert to pixel extents
      const pw = (pos.w ?? 0.08) * (SVG_W - 2 * PAD_X);
      const ph = (pos.h ?? 0.025) * (SVG_H - 2 * PAD_Y);
      return {
        id,
        x: sx - pw / 2,
        y: sy - ph / 2,
        w: pw,
        h: ph,
      };
    });
}

// ── Main Component ────────────────────────────────────────────────────────────

interface TerminalMap2DProps {
  data: VesselHeatmapViewData | null;
  loading: boolean;
  targetBerthId?: string;
}

export default function TerminalMap2D({
  data,
  loading,
  targetBerthId: propTargetBerthId,
}: TerminalMap2DProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  // ── Derive geometry from XML ────────────────────────────────────────────
  const geo = buildTerminalGeometry(
    (data as any)?.terminalLayout as RawTerminalLayout | null,
  );

  // Use XML berths when available; the IDs come directly from the XML berth names
  const activeBerths: BerthInfo[] =
    geo.berths.length > 0
      ? geo.berths
      : // Fallback: synthesise berth info from the berths field on data
      Object.entries(data?.berths ?? {}).map(([id, pts]) => {
        const polygon = (pts as { x: number; y: number }[]).map(p => p);
        const cx =
          polygon.reduce((s, p) => s + p.x, 0) / (polygon.length || 1);
        const cy =
          polygon.reduce((s, p) => s + p.y, 0) / (polygon.length || 1);
        return { id, cx, cy, polygon, facing_deg: 0 };
      });

  // ── Target berth ────────────────────────────────────────────────────────
  const targetBerthId = propTargetBerthId ?? (data as any)?.targetBerthId ?? null;

  // ── Compute max block (for tooltip / highlight) ──────────────────────────
  let computedMaxBlock: string | null = null;
  if (data) {
    let maxCount = -1;
    Object.entries(data.blocks).forEach(([id, b]) => {
      if (b.count > maxCount) {
        maxCount = b.count;
        computedMaxBlock = id;
      }
    });
  }

  // ── Yard boundary and block-outline shapes from XML ──────────────────────
  const yardPolygon = geo.yardPolygon;
  const blockOutlines = geo.blocks; // use for background outlines

  // ── Colours ──────────────────────────────────────────────────────────────
  const bgColor = isDark ? "#061324" : "#e0f2fe";
  const roadColor = isDark ? "#1e2433" : "#b4bfce";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        bgcolor: bgColor,
      }}
    >
      <style>{`
        @keyframes scan {
          0%  { transform: translateY(-120px) }
          100%{ transform: translateY(950px)  }
        }
        .zone-block { transition: filter 0.2s; }
        .zone-block:hover { filter: brightness(1.1); }
        @media (max-width: 900px) {
          .hide-on-mobile { display: none !important; }
        }
      `}</style>

      {/* Scan line shown while loading */}
      {loading && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 120,
            background:
              "linear-gradient(transparent,rgba(56,189,248,0.18),transparent)",
            animation: "scan 1.8s linear infinite",
            pointerEvents: "none",
            zIndex: 99,
          }}
        />
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Box
          sx={{
            position: "absolute",
            top: { xs: "auto", md: "50%" },
            bottom: { xs: 48, md: "auto" },
            left: { xs: 16, md: 24 },
            transform: { xs: "none", md: "translateY(-50%)" },
            zIndex: 10,
            px: { xs: 1.25, md: 2 },
            py: { xs: 0.75, md: 1.4 },
            bgcolor: isDark
              ? "rgba(18,22,31,0.95)"
              : "rgba(255,255,255,0.97)",
            border: "1px solid",
            borderColor: "primary.main",
            borderRadius: 1,
            minWidth: { xs: 110, md: 140 },
          }}
        >
          <Typography
            sx={{
              fontSize: { xs: "0.65rem", md: "0.72rem" },
              color: "primary.main",
              fontWeight: 800,
            }}
          >
            BLOCK {hovered}
          </Typography>
          {data?.blocks?.[hovered] && (
            <Typography
              sx={{
                fontSize: { xs: "0.75rem", md: "0.85rem" },
                color: "text.primary",
                fontWeight: 700,
                mt: 0.5,
              }}
            >
              Volume:{" "}
              <span style={{ color: isDark ? "#38bdf8" : "#0284c7" }}>
                {data.blocks[hovered].count} CTN
              </span>
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
          <Box
            sx={{ width: "100%", height: "100%", position: "relative" }}
          >
            <Controls resetTransform={resetTransform} />

            <TransformComponent
              wrapperStyle={{
                width: "100%",
                height: "100%",
                willChange: "transform",
              }}
              contentStyle={{ willChange: "transform" }}
            >
              <svg
                width={SVG_W}
                height={SVG_H}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                style={{ display: "block" }}
              >
                <defs>
                  {/* Sea gradient */}
                  <linearGradient
                    id="seaGrad2d"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop
                      offset="0%"
                      stopColor={isDark ? "#061524" : "#bae6fd"}
                    />
                    <stop
                      offset="100%"
                      stopColor={isDark ? "#020813" : "#7dd3fc"}
                    />
                  </linearGradient>

                  {/* Heat gradients */}
                  <radialGradient id="gradHigh2d" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff0000" stopOpacity="1" />
                    <stop offset="30%" stopColor="#ff0000" stopOpacity="0.9" />
                    <stop offset="60%" stopColor="#ff4444" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="gradMedium2d" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff8800" stopOpacity="1" />
                    <stop offset="30%" stopColor="#ff8800" stopOpacity="0.85" />
                    <stop offset="60%" stopColor="#ffaa44" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#ff8800" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="gradLow2d" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#00ff00" stopOpacity="1" />
                    <stop offset="30%" stopColor="#00ff00" stopOpacity="0.85" />
                    <stop offset="60%" stopColor="#44ff44" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#00ff00" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* ── Sea background ─────────────────────────────────── */}
                <rect
                  x={0}
                  y={0}
                  width={SVG_W}
                  height={SVG_H}
                  fill="url(#seaGrad2d)"
                />

                {/* Wave lines */}
                <g
                  opacity={isDark ? "0.15" : "0.35"}
                  style={{ pointerEvents: "none" }}
                  className="hide-on-mobile"
                >
                  {Array.from({ length: 40 }).map((_, i) => (
                    <path
                      key={i}
                      d={`M 0,${i * 25} Q 150,${i * 25 - 10} 300,${i * 25
                        } T 600,${i * 25} T 900,${i * 25} T ${SVG_W},${i * 25}`}
                      fill="none"
                      stroke={isDark ? "#38bdf8" : "#0284c7"}
                      strokeWidth="1.5"
                    />
                  ))}
                </g>

                {/* ── Yard boundary (from XML) ────────────────────────── */}
                {yardPolygon.length > 0 ? (
                  <polygon
                    points={svgPts(yardPolygon)}
                    fill={isDark ? "#0f1219" : "#dde3ec"}
                    stroke={isDark ? "#272e3d" : "#cbd5e1"}
                    strokeWidth={2}
                  />
                ) : (
                  /* Fallback rectangle yard when no XML */
                  <rect
                    x={PAD_X}
                    y={PAD_Y}
                    width={SVG_W - 2 * PAD_X}
                    height={SVG_H - 2 * PAD_Y}
                    fill={isDark ? "#0f1219" : "#dde3ec"}
                    stroke={isDark ? "#272e3d" : "#cbd5e1"}
                    strokeWidth={2}
                  />
                )}

                {/* ── Block outlines (from XML geometry, faint) ──────── */}
                {blockOutlines.map(blk =>
                  blk.polygon.length > 2 ? (
                    <polygon
                      key={`outline-${blk.id}`}
                      points={svgPts(blk.polygon)}
                      fill={isDark ? "#1e2433" : "#c8d3e0"}
                      stroke={isDark ? "#334155" : "#94a3b8"}
                      strokeWidth={0.8}
                      opacity={0.5}
                    />
                  ) : null,
                )}

                {/* ── Road lanes (light divider lines between zones) ──── */}
                <g opacity={0.4} style={{ pointerEvents: "none" }}>
                  {getZones(data?.layout ?? {}).map(z => (
                    <rect
                      key={`road-${z.id}`}
                      x={z.x - 4}
                      y={z.y - 4}
                      width={z.w + 8}
                      height={z.h + 8}
                      rx={3}
                      fill="none"
                      stroke={roadColor}
                      strokeWidth={1}
                    />
                  ))}
                </g>

                {/* ── Block zones ─────────────────────────────────────── */}
                {data &&
                  getZones(data.layout).map(z => {
                    const block = data.blocks[z.id];
                    const isHot = !!block && block.count > 0;
                    const conc = block?.concentration || "Low";
                    const isHigh = conc === "High";
                    const isMed = conc === "Medium";
                    const isMax = z.id === (computedMaxBlock ?? data.max_block);
                    const isHover = hovered === z.id;

                    return (
                      <g
                        key={z.id}
                        className="zone-block"
                        onMouseEnter={() => setHovered(z.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: "pointer" }}
                      >
                        {/* Zone background */}
                        <rect
                          x={z.x}
                          y={z.y}
                          width={z.w}
                          height={z.h}
                          fill={isDark ? "#161b24" : "#ffffff"}
                          stroke={
                            isHover
                              ? "#fcd34d"
                              : isHot
                                ? isHigh
                                  ? "#ef4444"
                                  : isMed
                                    ? "#f97316"
                                    : "#10b981"
                                : isDark
                                  ? "#334155"
                                  : "#cbd5e1"
                          }
                          strokeWidth={isHover || isHigh ? 2.5 : isHot ? 1.5 : 1}
                          rx={3}
                        />

                        {/* Container grid fill */}
                        {(() => {
                          if (!isHot) return null;
                          const maxCols = 4;
                          const maxRows = 7;
                          const count = Math.min(
                            block!.count,
                            maxCols * maxRows,
                          );

                          if (isMobile) {
                            const fillPct = Math.min(1, count / (maxCols * maxRows));
                            return (
                              <g>
                                <rect
                                  x={z.x + 4}
                                  y={z.y + 4}
                                  width={z.w - 8}
                                  height={z.h - 8}
                                  fill={isDark ? "#0b0e14" : "#e8edf5"}
                                  rx={2}
                                />
                                <rect
                                  x={z.x + 4}
                                  y={z.y + 4 + (z.h - 8) * (1 - fillPct)}
                                  width={z.w - 8}
                                  height={(z.h - 8) * fillPct}
                                  fill={
                                    isHigh
                                      ? "#ef4444"
                                      : isMed
                                        ? "#f97316"
                                        : "#10b981"
                                  }
                                  rx={2}
                                  opacity={0.8}
                                />
                              </g>
                            );
                          }

                          const cellW = Math.max(
                            8,
                            Math.floor((z.w - 8) / maxCols),
                          );
                          const cellH = Math.max(
                            6,
                            Math.floor((z.h - 8) / maxRows),
                          );
                          const cells = [];
                          for (let row = 0; row < maxRows; row++) {
                            for (let col = 0; col < maxCols; col++) {
                              const idx = row * maxCols + col;
                              const loaded = idx < count;
                              const cx = z.x + 4 + col * cellW;
                              const cy = z.y + 4 + row * cellH;
                              if (loaded) {
                                const fill =
                                  (row * maxCols + col) % 2 === 0
                                    ? "#991b1b"
                                    : "#1d4ed8";
                                cells.push(
                                  <rect
                                    key={`${row}-${col}`}
                                    x={cx}
                                    y={cy}
                                    width={cellW - 1}
                                    height={cellH - 1}
                                    fill={fill}
                                    rx={1}
                                    opacity={0.95}
                                  />,
                                );
                              } else {
                                cells.push(
                                  <rect
                                    key={`${row}-${col}`}
                                    x={cx}
                                    y={cy}
                                    width={cellW - 1}
                                    height={cellH - 1}
                                    fill={
                                      isDark ? "#0b0e14" : "#e8edf5"
                                    }
                                    stroke={
                                      isDark ? "#1e2433" : "#dde3ec"
                                    }
                                    strokeWidth={0.5}
                                    rx={1}
                                    opacity={0.6}
                                  />,
                                );
                              }
                            }
                          }
                          return cells;
                        })()}

                        {/* Block ID badge */}
                        <rect
                          x={z.x + 4}
                          y={z.y + 4}
                          width={Math.min(36, z.w - 8)}
                          height={16}
                          rx={3}
                          fill={
                            isHot
                              ? isHigh
                                ? "rgba(239,68,68,0.95)"
                                : isMed
                                  ? "rgba(249,115,22,0.95)"
                                  : "rgba(16,185,129,0.95)"
                              : isDark
                                ? "rgba(30,36,51,0.95)"
                                : "rgba(241,245,249,0.95)"
                          }
                          stroke={
                            isHot
                              ? isHigh
                                ? "#ef4444"
                                : isMed
                                  ? "#f97316"
                                  : "#10b981"
                              : isDark
                                ? "#475569"
                                : "#cbd5e1"
                          }
                          strokeWidth={1}
                        />
                        <text
                          x={z.x + 4 + Math.min(36, z.w - 8) / 2}
                          y={z.y + 15}
                          fill={isDark || isMax ? "#f8fafc" : "#0f172a"}
                          fontSize={Math.min(10, (z.w - 8) / 4)}
                          fontWeight="800"
                          fontFamily="sans-serif"
                          textAnchor="middle"
                        >
                          {z.id}
                        </text>

                        {/* Count badge */}
                        {isHot && (
                          <g>
                            <circle
                              cx={z.x + z.w - 14}
                              cy={z.y + 14}
                              r={12}
                              fill={isDark ? "#0b0e14" : "#ffffff"}
                              stroke={isDark ? "#475569" : "#cbd5e1"}
                              strokeWidth={1}
                            />
                            <text
                              x={z.x + z.w - 14}
                              y={z.y + 18}
                              fill={theme.palette.text.primary}
                              fontSize={9}
                              fontWeight="800"
                              fontFamily="sans-serif"
                              textAnchor="middle"
                            >
                              {block!.count}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                {/* ── Heat overlay ─────────────────────────────────────── */}
                {data && (
                  <g
                    style={{
                      mixBlendMode: isDark ? "screen" : "normal",
                      pointerEvents: "none",
                    }}
                    opacity={isDark ? 0.9 : 0.8}
                  >
                    {getZones(data.layout)
                      .map(z => {
                        const block = data.blocks[z.id];
                        if (!block || block.count === 0) return null;
                        const tier = block.concentration || "Low";
                        return { z, tier };
                      })
                      .filter(
                        (item): item is { z: ZoneData; tier: "High" | "Medium" | "Low" } =>
                          item !== null,
                      )
                      .sort((a, b) => {
                        const idx: Record<string, number> = {
                          Low: 1,
                          Medium: 2,
                          High: 3,
                        };
                        return (
                          (idx[a.tier] ?? 0) - (idx[b.tier] ?? 0)
                        );
                      })
                      .map(({ z, tier }) => {
                        const scale =
                          tier === "High" ? 1.4 : tier === "Medium" ? 1.25 : 1.1;
                        const gradId =
                          tier === "High"
                            ? "gradHigh2d"
                            : tier === "Medium"
                              ? "gradMedium2d"
                              : "gradLow2d";
                        return (
                          <ellipse
                            key={`heat-${z.id}`}
                            cx={z.x + z.w / 2}
                            cy={z.y + z.h / 2}
                            rx={z.w * scale}
                            ry={z.h * scale}
                            fill={`url(#${gradId})`}
                          />
                        );
                      })}
                  </g>
                )}

                {/* ── Berths (from XML geometry) ────────────────────────── */}
                {activeBerths.map(berth => {
                  const isTarget = targetBerthId === berth.id;
                  const { x: bx, y: by } = np(berth.cx, berth.cy);
                  const rotDeg = berthRotationDeg(berth);

                  return (
                    <g key={`berth-${berth.id}`}>
                      {/* Berth polygon outline */}
                      {berth.polygon.length > 2 && (
                        <polygon
                          points={svgPts(berth.polygon)}
                          fill={
                            isTarget
                              ? "rgba(14,165,233,0.08)"
                              : "rgba(100,116,139,0.05)"
                          }
                          stroke={isTarget ? "#0ea5e9" : isDark ? "#475569" : "#94a3b8"}
                          strokeWidth={isTarget ? 2 : 1}
                          strokeDasharray={isTarget ? "0" : "6 3"}
                        />
                      )}

                      {/* Ship at the berth centroid */}
                      {isTarget && data && (
                        <Ship
                          x={bx}
                          y={by}
                          w={200}
                          h={55}
                          name={data.vessel}
                          color={isDark ? "#0284c7" : "#0ea5e9"}
                          rot={rotDeg}
                          isTarget
                          isDark={isDark}
                        />
                      )}

                      {/* STS cranes flanking the berth */}
                      {isTarget && (
                        <>
                          <STS x={bx - 60} y={by} rot={rotDeg} isDark={isDark} />
                          <STS x={bx + 60} y={by} rot={rotDeg} isDark={isDark} />
                        </>
                      )}

                      {/* Berth label */}
                      <text
                        x={bx}
                        y={by - 22}
                        transform={
                          rotDeg !== 0
                            ? `rotate(${rotDeg}, ${bx}, ${by - 22})`
                            : undefined
                        }
                        fill={isTarget ? "#0ea5e9" : isDark ? "#94a3b8" : "#475569"}
                        fontSize={11}
                        fontFamily="sans-serif"
                        textAnchor="middle"
                        fontWeight="800"
                        letterSpacing="1px"
                      >
                        BERTH {berth.id}
                      </text>

                      {/* Target indicator ring */}
                      {isTarget && (
                        <circle
                          cx={bx}
                          cy={by}
                          r={28}
                          fill="none"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          opacity={0.7}
                        >
                          <animateTransform
                            attributeName="transform"
                            type="rotate"
                            from={`0 ${bx} ${by}`}
                            to={`360 ${bx} ${by}`}
                            dur="8s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>
            </TransformComponent>
          </Box>
        )}
      </TransformWrapper>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: "absolute",
          top: { xs: 88, lg: "auto" },
          bottom: { xs: "auto", lg: 24 },
          right: { xs: 16, lg: "auto" },
          left: { xs: "auto", lg: 24 },
          zIndex: 100,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", lg: "center" },
            flexDirection: { xs: "column", lg: "row" },
            gap: { xs: 1.5, lg: 1.2 },
            px: { xs: 1.5, lg: 1.2 },
            py: { xs: 1, lg: 0.4 },
            bgcolor: isDark
              ? "rgba(18, 22, 31, 0.9)"
              : "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(4px)",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          <Typography
            sx={{
              display: { xs: "none", lg: "block" },
              fontSize: "0.45rem",
              color: "text.secondary",
              fontWeight: 800,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              mr: 0.2,
            }}
          >
            Concentration
          </Typography>
          {[
            { c: "#ff0000", l: "High" },
            { c: "#ffaa00", l: "Medium" },
            { c: "#00ff00", l: "Low" },
          ].map(({ c, l }) => (
            <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={{
                  width: { xs: 7, lg: 6 },
                  height: { xs: 7, lg: 6 },
                  bgcolor: c,
                  borderRadius: "1px",
                }}
              />
              <Typography
                sx={{
                  fontSize: { xs: "0.6rem", lg: "0.55rem" },
                  color: "text.secondary",
                  fontWeight: 500,
                }}
              >
                {l}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}