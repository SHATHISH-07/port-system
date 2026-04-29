import { useState } from "react";
import { Box, Typography, Divider, Button } from "@mui/material";
import { WarningAmberRounded } from "@mui/icons-material";
import { api } from "../api/api";

const W = "100%", H = "100%";
const VIEWBOX = "-50 -50 1250 950";

const BLK_W = 160, BLK_H = 120, BLK_GAP_X = 40, BLK_GAP_Y = 40;
const BLK_START_X = 80, BLK_START_Y = 190;

function getZones(layout: Record<string, { x: number, y: number }>) {
  return Object.entries(layout).map(([id, pos]) => ({
    id,
    x: BLK_START_X + pos.x * (BLK_W + BLK_GAP_X),
    y: BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y),
    w: BLK_W,
    h: BLK_H,
  }));
}

const getHeatFill = (c: string) => {
  if (c === "High") return "rgba(239, 68, 68, 0.85)";
  if (c === "Medium") return "rgba(249, 115, 22, 0.65)";
  if (c === "Low") return "rgba(34, 197, 94, 0.55)";
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

const STS = ({ x, y, rot }: { x: number; y: number; rot: number }) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
    <rect x={-20} y={10} width={10} height={50} fill="#475569" />
    <rect x={10} y={10} width={10} height={50} fill="#475569" />
    <rect x={-25} y={20} width={50} height={6} fill="#64748b" />
    <rect x={-3} y={-40} width={6} height={60} fill="#38bdf8" />
    <rect x={-2} y={-80} width={4} height={100} fill="#38bdf8" />
    <rect x={-2} y={20} width={4} height={40} fill="#38bdf8" />
    <rect x={-5} y={-60} width={10} height={6} fill="#e2e8f0" />
  </g>
);

const Ship = ({ x, y, w, h, name, color, rot = 0, isTarget = false }: { x: number, y: number, w: number, h: number, name: string, color: string, rot?: number, isTarget?: boolean }) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
    <g transform={`translate(${-w / 2}, ${-h / 2})`}>

      {/* 1. Main Hull Silhouette (Tapered Bow + Transom Stern) */}
      <path
        d={`
          M 0,${h / 2} 
          L 40,2 
          L ${w - 15},2 
          Q ${w},2 ${w},10 
          L ${w},${h - 10} 
          Q ${w},${h - 2} ${w - 15},${h - 2} 
          L 40,${h - 2} 
          Z
        `}
        fill={isTarget ? "#0f172a" : color}
        stroke={isTarget ? "#38bdf8" : "#0f172a"}
        strokeWidth={isTarget ? 3 : 1.5}
      />

      {/* 2. Bulwark / Inner Deck Shadow */}
      <path
        d={`M 45,6 L ${w - 20},6 L ${w - 20},${h - 6} L 45,${h - 6} Z`}
        fill="rgba(0,0,0,0.2)"
      />

      {/* 3. Container Bay Visualization */}
      {/* Draws bays based on ship width */}
      {Array.from({ length: Math.floor(w / 35) }).map((_, i) => (
        <g key={i} transform={`translate(${45 + i * 28}, 8)`}>
          <rect
            width={24}
            height={h - 16}
            rx={1}
            fill="#334155"
            opacity="0.8"
          />
          {/* Container Slot Lines */}
          <line x1={12} y1={2} x2={12} y2={h - 18} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        </g>
      ))}

      {/* 4. Superstructure (The Bridge Tower) */}
      {/* Positioned towards the stern like a modern carrier */}
      <g transform={`translate(${w - 65}, ${h / 2 - 18})`}>
        {/* Main Tower Base */}
        <rect width={35} height={36} rx={2} fill="#f8fafc" stroke="#64748b" strokeWidth={0.5} />

        {/* Bridge Windows (The blue tint) */}
        <rect x={2} y={5} width={8} height={26} rx={1} fill="#0ea5e9" opacity={0.6} />

        {/* Top Deck / Mast Base */}
        <rect x={12} y={10} width={15} height={16} rx={1} fill="#e2e8f0" />

        {/* Radar / Mast */}
        <line x1={20} y1={5} x2={20} y2={10} stroke="#475569" strokeWidth={2} />
        <line x1={15} y1={5} x2={25} y2={5} stroke="#475569" strokeWidth={1} />
      </g>

      {/* 5. Exhaust Stack (Funnel) */}
      <rect x={w - 25} y={h / 2 - 6} width={12} height={12} rx={2} fill="#ef4444" />
      <circle cx={w - 19} cy={h / 2} r={3} fill="#1e293b" />

      {/* 6. Lifeboats (The safety orange spots) */}
      <rect x={w - 68} y={2} width={10} height={4} rx={2} fill="#f97316" />
      <rect x={w - 68} y={h - 6} width={10} height={4} rx={2} fill="#f97316" />

      {/* 7. Vessel Name Tag */}
      <g transform={`translate(${w / 2 - 10}, ${h + 12})`}>
        <text
          fill={isTarget ? "#38bdf8" : "#94a3b8"}
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

const KPI = ({ label, value, valueColor = "#f8fafc", isMono = false }: { label: string, value: string | number, valueColor?: string, isMono?: boolean }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
    <Typography sx={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>{label}</Typography>
    <Typography sx={{ fontSize: "0.95rem", fontWeight: 600, color: valueColor, fontFamily: isMono ? "'Roboto Mono', monospace" : "'Inter', sans-serif" }}>{value}</Typography>
  </Box>
);

export default function TerminalMap() {
  const [vesselInput, setVesselInput] = useState("AA7");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const load = async () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    try {
      const res = await api.get(`/vessel/heatmap?vessel_id=${encodeURIComponent(vesselInput.trim())}`);
      setData(res.data);
    } catch { console.error("Failed to load"); }
    finally { setLoading(false); }
  };

  let targetBerthId = "R1";
  let totalMoves = 0;
  let computedMaxBlock: string | null = null;

  if (data) {
    let maxCount = -1;
    Object.entries(data.blocks || {}).forEach(([id, b]: [string, any]) => {
      totalMoves += b.count;
      if (b.count > maxCount) {
        maxCount = b.count;
        computedMaxBlock = id;
      }
    });

    const highestBlockId = computedMaxBlock || data.max_block;

    if (highestBlockId && data.layout && data.layout[highestBlockId]) {
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

  return (
    <Box sx={{
      width: "100%",
      height: "100vh",
      bgcolor: "#0b0e14",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflow: "hidden"
    }}>
      <style>{`
        @keyframes scan{0%{transform:translateY(-120px)}100%{transform:translateY(950px)}}
        .zone-block { transition: filter 0.2s; }
        .zone-block:hover { filter: brightness(1.3); }
      `}</style>



      <Box sx={{ bgcolor: "#161b24", borderBottom: "1px solid #1e2433", display: "flex", alignItems: "center", px: 3, py: 1.5, gap: 4, flexShrink: 0 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <input
            value={vesselInput}
            onChange={e => setVesselInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
            placeholder="Enter Vessel ID"
            style={{
              background: "#0b0e14", border: "1px solid #272e3d", borderRadius: "4px",
              color: "#f8fafc", fontSize: "0.85rem", padding: "8px 14px", outline: "none",
              width: "200px", fontFamily: "'Roboto Mono', monospace", transition: "border 0.2s"
            }}
            onFocus={(e) => e.target.style.borderColor = "#38bdf8"}
            onBlur={(e) => e.target.style.borderColor = "#272e3d"}
          />
          <Button
            onClick={load} disabled={loading} disableElevation
            sx={{ bgcolor: "#38bdf8", color: "#0f1219", fontSize: "0.75rem", fontWeight: 700, px: 2.5, py: "8px", textTransform: "none", borderRadius: "4px", "&:hover": { bgcolor: "#0ea5e9" } }}
          >
            {loading ? "Computing..." : "Execute"}
          </Button>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: "#272e3d", my: 0.5 }} />

        {data ? (
          <Box sx={{ display: "flex", gap: 5, alignItems: "center", flex: 1 }}>
            <KPI label="Vessel Name" value={data.vessel} />
            <KPI label="Visit ID" value={data.visit_id || "—"} isMono />
            <KPI label="Total Volume" value={`${totalMoves} CTN`} isMono />
            <KPI label="Optimal Berth" value={targetBerthId} valueColor="#38bdf8" isMono />
            <KPI label="Primary Block" value={computedMaxBlock || data.max_block || "—"} valueColor="#e2e8f0" isMono />

            <Box sx={{ flex: 1 }} />

            {(data.summary?.hazardous > 0 || data.summary?.reefer > 0) && (
              <Box sx={{ px: 2, py: 1, bgcolor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 1, display: "flex", gap: 1.5, alignItems: "center" }}>
                <WarningAmberRounded sx={{ fontSize: 18, color: "#ef4444" }} />
                <Typography sx={{ fontSize: "0.75rem", color: "#fca5a5", fontWeight: 600 }}>Special Cargo (Haz/Ref)</Typography>
              </Box>
            )}
          </Box>
        ) : (
          <Typography sx={{ fontSize: "0.85rem", color: "#475569", fontStyle: "italic", flex: 1 }}>Awaiting vessel query execution...</Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", minHeight: 0 }}>

        <Box sx={{ position: "absolute", top: 16, right: 24, zIndex: 10, display: "flex", gap: 1 }}>
          <Box sx={{ display: "flex", gap: 2, px: 2, py: 1, bgcolor: "rgba(18, 22, 31, 0.9)", backdropFilter: "blur(4px)", border: "1px solid #272e3d", borderRadius: 1 }}>
            {[
              { c: "#ef4444", l: "Highest Density" },
              { c: "#f97316", l: "Med Density" },
              { c: "#10b981", l: "Low Density" }
            ].map(({ c, l }) => (
              <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 10, height: 10, bgcolor: c, borderRadius: "2px" }} />
                <Typography sx={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500 }}>{l}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>
          {loading && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120, background: "linear-gradient(transparent,rgba(56,189,248,0.18),transparent)", animation: "scan 1.8s linear infinite", pointerEvents: "none", zIndex: 99 }} />}

          <svg width={W} height={H} viewBox={VIEWBOX} style={{ display: "block" }}>
            <defs>
              <filter id="weatherglow"><feGaussianBlur stdDeviation="55" /></filter>
              <pattern id="asphalt" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#0f1219" />
                <rect x="0" y="0" width="40" height="40" fill="#161b24" opacity="0.5" />
              </pattern>
            </defs>

            <rect x="-100" y="-100" width="1400" height="1100" fill="#0b0e14" />
            <g opacity="0.2">
              {Array.from({ length: 33 }).map((_, i) => (
                <path key={i} d={`M -100,${i * 30} Q 0,${i * 30 - 10} 100,${i * 30} T 300,${i * 30} T 500,${i * 30} T 700,${i * 30} T 900,${i * 30} T 1100,${i * 30} T 1300,${i * 30}`} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
              ))}
            </g>

            <path d="M 0,120 L 960,120 L 960,700 L 0,700 Z" fill="url(#asphalt)" stroke="#272e3d" strokeWidth="2" />

            <rect x="0" y="120" width="960" height="15" fill="#1e2433" />
            <line x1="0" y1="125" x2="960" y2="125" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />
            <rect x="0" y="685" width="960" height="15" fill="#1e2433" />
            <line x1="0" y1="695" x2="960" y2="695" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />
            <rect x="945" y="120" width="15" height="580" fill="#1e2433" />
            <line x1="955" y1="120" x2="955" y2="700" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

            {[135, 310, 470, 630].map(ly => (
              <g key={ly}>
                <rect x="0" y={ly} width="945" height="20" fill="#0b0e14" opacity="0.8" />
                <line x1="0" y1={ly + 10} x2="945" y2={ly + 10} stroke="#334155" strokeWidth="1" strokeDasharray="16 8" />
              </g>
            ))}

            {[240, 440, 640].map(lx => <rect key={lx} x={lx} y="120" width="20" height="580" fill="#0b0e14" opacity="0.7" />)}

            {data && getZones(data.layout).map(z => {
              const block = data.blocks[z.id];
              const isHot = !!block && block.count > 0;
              const isMax = z.id === (computedMaxBlock || data.max_block);
              const isRec = data.recommended_berth?.includes(z.id);
              const isH = hovered === z.id;

              return (
                <g key={z.id}
                  className="zone-block"
                  onMouseEnter={() => setHovered(z.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}>

                  {isRec && <rect x={z.x - 4} y={z.y - 4} width={z.w + 8} height={z.h + 8} rx="5" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="8 4" opacity="0.9" />}

                  <rect x={z.x} y={z.y} width={z.w} height={z.h}
                    fill="#161b24"
                    stroke={isH ? "#fcd34d" : isMax ? "#ef4444" : isRec ? "#38bdf8" : "#334155"}
                    strokeWidth={isH || isMax ? 2.5 : isRec ? 2 : 1} rx="3" />

                  {[0, 1, 2, 3, 4, 5].map(row => (
                    <g key={row}>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(col => (
                        <rect key={col} x={z.x + 6 + col * 17} y={z.y + 8 + row * 17} width="14" height="14" fill="#0b0e14" stroke="#1e2433" strokeWidth="0.5" rx="1" opacity={0.8} />
                      ))}
                    </g>
                  ))}

                  <rect x={z.x + 4} y={z.y + 4} width={36} height={16} rx="3"
                    fill={isMax ? "rgba(239,68,68,0.95)" : isRec ? "rgba(14,165,233,0.9)" : "rgba(30,36,51,0.95)"}
                    stroke={isMax ? "#ef4444" : isRec ? "#38bdf8" : "#475569"} strokeWidth="1" />
                  <text x={z.x + 22} y={z.y + 15} fill="#f8fafc" fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{z.id}</text>

                  {isHot && (
                    <g>
                      <circle cx={z.x + z.w - 15} cy={z.y + 15} r="12" fill="#0b0e14" stroke="#475569" strokeWidth="1" />
                      <text x={z.x + z.w - 15} y={z.y + 19} fill="#fff" fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{block.count}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {data && (
              <g filter="url(#weatherglow)" style={{ mixBlendMode: "screen" }} opacity="0.95">
                {getZones(data.layout)
                  .map(z => {
                    const block = data.blocks[z.id];
                    if (!block || block.count === 0) return null;

                    let effectiveConc = block.concentration;
                    if (z.id === computedMaxBlock) {
                      effectiveConc = "High";
                    } else if (effectiveConc === "High") {
                      effectiveConc = "Medium";
                    }

                    return { z, block, effectiveConc };
                  })
                  .filter((item): item is { z: any; block: any; effectiveConc: string } => item !== null)
                  .sort((a, b) => {
                    const heatIndex: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
                    return (heatIndex[a.effectiveConc] || 0) - (heatIndex[b.effectiveConc] || 0);
                  })
                  .map(({ z, effectiveConc }) => {
                    const spreadScale = effectiveConc === "High" ? 1.6 : effectiveConc === "Medium" ? 1.3 : 1.1;

                    return (
                      <ellipse
                        key={`heat-${z.id}`}
                        cx={z.x + z.w / 2}
                        cy={z.y + z.h / 2}
                        rx={z.w * spreadScale}
                        ry={z.h * spreadScale}
                        fill={getHeatFill(effectiveConc)}
                      />
                    );
                  })}
              </g>
            )}

            {[200, 320, 540, 660].map((cx, i) => <STS key={`top-${i}`} x={cx} y={120} rot={0} />)}
            {[200, 320, 540, 660].map((cx, i) => <STS key={`bot-${i}`} x={cx} y={700} rot={180} />)}
            {[220, 340, 500, 620].map((cy, i) => <STS key={`right-${i}`} x={960} y={cy} rot={90} />)}

            {BERTHS.map(berth => {
              const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
              const shipName = isTarget ? (data ? data.vessel : "TARGET VESSEL") : berth.defaultShip.name;
              const shipColor = isTarget ? "#0284c7" : berth.defaultShip.color;

              return (
                <Ship
                  key={berth.id} x={berth.x} y={berth.y} w={280} h={60}
                  name={shipName} color={shipColor} rot={berth.rot} isTarget={isTarget}
                />
              );
            })}

            {BERTHS.map(berth => {
              const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";
              return (
                <text
                  key={`label-${berth.id}`} x={berth.lx} y={berth.ly} transform={`rotate(${berth.lrot}, ${berth.lx}, ${berth.ly})`}
                  fill={isTarget ? "#38bdf8" : "#94a3b8"} fontSize="11" fontFamily="sans-serif" textAnchor="middle" fontWeight="800" letterSpacing="1px"
                >
                  {berth.label}
                </text>
              );
            })}

          </svg>
        </Box>
      </Box>
    </Box>
  );
}