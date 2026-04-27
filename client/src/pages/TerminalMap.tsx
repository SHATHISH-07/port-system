import { useState } from "react";
import { api } from "../api/api";

const W = 1100, H = 820;

// Block canvas layout constants
const BLK_W = 160, BLK_H = 120, BLK_GAP_X = 40, BLK_GAP_Y = 40;
const BLK_START_X = 80, BLK_START_Y = 190;

// Derive positioned zones from API layout (grid col/row → SVG x/y)
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
  if (c === "High") return "rgba(239, 68, 68, 1)"; // Red
  if (c === "Medium") return "rgba(249, 115, 22, 0.9)"; // Orange
  if (c === "Low") return "rgba(34, 197, 94, 0.8)"; // Green
  return "none";
};

// Available terminal berths mapping with coordinates and default filler ships
const BERTHS = [
  { id: "T1", label: "BERTH T1", lx: 260, ly: 140, lrot: 0, x: 260, y: 60, rot: 0, defaultShip: { name: "MSC OSCAR", color: "#1e3a8a" } },
  { id: "T2", label: "BERTH T2", lx: 600, ly: 140, lrot: 0, x: 600, y: 60, rot: 0, defaultShip: { name: "EVER GIVEN", color: "#047857" } },
  { id: "B1", label: "BERTH B1", lx: 260, ly: 680, lrot: 0, x: 260, y: 760, rot: 0, defaultShip: { name: "CMA CGM MARCO POLO", color: "#0f766e" } },
  { id: "B2", label: "BERTH B2", lx: 600, ly: 680, lrot: 0, x: 600, y: 760, rot: 0, defaultShip: { name: "HAPAG-LLOYD", color: "#ea580c" } },
  { id: "R1", label: "BERTH R1", lx: 880, ly: 280, lrot: -90, x: 960, y: 280, rot: 90, defaultShip: { name: "OOCL HONG KONG", color: "#dc2626" } },
  { id: "R2", label: "BERTH R2", lx: 880, ly: 580, lrot: -90, x: 960, y: 580, rot: 90, defaultShip: { name: "MAERSK MC-KINNEY", color: "#475569" } },
];

// STS Crane (Ship-to-Shore)
const STS = ({ x, y, rot }: { x: number; y: number; rot: number }) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
    <rect x={-20} y={10} width={10} height={50} fill="#94a3b8" />
    <rect x={10} y={10} width={10} height={50} fill="#94a3b8" />
    <rect x={-25} y={20} width={50} height={8} fill="#cbd5e1" />
    <rect x={-4} y={-40} width={8} height={60} fill="#eab308" />
    <rect x={-3} y={-80} width={6} height={100} fill="#fbbf24" />
    <rect x={-3} y={20} width={6} height={40} fill="#fbbf24" />
    <rect x={-6} y={-60} width={12} height={8} fill="#0ea5e9" />
  </g>
);

// Ship hull
const Ship = ({ x, y, w, h, name, color, rot = 0 }: { x: number, y: number, w: number, h: number, name: string, color: string, rot?: number }) => (
  <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
    <g transform={`translate(${-w / 2}, ${-h / 2})`}>
      <path d={`M0,${h} L0,8 Q0,0 10,0 L${w - 10},0 Q${w},0 ${w},8 L${w},${h} Z`} fill={color} stroke="#020617" strokeWidth="2" />
      {Array.from({ length: Math.floor(w / 20) }).map((_, i) => (
        <rect key={i} x={10 + i * 20} y={5} width={16} height={h - 10} rx="1" fill="#0ea5e9" stroke="#0284c7" strokeWidth="0.5" opacity="0.8" />
      ))}
      <rect x={w - 30} y={4} width={20} height={h - 8} rx="2" fill="#cbd5e1" />
      <rect x={w - 26} y={8} width={8} height={h - 16} fill="#475569" />
      <text x={w / 2 - 10} y={h / 2 + 4} fill="#fff" fontSize="11" fontWeight="bold" fontFamily="sans-serif">{name}</text>
    </g>
  </g>
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

  // Dynamically calculate which berth is physically closest to the max concentration block
  let targetBerthId = "R1"; // Default location
  if (data && data.max_block && data.layout[data.max_block]) {
    const pos = data.layout[data.max_block];

    // Get absolute center coordinate of the max block
    const maxBlockX = BLK_START_X + pos.x * (BLK_W + BLK_GAP_X) + (BLK_W / 2);
    const maxBlockY = BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y) + (BLK_H / 2);

    let minDistance = Infinity;

    BERTHS.forEach(berth => {
      // Calculate straight-line distance from the block center to the berth center
      const dist = Math.hypot(berth.x - maxBlockX, berth.y - maxBlockY);
      if (dist < minDistance) {
        minDistance = dist;
        targetBerthId = berth.id;
      }
    });
  }

  return (
    <div style={{ background: "#020617", color: "#f8fafc", minHeight: "100vh", fontFamily: "Inter,sans-serif" }}>
      <style>{`
        @keyframes scan{0%{transform:translateY(-120px)}100%{transform:translateY(${H}px)}}
        .zone-block:hover{filter:brightness(1.3)}
      `}</style>

      {/* HEADER */}
      <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "14px 24px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* ── VESSEL / VISIT INFO ── */}
          {data && (
            <>
              <rect x="20" y="580" width="180" height="90" rx="6" fill="rgba(15,23,42,0.95)" stroke="#38bdf8" strokeWidth="1" />
              <text x="35" y="605" fill="#64748b" fontSize="9" fontFamily="sans-serif" fontWeight="700" letterSpacing="1px">TARGET VESSEL</text>
              <text x="35" y="620" fill="#f8fafc" fontSize="13" fontFamily="sans-serif" fontWeight="800">{data.vessel}</text>

              <text x="35" y="640" fill="#64748b" fontSize="9" fontFamily="sans-serif" fontWeight="700" letterSpacing="1px">VISIT ID</text>
              <text x="35" y="655" fill="#94a3b8" fontSize="12" fontFamily="sans-serif">{data.visit_id || "—"}</text>

              <text x="120" y="640" fill="#64748b" fontSize="9" fontFamily="sans-serif" fontWeight="700" letterSpacing="1px">REC. BERTH</text>
              <text x="120" y="655" fill="#38bdf8" fontSize="12" fontFamily="sans-serif" fontWeight="800">{data.recommended_berth}</text>
            </>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 12, background: "#020617", border: "1px solid #1e293b", borderRadius: 8, padding: "6px 14px", alignItems: "center" }}>
          {[["#10b981", "Low"], ["#f97316", "Medium"], ["#ef4444", "High"]].map(([c, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}99` }} />
              {l} density
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Vessel ID</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={vesselInput} onChange={e => setVesselInput(e.target.value)} onKeyDown={e => e.key === "Enter" && load()}
              placeholder="e.g. AA7" style={{ width: 160, background: "#020617", border: "1px solid #334155", color: "#f8fafc", fontSize: 13, padding: "7px 10px", borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
            <button onClick={load} disabled={loading}
              style={{ background: "#0ea5e9", color: "#fff", border: "none", fontWeight: 600, fontSize: 13, padding: "0 14px", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "SCANNING…" : "LOCATE"}
            </button>
          </div>
        </div>
      </div>

      {/* MAP */}
      <div style={{ padding: "20px", overflowX: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
          {loading && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120, background: "linear-gradient(transparent,rgba(56,189,248,0.18),transparent)", animation: "scan 1.8s linear infinite", pointerEvents: "none", zIndex: 99 }} />}

          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: "#051024" }}>
            <defs>
              <filter id="weatherglow"><feGaussianBlur stdDeviation="55" /></filter>
              <pattern id="asphalt" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#111827" />
                <rect x="0" y="0" width="40" height="40" fill="#131d2e" opacity="0.5" />
              </pattern>
            </defs>

            {/* ── WATER BACKGROUND ── */}
            <g opacity="0.2">
              {Array.from({ length: 33 }).map((_, i) => (
                <path key={i} d={`M -100,${i * 25} Q 0,${i * 25 - 10} 100,${i * 25} T 300,${i * 25} T 500,${i * 25} T 700,${i * 25} T 900,${i * 25} T 1100,${i * 25} T 1300,${i * 25}`} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
              ))}
            </g>

            {/* ── PENINSULA LAND ── */}
            <path d="M 0,120 L 900,120 L 900,700 L 0,700 Z" fill="url(#asphalt)" stroke="#293548" strokeWidth="2" />

            {/* ── QUAY EDGES & BOLLARDS ── */}
            <rect x="0" y="120" width="900" height="15" fill="#293548" />
            <line x1="0" y1="125" x2="900" y2="125" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

            <rect x="0" y="685" width="900" height="15" fill="#293548" />
            <line x1="0" y1="695" x2="900" y2="695" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

            <rect x="885" y="120" width="15" height="580" fill="#293548" />
            <line x1="895" y1="120" x2="895" y2="700" stroke="#eab308" strokeWidth="2" strokeDasharray="14 7" opacity="0.8" />

            {/* ── TRUCK LANES ── */}
            {[135, 310, 470, 630].map(ly => (
              <g key={ly}>
                <rect x="0" y={ly} width="885" height="20" fill="#0d1625" opacity="0.8" />
                <line x1="0" y1={ly + 10} x2="885" y2={ly + 10} stroke="#374151" strokeWidth="1" strokeDasharray="16 8" />
              </g>
            ))}

            {/* ── VERTICAL ROADS ── */}
            {[240, 440, 640].map(lx => (
              <rect key={lx} x={lx} y="120" width="20" height="580" fill="#0d1625" opacity="0.7" />
            ))}

            {/* ── YARD BLOCK ZONES ── */}
            {data && getZones(data.layout).map(z => {
              const block = data.blocks[z.id];
              const isHot = !!block && block.count > 0;
              const isMax = z.id === data.max_block;
              const isRec = data.recommended_berth?.includes(z.id);
              const isH = hovered === z.id;

              return (
                <g key={z.id}
                  onMouseEnter={() => setHovered(z.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}>
                  {isRec && <rect x={z.x - 4} y={z.y - 4} width={z.w + 8} height={z.h + 8} rx="5" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="8 4" opacity="0.9" />}
                  <rect x={z.x} y={z.y} width={z.w} height={z.h}
                    fill="#1e293b"
                    stroke={isH ? "#fcd34d" : isMax ? "#ef4444" : isRec ? "#38bdf8" : "#334155"}
                    strokeWidth={isH || isMax ? 2.5 : isRec ? 2 : 1} rx="3" />

                  {[0, 1, 2, 3, 4, 5].map(row => (
                    <g key={row}>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(col => (
                        <rect key={col}
                          x={z.x + 6 + col * 17} y={z.y + 8 + row * 17} width="14" height="14"
                          fill="#0f172a"
                          stroke="#2d3748" strokeWidth="0.5" rx="1"
                          opacity={0.45} />
                      ))}
                    </g>
                  ))}

                  <rect x={z.x + 4} y={z.y + 4} width={36} height={16} rx="3"
                    fill={isMax ? "rgba(220,38,38,0.95)" : isRec ? "rgba(14,165,233,0.9)" : "rgba(15,23,42,0.9)"}
                    stroke={isMax ? "#ef4444" : isRec ? "#38bdf8" : "#475569"} strokeWidth="1" />
                  <text x={z.x + 22} y={z.y + 15} fill="#f8fafc" fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{z.id}</text>

                  {isHot && (
                    <g>
                      <circle cx={z.x + z.w - 15} cy={z.y + 15} r="12" fill="rgba(15,23,42,0.95)" stroke="#475569" strokeWidth="1" />
                      <text x={z.x + z.w - 15} y={z.y + 19} fill="#fff" fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{block.count}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* ── WEATHER HEATMAP GLOW OVERLAY ── */}
            {data && (
              <g filter="url(#weatherglow)" style={{ mixBlendMode: "screen" }} opacity="0.85">
                {getZones(data.layout).map(z => {
                  const block = data.blocks[z.id];
                  if (!block || block.count === 0) return null;
                  return <ellipse key={`heat-${z.id}`} cx={z.x + z.w / 2} cy={z.y + z.h / 2} rx={z.w * 1.1} ry={z.h * 1.1} fill={getHeatFill(block.concentration)} />;
                })}
              </g>
            )}

            {/* ── STS CRANES ── */}
            {[200, 320, 540, 660].map((cx, i) => <STS key={`top-${i}`} x={cx} y={120} rot={0} />)}
            {[200, 320, 540, 660].map((cx, i) => <STS key={`bot-${i}`} x={cx} y={700} rot={180} />)}
            {[220, 340, 500, 620].map((cy, i) => <STS key={`right-${i}`} x={900} y={cy} rot={90} />)}

            {/* ── SHIPS AT BERTH ── */}
            {BERTHS.map(berth => {
              const isTarget = data ? targetBerthId === berth.id : berth.id === "R1"; // Default Target Vessel
              const shipName = isTarget ? (data ? data.vessel : "TARGET VESSEL") : berth.defaultShip.name;
              const shipColor = isTarget ? "#eab308" : berth.defaultShip.color;

              return (
                <Ship
                  key={berth.id}
                  x={berth.x}
                  y={berth.y}
                  w={280}
                  h={60}
                  name={shipName}
                  color={shipColor}
                  rot={berth.rot}
                />
              );
            })}

            {/* ── BERTH LABELS ── */}
            {BERTHS.map(berth => {
              const isTarget = data ? targetBerthId === berth.id : berth.id === "R1";

              return (
                <text
                  key={`label-${berth.id}`}
                  x={berth.lx}
                  y={berth.ly}
                  transform={`rotate(${berth.lrot}, ${berth.lx}, ${berth.ly})`}
                  fill={isTarget ? "#eab308" : "#94a3b8"} // Visually highlight the assigned berth's text
                  fontSize="10"
                  fontFamily="sans-serif"
                  textAnchor="middle"
                  fontWeight="800"
                  letterSpacing="1px"
                >
                  {berth.label}
                </text>
              );
            })}

            {/* COMPASS */}
            <g transform="translate(1040,760)">
              <circle cx="0" cy="0" r="24" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
              <text x="0" y="-10" fill="#ef4444" fontSize="10" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">N</text>
              <text x="0" y="17" fill="#94a3b8" fontSize="9" fontFamily="sans-serif" textAnchor="middle">S</text>
              <text x="16" y="4" fill="#94a3b8" fontSize="9" fontFamily="sans-serif" textAnchor="middle">E</text>
              <text x="-16" y="4" fill="#94a3b8" fontSize="9" fontFamily="sans-serif" textAnchor="middle">W</text>
              <line x1="0" y1="-6" x2="0" y2="-18" stroke="#ef4444" strokeWidth="2.5" />
              <line x1="0" y1="6" x2="0" y2="18" stroke="#475569" strokeWidth="2" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}