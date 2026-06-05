import { useState, useMemo } from "react";
import { Box, Typography, useTheme, IconButton, Tooltip, useMediaQuery } from "@mui/material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { RestartAltRounded } from "@mui/icons-material";

import type { VesselHeatmapViewData } from "../../../types/heatmap";
import {
  buildTerminalGeometry,
  polygonToSvgPoints,
  n2svg,
  berthRotationDeg,
  getSeaPoint,
  type BerthInfo,
  type RawTerminalLayout,
} from "../utils/terminalGeometry";

// ── Constants ────────────────────────────────────────────────────────────────

/** SVG viewport size — all normalised coords map into this box */
const SVG_W = 1100;
const SVG_H = 900;
/** Padding so the yard boundary isn't flush with the edge */
const PAD_X = 120;
const PAD_Y = 120;

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
  w?: number;
  h?: number;
  scale?: number;
  name: string;
  color: string;
  rot?: number;
  isTarget?: boolean;
  isDark: boolean;
}

const Ship = ({
  x,
  y,
  w = 340,
  h = 70,
  scale = 1,
  name,
  color,
  rot = 0,
  isTarget = false,
  isDark,
}: ShipProps) => {
  const hullFill = isTarget ? (isDark ? "#1e293b" : "#f1f5f9") : color;
  const strokeColor = isTarget ? "#0ea5e9" : isDark ? "#0f172a" : "#94a3b8";
  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${rot}) scale(${scale})`}
      style={{ pointerEvents: "none" }}
    >
      <g transform={`translate(${-w / 2}, ${-h / 2})`}>
        {/* Main Hull */}
        <path
          d={`M 0,${h / 2} Q 15,2 45,2 L ${w - 5},2 Q ${w},2 ${w},8 L ${w},${h - 8} Q ${w},${h - 2} ${w - 5},${h - 2} L 45,${h - 2} Q 15,${h - 2} 0,${h / 2} Z`}
          fill={hullFill}
          stroke={strokeColor}
          strokeWidth={isTarget ? 3 : 1.5}
        />
        {/* Bridge / Superstructure */}
        <rect x={w - 70} y={h / 2 - 18} width={45} height={36} fill="#64748b" rx="2" />
        <rect x={w - 60} y={h / 2 - 12} width={25} height={24} fill="#94a3b8" />
        <rect x={w - 50} y={h / 2 - 6} width={12} height={12} fill="#ef4444" rx="6" />

        {/* Containers */}
        <g transform={`translate(55, ${h / 2 - 22})`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={`c1-${i}`} x={i * 24} y={0} width={22} height={20} fill="#ef4444" rx="1" />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={`c2-${i}`} x={i * 24} y={24} width={22} height={20} fill="#3b82f6" rx="1" />
          ))}
        </g>

        {/* Text */}
        <text
          x={w / 2}
          y={h / 7}
          fill={isDark ? "#f8fafc" : "#0f172a"}
          fontSize="10"
          fontWeight="bold"
          fontFamily="sans-serif"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {name}
        </text>
      </g>
    </g>
  );
};

// ── Block zone helpers ────────────────────────────────────────────────────────

interface ZoneData {
  id: string;
  /** SVG pixel coords */
  x: number;
  y: number;
  w: number;
  h: number;
  polygon?: { x: number; y: number }[];
  cx?: number;
  cy?: number;
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
  terminalLayout?: any;
  loading: boolean;
  targetBerthId?: string;
}

export default function TerminalMap2D({
  data,
  terminalLayout: terminalLayoutProp,
  loading,
  targetBerthId: propTargetBerthId,
}: TerminalMap2DProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  // ── Derive geometry from XML ────────────────────────────────────────────
  const effectiveLayout = terminalLayoutProp ?? (data as any)?.terminalLayout;
  const geo = buildTerminalGeometry(
    effectiveLayout as RawTerminalLayout | null,
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

  // ── Yard boundary and block-outline shapes from XML ──────────────────────
  const yardPolygon = geo.yardPolygon;
  const blockOutlines = geo.blocks; // use for background outlines

  // ── Unified Zones (XML geometry or fallback) ─────────────────────────────
  const zones: ZoneData[] = useMemo(() => {
    // 1. If XML geometry available, use it for all blocks
    if (blockOutlines && blockOutlines.length > 0) {
      return blockOutlines.map(geoBlock => {
        const poly = geoBlock.polygon || [];
        if (poly.length === 0) return { id: geoBlock.id, x: 0, y: 0, w: 0, h: 0 };

        const mappedPoly = poly.map(p => {
          const m = np(p.x, p.y);
          return { x: m.x, y: m.y };
        });

        const xs = mappedPoly.map(p => p.x);
        const ys = mappedPoly.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const { x: cx, y: cy } = np(geoBlock.cx, geoBlock.cy);

        return {
          id: geoBlock.id,
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
          polygon: mappedPoly,
          cx,
          cy,
        };
      }).filter(z => z.w > 0 && z.h > 0);
    }

    // 2. Fallback to API layout bounding boxes
    if (!data) return [];
    return getZones(data.layout);
  }, [data, blockOutlines]);

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
        initialScale={0.88}
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
              }}
              contentStyle={{}}
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
                    <stop offset="40%" stopColor="#ff0000" stopOpacity="0.9" />
                    <stop offset="75%" stopColor="#ff3333" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="gradMedium2d" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff6600" stopOpacity="1" />
                    <stop offset="40%" stopColor="#ff6600" stopOpacity="0.9" />
                    <stop offset="75%" stopColor="#ff8833" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#ff6600" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="gradLow2d" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#00cc00" stopOpacity="1" />
                    <stop offset="40%" stopColor="#00cc00" stopOpacity="0.9" />
                    <stop offset="75%" stopColor="#33ff33" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#00cc00" stopOpacity="0" />
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

                {/* ── Road lanes (light divider lines between zones) ──── */}
                <g opacity={0.4} style={{ pointerEvents: "none" }}>
                  {zones.map(z => (
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
                {zones.map(z => {
                  const block = data?.blocks?.[z.id];
                  const isHot = !!block && block.count > 0;
                  const conc = block?.concentration || "Low";
                  const isHigh = conc === "High";
                  const isMed = conc === "Medium";
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
                      {z.polygon && z.polygon.length > 2 ? (
                        <polygon
                          points={z.polygon.map(p => `${p.x},${p.y}`).join(" ")}
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
                        />
                      ) : (
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
                      )}

                      {/* Container grid fill */}
                      {/* Container grid fill */}
                      {(() => {
                        if (!isHot) return null;

                        // If the block is too small, drawing a 10x20 grid of containers
                        // or even a fill bar will completely obscure the text label and block shape.
                        // The solid heatmap background color is sufficient.
                        if (z.w < 30 || z.h < 30) return null;

                        const maxCols = 10;
                        const maxRows = 20;
                        const count = Math.min(
                          block!.count,
                          maxCols * maxRows,
                        );

                        if (isMobile) {
                          const fillPct = Math.min(1, count / (maxCols * maxRows));
                          const innerW = Math.max(0, z.w - 8);
                          const innerH = Math.max(0, z.h - 8);
                          return (
                            <g>
                              <rect
                                x={z.x + 4}
                                y={z.y + 4}
                                width={innerW}
                                height={innerH}
                                fill={isDark ? "#0b0e14" : "#e8edf5"}
                                rx={2}
                              />
                              <rect
                                x={z.x + 4}
                                y={z.y + 4 + innerH * (1 - fillPct)}
                                width={innerW}
                                height={innerH * fillPct}
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

                        const cellW = (z.w - 8) / maxCols;
                        const cellH = (z.h - 8) / maxRows;
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

                      {/* Clean Block Label (Watermark Style) */}
                      <text
                        x={z.x + z.w / 2}
                        y={z.y + z.h / 2 + 2} // +2 for visual vertical center
                        transform={z.h > z.w * 1.5 ? `rotate(-90, ${z.x + z.w / 2}, ${z.y + z.h / 2})` : undefined}
                        fill={isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)"}
                        fontSize={z.id.length > 2 ? 6 : 8}
                        fontWeight="800"
                        fontFamily="sans-serif"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                          pointerEvents: "none",
                          textShadow: isDark
                            ? "0px 0px 6px rgba(0,0,0,0.9), 0px 0px 12px rgba(0,0,0,0.6)"
                            : "0px 0px 6px rgba(255,255,255,0.9), 0px 0px 12px rgba(255,255,255,0.6)"
                        }}
                      >
                        {z.id}
                      </text>

                      {/* Count badge */}
                      {isHot && (
                        <g>
                          <circle
                            cx={z.x + z.w - 7}
                            cy={z.y + 7}
                            r={6}
                            fill={isDark ? "#0b0e14" : "#ffffff"}
                            stroke={isDark ? "#475569" : "#cbd5e1"}
                            strokeWidth={0.5}
                          />
                          <text
                            x={z.x + z.w - 7}
                            y={z.y + 8.5}
                            fill={theme.palette.text.primary}
                            fontSize={5}
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
                    {zones
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
                        const base = Math.sqrt(z.w * z.h);
                        const rx = (base * 0.5 + z.w * 0.5) * scale * 0.8;
                        const ry = (base * 0.5 + z.h * 0.5) * scale * 0.8;
                        const gradId =
                          tier === "High"
                            ? "gradHigh2d"
                            : tier === "Medium"
                              ? "gradMedium2d"
                              : "gradLow2d";
                        return (
                          <ellipse
                            key={`heat-${z.id}`}
                            cx={z.cx ?? z.x + z.w / 2}
                            cy={z.cy ?? z.y + z.h / 2}
                            rx={rx}
                            ry={ry}
                            fill={`url(#${gradId})`}
                          />
                        );
                      })}
                  </g>
                )}

                {/* ── Berths (from XML geometry) ────────────────────────── */}
                {activeBerths.map(berth => {
                  const isTarget = targetBerthId === berth.id;
                  const seaPt = getSeaPoint(berth, 0.10); // Clear the terminal boundary completely
                  const cranePt = getSeaPoint(berth, 0.06); // Place cranes near the terminal edge
                  const { x: sx, y: sy } = np(seaPt.x, seaPt.y); // Ship coordinates (sea)
                  const { x: bx, y: by } = np(cranePt.x, cranePt.y); // Crane coordinates (edge)
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

                      {/* Ship at the sea point */}
                      {isTarget && data && (
                        <Ship
                          x={sx}
                          y={sy}
                          scale={0.7}
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
                        y={by + 40}
                        transform={
                          rotDeg !== 0
                            ? `rotate(${rotDeg}, ${bx}, ${by + 2})`
                            : undefined
                        }
                        fill={isTarget ? "#0ea5e9" : isDark ? "#94a3b8" : "#475569"}
                        fontSize={7.5}
                        fontFamily="sans-serif"
                        textAnchor="middle"
                        fontWeight="800"
                        letterSpacing="0.5px"
                      >
                        BERTH {berth.id}
                      </text>


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