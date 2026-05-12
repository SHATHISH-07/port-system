import { useState } from "react";
import { Box, Typography, useTheme, IconButton, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { CenterFocusStrongRounded, RestartAltRounded } from "@mui/icons-material";

const VIEWBOX = "-50 -50 1250 950";

const BLK_W = 160, BLK_H = 120, BLK_GAP_X = 40, BLK_GAP_Y = 40;
const BLK_START_X = 80, BLK_START_Y = 190;

const BERTHS = [
  { id: "T1", label: "BERTH T1", lx: 260, ly: 140, lrot: 0, x: 260, y: 60, rot: 0, defaultShip: { name: "MSC OSCAR", color: "#1e293b" } },
  { id: "T2", label: "BERTH T2", lx: 600, ly: 140, lrot: 0, x: 600, y: 60, rot: 0, defaultShip: { name: "EVER GIVEN", color: "#1e293b" } },
  { id: "B1", label: "BERTH B1", lx: 260, ly: 680, lrot: 0, x: 260, y: 760, rot: 0, defaultShip: { name: "CMA CGM MARCO POLO", color: "#1e293b" } },
  { id: "B2", label: "BERTH B2", lx: 600, ly: 680, lrot: 0, x: 600, y: 760, rot: 0, defaultShip: { name: "HAPAG-LLOYD", color: "#1e293b" } },
  { id: "R1", label: "BERTH R1", lx: 930, ly: 280, lrot: -90, x: 1010, y: 280, rot: 90, defaultShip: { name: "OOCL HONG KONG", color: "#1e293b" } },
  { id: "R2", label: "BERTH R2", lx: 930, ly: 580, lrot: -90, x: 1010, y: 580, rot: 90, defaultShip: { name: "MAERSK MC-KINNEY", color: "#1e293b" } },
];

function getZones(layout: Record<string, { x: number, y: number }>) {
  return Object.entries(layout || {}).map(([id, pos]) => ({
    id,
    x: BLK_START_X + pos.x * (BLK_W + BLK_GAP_X),
    y: BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y),
    w: BLK_W,
    h: BLK_H,
  }));
}

const Controls = ({ resetTransform }: { resetTransform: () => void }) => {
  return (
    <Box sx={{ position: "absolute", bottom: 24, right: 24, zIndex: 100, display: "flex", gap: 1 }}>
      <Tooltip title="Reset View">
        <IconButton 
          onClick={() => resetTransform()} 
          sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: 3, "&:hover": { bgcolor: "action.hover" } }}
        >
          <RestartAltRounded />
        </IconButton>
      </Tooltip>
      <Tooltip title="Center View">
        <IconButton 
          onClick={() => resetTransform()} 
          sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: 3, "&:hover": { bgcolor: "action.hover" } }}
        >
          <CenterFocusStrongRounded />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const STS = ({ x, y, rot }: { x: number; y: number; rot: number }) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`} style={{ pointerEvents: "none" }}>
    <rect x={-20} y={10} width={10} height={50} fill="#475569" />
    <rect x={10} y={10} width={10} height={50} fill="#475569" />
    <rect x={-25} y={20} width={50} height={6} fill="#64748b" />
    <rect x={-3} y={-40} width={6} height={60} fill="#38bdf8" />
    <rect x={-2} y={-80} width={4} height={100} fill="#38bdf8" />
    <rect x={-2} y={20} width={4} height={40} fill="#38bdf8" />
    <rect x={-5} y={-60} width={10} height={6} fill="#e2e8f0" />
  </g>
);

const Ship = ({ x, y, w, h, name, color, rot = 0, isTarget = false }: any) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`} style={{ pointerEvents: "none" }}>
    <g transform={`translate(${-w / 2}, ${-h / 2})`}>
      <path
        d={`M 0,${h / 2} L 40,2 L ${w - 15},2 Q ${w},2 ${w},10 L ${w},${h - 10} Q ${w},${h - 2} ${w - 15},${h - 2} L 40,${h - 2} Z`}
        fill={isTarget ? "#0f172a" : color}
        stroke={isTarget ? "#38bdf8" : "#0f172a"}
        strokeWidth={isTarget ? 3 : 1.5}
      />
      <path d={`M 45,6 L ${w - 20},6 L ${w - 20},${h - 6} L 45,${h - 6} Z`} fill="rgba(0,0,0,0.2)" />
      {Array.from({ length: Math.floor(w / 35) }).map((_, i) => (
        <g key={i} transform={`translate(${45 + i * 28}, 8)`}>
          <rect width={24} height={h - 16} rx={1} fill="#334155" opacity="0.8" />
          <line x1={12} y1={2} x2={12} y2={h - 18} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        </g>
      ))}
      <g transform={`translate(${w - 65}, ${h / 2 - 18})`}>
        <rect width={35} height={36} rx={2} fill="#f8fafc" stroke="#64748b" strokeWidth={0.5} />
        <rect x={2} y={5} width={8} height={26} rx={1} fill="#0ea5e9" opacity={0.6} />
        <rect x={12} y={10} width={15} height={16} rx={1} fill="#e2e8f0" />
        <line x1={20} y1={5} x2={20} y2={10} stroke="#475569" strokeWidth={2} />
        <line x1={15} y1={5} x2={25} y2={5} stroke="#475569" strokeWidth={1} />
      </g>
      <rect x={w - 25} y={h / 2 - 6} width={12} height={12} rx={2} fill="#ef4444" />
      <circle cx={w - 19} cy={h / 2} r={3} fill="#1e293b" />
      <rect x={w - 68} y={2} width={10} height={4} rx={2} fill="#f97316" />
      <rect x={w - 68} y={h - 6} width={10} height={4} rx={2} fill="#f97316" />
      <g transform={`translate(${w / 2 - 10}, ${h + 12})`}>
        <text fill={isTarget ? "#38bdf8" : "#94a3b8"} fontSize="11" fontWeight="800" fontFamily="'Roboto Mono', monospace" textAnchor="middle" letterSpacing="1px">
          {name.toUpperCase()}
        </text>
      </g>
    </g>
  </g>
);

interface TerminalMap2DProps {
  data: any;
  loading: boolean;
}

export default function TerminalMap2D({ data, loading }: TerminalMap2DProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  let targetBerthId = "R1";
  let computedMaxBlock: string | null = null;

  if (data) {
    let maxCount = -1;
    Object.entries(data.blocks || {}).forEach(([id, b]: [string, any]) => {
      if (b.count > maxCount) {
        maxCount = b.count;
        computedMaxBlock = id;
      }
    });

    const highestBlockId = computedMaxBlock || data.max_block;
    if (highestBlockId && data.layout?.[highestBlockId]) {
      const pos = data.layout[highestBlockId];
      const maxBlockX = BLK_START_X + pos.x * (BLK_W + BLK_GAP_X) + (BLK_W / 2);
      const maxBlockY = BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y) + (BLK_H / 2);
      let minDistance = Infinity;
      BERTHS.forEach(berth => {
        const dist = Math.hypot(berth.x - maxBlockX, berth.y - maxBlockY);
        if (dist < minDistance) {
          minDistance = dist;
          targetBerthId = berth.id;
        }
      });
    }
  }

  const bgColor = isDark ? "#0b0e14" : "#f8fafc";
  const waveColor = isDark ? "#38bdf8" : "#bae6fd";
  const roadColor = isDark ? "#1e2433" : "#e2e8f0";

  // Rank-based color logic
  const allBlocks = data ? Object.entries(data.blocks || {})
    .filter(([, b]: [any, any]) => b.count > 0)
    .sort((a: any, b: any) => b[1].count - a[1].count) : [];

  const maxCount = allBlocks.length > 0 ? (allBlocks[0][1] as any).count : 0;
  const highCountIds = allBlocks.filter(([, b]: [any, any]) => b.count === maxCount).map(([id]) => id);
  const mediumCandidates = allBlocks.filter(([id]) => !highCountIds.includes(id));
  const mediumIds = mediumCandidates.slice(0, 3).map(([id]) => id);

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", bgcolor: bgColor }}>
      <style>{`
        @keyframes scan{0%{transform:translateY(-120px)}100%{transform:translateY(950px)}}
        .zone-block { transition: filter 0.2s; }
        .zone-block:hover { filter: brightness(1.3); }
      `}</style>

      {loading && (
        <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 120, background: "linear-gradient(transparent,rgba(56,189,248,0.18),transparent)", animation: "scan 1.8s linear infinite", pointerEvents: "none", zIndex: 99 }} />
      )}

      {/* Overlays */}
      <Box sx={{ position: "absolute", top: 16, right: 24, zIndex: 10, display: "flex", gap: 1 }}>
        <Box sx={{ display: "flex", gap: 2, px: 2, py: 1, bgcolor: isDark ? "rgba(18, 22, 31, 0.9)" : "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(4px)", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          {[
            { c: "#dc2626", l: "Highest Density" },
            { c: "#ea580c", l: "Next 3 Blocks" },
            { c: "#16a34a", l: "Remaining Yard" }
          ].map(({ c, l }) => (
            <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 10, height: 10, bgcolor: c, borderRadius: "2px" }} />
              <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500 }}>{l}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {hovered && (
        <Box sx={{ position: "absolute", top: 16, left: 16, zIndex: 10, px: 2, py: 1.4, bgcolor: isDark ? "rgba(18, 22, 31, 0.95)" : "rgba(255, 255, 255, 0.95)", border: "1px solid", borderColor: "primary.main", borderRadius: 1, minWidth: 140 }}>
          <Typography sx={{ fontSize: "0.72rem", color: "primary.main", fontWeight: 800 }}>BLOCK {hovered}</Typography>
          {data?.blocks?.[hovered] && (
             <Typography sx={{ fontSize: "0.85rem", color: "text.primary", fontWeight: 700, mt: 0.5 }}>
               Volume: <span style={{ color: isDark ? "#38bdf8" : "#0284c7" }}>{data.blocks[hovered].count} CTN</span>
             </Typography>
          )}
        </Box>
      )}

      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        centerOnInit={true}
        wheel={{ step: 0.1 }}
      >
        {({ resetTransform }) => (
          <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
            <Controls resetTransform={resetTransform} />
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
              <svg width="1250" height="950" viewBox={VIEWBOX} style={{ display: "block", cursor: "grab" }}>
                <defs>
                  <filter id="weatherglow"><feGaussianBlur stdDeviation="35" /></filter>
                  <pattern id="asphalt" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                    <rect width="40" height="40" fill={isDark ? "#0f1219" : "#f1f5f9"} />
                    <rect x="0" y="0" width="40" height="40" fill={isDark ? "#161b24" : "#ffffff"} opacity="0.5" />
                  </pattern>

                  {/* Heatmap Gradients - DEEP CENTER */}
                  <radialGradient id="gradHigh">
                    <stop offset="0%" stopColor="#7f1d1d" stopOpacity="1" />
                    <stop offset="25%" stopColor="#dc2626" stopOpacity="0.9" />
                    <stop offset="65%" stopColor="#dc2626" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="gradMedium">
                    <stop offset="0%" stopColor="#7c2d12" stopOpacity="0.95" />
                    <stop offset="25%" stopColor="#ea580c" stopOpacity="0.8" />
                    <stop offset="65%" stopColor="#ea580c" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="gradLow">
                    <stop offset="0%" stopColor="#14532d" stopOpacity="0.9" />
                    <stop offset="25%" stopColor="#16a34a" stopOpacity="0.7" />
                    <stop offset="65%" stopColor="#16a34a" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                  </radialGradient>
                </defs>

                <rect x="-100" y="-100" width="1400" height="1100" fill={bgColor} />
                
                <g opacity="0.2" style={{ pointerEvents: "none" }}>
                  {Array.from({ length: 33 }).map((_, i) => (
                    <path key={i} d={`M -100,${i * 30} Q 0,${i * 30 - 10} 100,${i * 30} T 300,${i * 30} T 500,${i * 30} T 700,${i * 30} T 900,${i * 30} T 1100,${i * 30} T 1300,${i * 30}`} fill="none" stroke={waveColor} strokeWidth="1.5" />
                  ))}
                </g>

                <path d="M 0,120 L 960,120 L 960,700 L 0,700 Z" fill="url(#asphalt)" stroke={isDark ? "#272e3d" : "#cbd5e1"} strokeWidth="2" />

                <rect x="0" y="120" width="960" height="15" fill={roadColor} />
                <line x1="0" y1="125" x2="960" y2="125" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />
                <rect x="0" y="685" width="960" height="15" fill={roadColor} />
                <line x1="0" y1="695" x2="960" y2="695" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />
                <rect x="945" y="120" width="15" height="580" fill={roadColor} />
                <line x1="955" y1="120" x2="955" y2="700" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

                {[135, 310, 470, 630].map(ly => (
                  <g key={ly}>
                    <rect x="0" y={ly} width="945" height="20" fill={bgColor} opacity="0.8" />
                    <line x1="0" y1={ly + 10} x2="945" y2={ly + 10} stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth="1" strokeDasharray="16 8" />
                  </g>
                ))}

                {[240, 440, 640].map(lx => <rect key={lx} x={lx} y="120" width="20" height="580" fill={bgColor} opacity="0.7" />)}

                {/* Blocks */}
                {data && getZones(data.layout).map(z => {
                  const block = (data.blocks || {})[z.id];
                  const isHot = !!block && block.count > 0;
                  const isMax = z.id === (computedMaxBlock || data.max_block);
                  const isRec = data.recommended_berth?.includes(z.id);
                  const isH = hovered === z.id;

                  return (
                    <g key={z.id} className="zone-block" onMouseEnter={() => setHovered(z.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                      {isRec && <rect x={z.x - 4} y={z.y - 4} width={z.w + 8} height={z.h + 8} rx="5" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="8 4" opacity="0.9" />}
                      <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={isDark ? "#161b24" : "#ffffff"} stroke={isH ? "#fcd34d" : isMax ? "#ef4444" : isRec ? "#38bdf8" : (isDark ? "#334155" : "#cbd5e1")} strokeWidth={isH || isMax ? 2.5 : isRec ? 2 : 1} rx="3" />

                      {[0, 1, 2, 3, 4, 5].map(row => (
                        <g key={row}>
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(col => (
                            <rect key={col} x={z.x + 6 + col * 17} y={z.y + 8 + row * 17} width="14" height="14" fill={bgColor} stroke={isDark ? "#1e2433" : "#e2e8f0"} strokeWidth="0.5" rx="1" opacity={0.8} />
                          ))}
                        </g>
                      ))}

                      <rect x={z.x + 4} y={z.y + 4} width={36} height={16} rx="3" fill={isMax ? "rgba(239,68,68,0.95)" : isRec ? "rgba(14,165,233,0.9)" : (isDark ? "rgba(30,36,51,0.95)" : "rgba(241,245,249,0.95)")} stroke={isMax ? "#ef4444" : isRec ? "#38bdf8" : (isDark ? "#475569" : "#94a3b8")} strokeWidth="1" />
                      <text x={z.x + 22} y={z.y + 15} fill={isDark || isMax || isRec ? "#f8fafc" : "#0f172a"} fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{z.id}</text>

                      {isHot && (
                        <g>
                          <circle cx={z.x + z.w - 15} cy={z.y + 15} r="12" fill={bgColor} stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="1" />
                          <text x={z.x + z.w - 15} y={z.y + 19} fill={theme.palette.text.primary} fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{block.count}</text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Heatmap Layer */}
                {data && (
                  <g filter="url(#weatherglow)" style={{ mixBlendMode: isDark ? "screen" : "multiply", pointerEvents: "none" }} opacity={isDark ? 0.95 : 0.6}>
                    {getZones(data.layout)
                      .map(z => {
                        const block = data.blocks[z.id];
                        if (!block || block.count === 0) return null;

                        let effectiveConc = "Low";
                        if (highCountIds.includes(z.id)) effectiveConc = "High";
                        else if (mediumIds.includes(z.id)) effectiveConc = "Medium";

                        return { z, effectiveConc };
                      })
                      .filter((item): item is any => item !== null)
                      .sort((a, b) => {
                        const heatIndex: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
                        return (heatIndex[a.effectiveConc] || 0) - (heatIndex[b.effectiveConc] || 0);
                      })
                      .map(({ z, effectiveConc }) => {
                        const spreadScale = effectiveConc === "High" ? 2.2 : effectiveConc === "Medium" ? 1.8 : 1.4;
                        const gradId = effectiveConc === "High" ? "gradHigh" : effectiveConc === "Medium" ? "gradMedium" : "gradLow";
                        return (
                          <ellipse key={`heat-${z.id}`} cx={z.x + z.w / 2} cy={z.y + z.h / 2} rx={z.w * spreadScale} ry={z.h * spreadScale} fill={`url(#${gradId})`} />
                        );
                      })}
                  </g>
                )}

                {/* Cranes & Ships */}
                {[200, 320, 540, 660].map((cx, i) => <STS key={`top-${i}`} x={cx} y={120} rot={0} />)}
                {[200, 320, 540, 660].map((cx, i) => <STS key={`bot-${i}`} x={cx} y={700} rot={180} />)}
                {[220, 340, 500, 620].map((cy, i) => <STS key={`right-${i}`} x={960} y={cy} rot={90} />)}

                {BERTHS.map(berth => {
                  const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
                  const shipName = isTarget ? (data ? data.vessel : "TARGET VESSEL") : berth.defaultShip.name;
                  const shipColor = isTarget ? (isDark ? "#0284c7" : "#0369a1") : berth.defaultShip.color;
                  return (
                    <Ship key={berth.id} x={berth.x} y={berth.y} w={280} h={60} name={shipName} color={shipColor} rot={berth.rot} isTarget={isTarget} />
                  );
                })}

                {BERTHS.map(berth => {
                  const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
                  return (
                    <text key={`label-${berth.id}`} x={berth.lx} y={berth.ly} transform={`rotate(${berth.lrot}, ${berth.lx}, ${berth.ly})`} fill={isTarget ? "#38bdf8" : (isDark ? "#94a3b8" : "#64748b")} fontSize="11" fontFamily="sans-serif" textAnchor="middle" fontWeight="800" letterSpacing="1px">
                      {berth.label}
                    </text>
                  );
                })}
              </svg>
            </TransformComponent>
          </Box>
        )}
      </TransformWrapper>
    </Box>
  );
}