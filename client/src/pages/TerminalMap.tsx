import { useState } from "react";
import { api } from "../api/api"; 

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CANVAS_W = 980;
const CANVAS_H = 860;

const BLOCK_GRID = {
    G1: { col: 0, row: 0 }, G2: { col: 1, row: 0 }, G3: { col: 2, row: 0 },
    G4: { col: 0, row: 1 }, G5: { col: 1, row: 1 }, G6: { col: 2, row: 1 },
    G7: { col: 0, row: 2 }, G8: { col: 1, row: 2 }, G9: { col: 2, row: 2 },
};

const COL_X = [195, 400, 605];
const ROW_Y = [165, 345, 525];
const BLOCK_W_MAIN = 175;
const BLOCK_W_EAST = 140;
const BLOCK_H = 155;
const BAY_COUNT = 10;

const NORTH_CRANES = [230, 360, 480, 610, 720];
const SOUTH_CRANES = [230, 360, 480, 610, 720];
const EAST_CRANES = [155, 290, 425, 560, 695];

function getBlockRect(col: number, row: number) {
    const x = COL_X[col]; const y = ROW_Y[row];
    const w = col === 2 ? BLOCK_W_EAST : BLOCK_W_MAIN;
    return { x, y, w, h: BLOCK_H, cx: x + w / 2, cy: y + BLOCK_H / 2 };
}

const getHeatColor = (c: string) => {
    if (c === "High") return "rgba(239,68,68,0.7)"; 
    if (c === "Medium") return "rgba(249,115,22,0.65)"; 
    if (c === "Low") return "rgba(16,185,129,0.55)"; 
    return "rgba(255,255,255,0)";
};

const Crane = ({ cx, cy, dir }: { cx: number, cy: number, dir: string }) => {
    const isNorth = dir === "down";
    const isSouth = dir === "up";
    const isEast = dir === "right"; 

    if (isNorth) return (
        <g transform={`translate(${cx}, ${cy})`}>
            <rect x={-15} y={-45} width={30} height={10} fill="#1e293b" rx="2" stroke="#0f172a" strokeWidth="1"/>
            <rect x={-15} y={-10} width={30} height={10} fill="#1e293b" rx="2" stroke="#0f172a" strokeWidth="1"/>
            <rect x={-12} y={-40} width={4} height={35} fill="#64748b" />
            <rect x={8} y={-40} width={4} height={35} fill="#64748b" />
            <rect x={-4} y={-95} width={8} height={90} fill="#eab308" stroke="#ca8a04" strokeWidth="0.5" />
            <rect x={-6} y={-75} width={12} height={10} fill="#0ea5e9" rx="1" />
            <rect x={-4} y={-5} width={8} height={20} fill="#eab308" />
            <rect x={-10} y={10} width={20} height={6} fill="#0f172a" />
        </g>
    );

    if (isSouth) return (
        <g transform={`translate(${cx}, ${cy})`}>
            <rect x={-15} y={35} width={30} height={10} fill="#1e293b" rx="2" stroke="#0f172a" strokeWidth="1"/>
            <rect x={-15} y={0} width={30} height={10} fill="#1e293b" rx="2" stroke="#0f172a" strokeWidth="1"/>
            <rect x={-12} y={5} width={4} height={35} fill="#64748b" />
            <rect x={8} y={5} width={4} height={35} fill="#64748b" />
            <rect x={-4} y={5} width={8} height={90} fill="#eab308" stroke="#ca8a04" strokeWidth="0.5"/>
            <rect x={-6} y={65} width={12} height={10} fill="#0ea5e9" rx="1" />
            <rect x={-4} y={-15} width={8} height={20} fill="#eab308" />
            <rect x={-10} y={-20} width={20} height={6} fill="#0f172a" />
        </g>
    );

    if (isEast) return (
        <g transform={`translate(${cx}, ${cy})`}>
            <rect x={35} y={-15} width={10} height={30} fill="#1e293b" rx="2" stroke="#0f172a" strokeWidth="1"/>
            <rect x={0} y={-15} width={10} height={30} fill="#1e293b" rx="2" stroke="#0f172a" strokeWidth="1"/>
            <rect x={5} y={-12} width={35} height={4} fill="#64748b" />
            <rect x={5} y={8} width={35} height={4} fill="#64748b" />
            <rect x={5} y={-4} width={90} height={8} fill="#eab308" stroke="#ca8a04" strokeWidth="0.5"/>
            <rect x={65} y={-6} width={10} height={12} fill="#0ea5e9" rx="1" />
            <rect x={-15} y={-4} width={20} height={8} fill="#eab308" />
            <rect x={-20} y={-10} width={6} height={20} fill="#0f172a" />
        </g>
    );
    
    return null;
};

const Ship = ({ berth, name, color = "#1e3a8a" }: { berth: string, name: string, color?: string }) => {
    if (berth === "B1") {
        return (
            <g>
                <path d="M 620,40 L 590,20 L 590,60 Z" fill="rgba(255,255,255,0.05)" />
                <path d="M 830,12 L 830,68 L 655,68 C 640,68 625,55 625,40 C 625,25 640,12 655,12 Z" fill="#0f172a" stroke="#020617" strokeWidth="2" />
                <path d="M 825,16 L 825,64 L 660,64 C 650,64 640,55 640,40 C 640,25 650,16 660,16 Z" fill={color} />
                <g fill="#0ea5e9" stroke="#0284c7" strokeWidth="1">
                    {Array.from({length: 8}).map((_,i) => <rect key={i} x={670 + i*16} y={22} width={12} height={36} />)}
                </g>
                <rect x="800" y="18" width="20" height="44" fill="#cbd5e1" rx="2" />
                <rect x="805" y="24" width="8" height="32" fill="#475569" />
                <text x="735" y="44" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1px">{name}</text>
            </g>
        );
    }
    if (berth === "B2") {
        return (
            <g>
                <path d="M 870,520 L 850,550 L 890,550 Z" fill="rgba(255,255,255,0.05)" />
                <path d="M 842,500 L 898,500 L 898,120 C 898,100 885,80 870,80 C 855,80 842,100 842,120 Z" fill="#0f172a" stroke="#020617" strokeWidth="2" />
                <path d="M 846,495 L 894,495 L 894,125 C 894,110 882,95 870,95 C 858,95 846,110 846,125 Z" fill={color} />
                <g fill="#f59e0b" stroke="#d97706" strokeWidth="1">
                    {Array.from({length: 15}).map((_,i) => <rect key={i} x={852} y={150 + i*18} width={36} height={14} />)}
                </g>
                <rect x="848" y="450" width="44" height="20" fill="#cbd5e1" rx="2" />
                <rect x="854" y="455" width="32" height="8" fill="#475569" />
                <text x="870" y="320" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1px" transform="rotate(-90, 870, 320)">{name}</text>
            </g>
        );
    }
    if (berth === "B3") {
        return (
            <g>
                <path d="M 120,820 L 150,800 L 150,840 Z" fill="rgba(255,255,255,0.05)" />
                <path d="M 680,848 L 680,792 L 180,792 C 160,792 140,805 140,820 C 140,835 160,848 180,848 Z" fill="#0f172a" stroke="#020617" strokeWidth="2" />
                <path d="M 675,844 L 675,796 L 185,796 C 170,796 155,807 155,820 C 155,833 170,844 185,844 Z" fill={color} />
                <g fill="#10b981" stroke="#059669" strokeWidth="1">
                    {Array.from({length: 12}).map((_,i) => <rect key={i} x={210 + i*30} y={802} width={24} height={36} />)}
                </g>
                <rect x="630" y="798" width="20" height="44" fill="#cbd5e1" rx="2" />
                <rect x="635" y="804" width="8" height="32" fill="#475569" />
                <text x="440" y="824" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1px">{name}</text>
            </g>
        );
    }
    return null;
}

export default function TerminalMap() {
    const [vesselInput, setVesselInput] = useState("AA7");
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

    const load = async () => {
        if (!vesselInput.trim()) return;
        setLoading(true);
        try {
            const res = await api.get(`/vessel/heatmap?vessel_id=${encodeURIComponent(vesselInput.trim())}`);
            setData(res.data);
        } catch (err) {
            console.error("Failed to load map data");
        } finally {
            setLoading(false);
        }
    };

    const renderBlockBase = (id: string, pos: any) => {
        return (
            <g key={`base-${id}`}>
                <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} fill="#1e293b" stroke="#334155" strokeWidth="1" rx="4" />
                <g opacity="0.4">
                    {Array.from({ length: BAY_COUNT }).map((_, i) => (
                        <rect key={i} x={pos.x + 4 + (pos.w - 8) / BAY_COUNT * i} y={pos.y + 4} width={(pos.w - 8) / BAY_COUNT - 2} height={pos.h - 8} fill="#0f172a" rx="1" />
                    ))}
                </g>
                <line x1={pos.x} y1={pos.cy} x2={pos.x + pos.w} y2={pos.cy} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
                <rect x={pos.x + 1} y={pos.y + 1} width={pos.w - 2} height={pos.h - 2} fill="none" stroke="#ca8a04" strokeWidth="0.5" opacity="0.5" rx="3" />
            </g>
        );
    };

    const renderHeatCloud = (id: string, pos: any) => {
        const block = data?.blocks[id];
        if (!block || block.count === 0) return null;
        return (
            <ellipse key={`heat-${id}`} cx={pos.cx} cy={pos.cy}
                rx={pos.w * 0.65} ry={pos.h * 0.75}
                fill={getHeatColor(block.concentration)} />
        );
    };

    const renderBlockLabels = (id: string, pos: any) => {
        const block = data?.blocks[id];
        const count = block?.count ?? 0;
        const intensity = block?.intensity ?? 0;
        const isMax = id === data?.max_block;
        const isRec = data?.recommended_berth?.includes(id);
        const isHovered = hoveredBlock === id;
        return (
            <g key={`lbl-${id}`} onMouseEnter={() => setHoveredBlock(id)} onMouseLeave={() => setHoveredBlock(null)} style={{ cursor: "pointer", transition: "all 0.2s" }}>
                {isRec && <rect x={pos.x - 4} y={pos.y - 4} width={pos.w + 8} height={pos.h + 8} rx="6" fill="none" stroke="#38bdf8" strokeWidth="3" strokeDasharray="8 4" opacity="0.8" />}
                {isHovered && <rect x={pos.x - 2} y={pos.y - 2} width={pos.w + 4} height={pos.h + 4} rx="4" fill="none" stroke="#fcd34d" strokeWidth="2" opacity="0.9" />}
                
                <rect x={pos.x + 6} y={pos.y + 6} width={34} height={20} rx="4" fill={isMax ? "rgba(220,38,38,0.9)" : "rgba(30,41,59,0.9)"} stroke="#475569" strokeWidth="1" />
                <text x={pos.x + 23} y={pos.y + 20} fill="#f8fafc" fontSize="11" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">{id}</text>
                
                {count > 0 && (
                    <g style={{ transform: isHovered ? "scale(1.05)" : "scale(1)", transformOrigin: `${pos.cx}px ${pos.cy}px`, transition: "all 0.2s ease" }}>
                        <circle cx={pos.cx} cy={pos.cy - 12} r="18" fill="rgba(15,23,42,0.85)" stroke="#475569" strokeWidth="1" />
                        <text x={pos.cx} y={pos.cy - 6} fill="#f8fafc" fontSize="16" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">{count}</text>
                    </g>
                )}
                
                {count > 0 && (
                    <>
                        <rect x={pos.x + 12} y={pos.y + pos.h - 24} width={pos.w - 24} height={8} rx="4" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                        <rect x={pos.x + 12} y={pos.y + pos.h - 24} width={(pos.w - 24) * Math.min(intensity, 1)} height={8} rx="4" 
                              fill={block?.concentration === "High" ? "#ef4444" : block?.concentration === "Medium" ? "#f97316" : "#10b981"} />
                        <text x={pos.cx} y={pos.y + pos.h - 6} fill="#94a3b8" fontSize="10" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">{`${(intensity * 100).toFixed(0)}% intensity`}</text>
                    </>
                )}
            </g>
        );
    };

    return (
        <div style={{ background: "#020617", color: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', sans-serif", padding: 0 }}>
            <style>{`
                @keyframes map-scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(1000px); } }
            `}</style>

            {/* HEADER */}
            <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "16px 24px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", zIndex: 10, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ background: "#1e293b", padding: "10px", borderRadius: "10px", border: "1px solid #334155" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                    </div>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", letterSpacing: "0.5px" }}>Terminal Map Viewer</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: "0.5px", marginTop: "2px" }}>APM Port Elizabeth — Container Yard Layout</div>
                    </div>
                </div>
                <div style={{ flex: 1 }} />

                <div style={{ display: "flex", gap: 16, alignItems: "center", background: "#020617", padding: "8px 16px", borderRadius: "8px", border: "1px solid #1e293b" }}>
                    {[{ c: "#10b981", l: "Low" }, { c: "#f97316", l: "Medium" }, { c: "#ef4444", l: "High" }].map(({ c, l }) => (
                        <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: `0 0 8px ${c}88` }} />{l}
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Target Vessel</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ position: "relative" }}>
                            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#64748b" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            </div>
                            <input value={vesselInput} onChange={e => setVesselInput(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="Enter Vessel ID..."
                                style={{ width: 180, background: "#020617", border: "1px solid #334155", color: "#f8fafc", fontFamily: "'Inter', sans-serif", fontSize: 13, padding: "8px 12px 8px 32px", borderRadius: 6, outline: "none" }} />
                        </div>
                        <button onClick={load} disabled={loading} style={{ background: "#0ea5e9", color: "#ffffff", border: "none", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, padding: "0 16px", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                            {loading ? "SCANNING..." : "LOCATE"}
                        </button>
                    </div>
                </div>
            </div>

            {/* MAP RENDERING */}
            <div style={{ padding: "24px", display: "flex", justifyContent: "center", overflowX: "auto" }}>
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1e293b", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", background: "#040f24", position: "relative" }}>
                    {loading && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "150px", background: "linear-gradient(to bottom, rgba(56,189,248,0), rgba(56,189,248,0.2), rgba(56,189,248,0))", animation: "map-scan 2s linear infinite", pointerEvents: "none", zIndex: 50 }} />}
                    
                    <svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ display: "block" }}>
                        <defs>
                            <filter id="hblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="35" /></filter>
                        </defs>
                        
                        {/* Ocean Background */}
                        <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="#040f24" />
                        <g opacity="0.1">
                            {Array.from({length: 36}).map((_, i) => (
                                <path key={i} d={`M -100,${i*25} Q -50,${i*25-10} 0,${i*25} T 100,${i*25} T 200,${i*25} T 300,${i*25} T 400,${i*25} T 500,${i*25} T 600,${i*25} T 700,${i*25} T 800,${i*25} T 900,${i*25} T 1000,${i*25}`} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
                            ))}
                        </g>

                        {/* Main Yard Base */}
                        <rect x="160" y="80" width="660" height="700" fill="#090e17" />
                        <rect x="0" y="80" width="160" height="700" fill="#090e17" />

                        {/* Concrete Berths */}
                        <rect x="160" y="80" width="660" height="55" fill="#1e293b" />
                        <rect x="765" y="80" width="55" height="700" fill="#1e293b" />
                        <rect x="160" y="725" width="660" height="55" fill="#1e293b" />

                        {/* Safety Edges */}
                        <line x1="160" y1="83" x2="820" y2="83" stroke="#eab308" strokeWidth="2" strokeDasharray="8 4" opacity="0.8" />
                        <line x1="817" y1="80" x2="817" y2="780" stroke="#eab308" strokeWidth="2" strokeDasharray="8 4" opacity="0.8" />
                        <line x1="160" y1="777" x2="820" y2="777" stroke="#eab308" strokeWidth="2" strokeDasharray="8 4" opacity="0.8" />

                        {/* Road Markings */}
                        <g stroke="#334155" strokeWidth="1.5" strokeDasharray="12 12" opacity="0.6">
                            <line x1="385" y1="135" x2="385" y2="725" />
                            <line x1="590" y1="135" x2="590" y2="725" />
                            <line x1="160" y1="150" x2="765" y2="150" />
                            <line x1="160" y1="332.5" x2="765" y2="332.5" />
                            <line x1="160" y1="512.5" x2="765" y2="512.5" />
                            <line x1="160" y1="702.5" x2="765" y2="702.5" />
                        </g>

                        {/* Blocks */}
                        {Object.entries(BLOCK_GRID).map(([id, g]) => renderBlockBase(id, getBlockRect(g.col, g.row)))}
                        
                        {/* Heatmap Overlay */}
                        {data && <g filter="url(#hblur)" style={{ mixBlendMode: "screen" }}>
                            {Object.entries(BLOCK_GRID).map(([id, g]) => renderHeatCloud(id, getBlockRect(g.col, g.row)))}
                        </g>}
                        
                        {/* Block Labels & Data */}
                        {data && Object.entries(BLOCK_GRID).map(([id, g]) => renderBlockLabels(id, getBlockRect(g.col, g.row)))}

                        {/* Cranes */}
                        {NORTH_CRANES.map((cx, i) => <Crane key={`nC${i}`} cx={cx} cy={135} dir="down" />)}
                        {EAST_CRANES.map((cy, i) => <Crane key={`eC${i}`} cx={765} cy={cy} dir="right" />)}
                        {SOUTH_CRANES.map((cx, i) => <Crane key={`sC${i}`} cx={cx} cy={727} dir="up" />)}

                        {/* Ships */}
                        <Ship berth="B1" name="MSC OSCAR" color="#1e3a8a" />
                        {data && <Ship berth="B2" name={data.vessel} color="#0f766e" />}
                        <Ship berth="B3" name="MAERSK ESSEX" color="#b45309" />
                    </svg>
                </div>
            </div>
        </div>
    );
}