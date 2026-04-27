import { useState } from "react";
import { api } from "../api/api"; // Added back your API call

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
    if (c === "High") return "rgba(220,38,38,0.88)";
    if (c === "Medium") return "rgba(249,115,22,0.86)";
    if (c === "Low") return "rgba(34,197,94,0.82)";
    return "rgba(255,255,255,0)";
};

const Crane = ({ cx, cy, dir }: { cx: number, cy: number, dir: string }) => {
    if (dir === "down") return (
        <g>
            <rect x={cx - 4} y={cy - 4} width={9} height={50} fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
            <rect x={cx - 65} y={cy - 4} width={70} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
            <rect x={cx + 5} y={cy - 4} width={35} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
            <line x1={cx - 30} y1={cy + 1} x2={cx - 30} y2={cy + 30} stroke="#92400E" strokeWidth="1" />
            <rect x={cx - 42} y={cy + 28} width={24} height={4} rx="1" fill="#B45309" />
        </g>
    );
    if (dir === "up") return (
        <g>
            <rect x={cx - 4} y={cy - 44} width={9} height={50} fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
            <rect x={cx - 65} y={cy} width={70} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
            <rect x={cx + 5} y={cy} width={35} height={5} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
            <line x1={cx - 30} y1={cy - 10} x2={cx - 30} y2={cy} stroke="#92400E" strokeWidth="1" />
            <rect x={cx - 42} y={cy - 14} width={24} height={4} rx="1" fill="#B45309" />
        </g>
    );
    return (
        <g>
            <rect x={cx - 4} y={cy - 4} width={50} height={9} fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
            <rect x={cx - 4} y={cy - 65} width={5} height={70} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
            <rect x={cx - 4} y={cy + 5} width={5} height={35} fill="#FBBF24" stroke="#B45309" strokeWidth="0.5" />
            <line x1={cx + 1} y1={cy - 30} x2={cx + 32} y2={cy - 30} stroke="#92400E" strokeWidth="1" />
            <rect x={cx + 28} y={cy - 42} width={4} height={24} rx="1" fill="#B45309" />
        </g>
    );
};

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
        const stepX = pos.w / BAY_COUNT;
        return (
            <g key={`base-${id}`}>
                <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} fill="#F8F7F0" stroke="#94A3B8" strokeWidth="0.8" />
                {Array.from({ length: BAY_COUNT - 1 }).map((_, i) => (
                    <line key={i} x1={pos.x + stepX * (i + 1)} y1={pos.y} x2={pos.x + stepX * (i + 1)} y2={pos.y + pos.h} stroke="#CBD5E1" strokeWidth="0.5" />
                ))}
                <line x1={pos.x} y1={pos.cy} x2={pos.x + pos.w} y2={pos.cy} stroke="#94A3B8" strokeWidth="0.8" strokeDasharray="5 4" />
                <rect x={pos.x} y={pos.y} width={pos.w} height={4} fill="#64748B" opacity="0.25" />
                <rect x={pos.x} y={pos.y + pos.h - 4} width={pos.w} height={4} fill="#64748B" opacity="0.25" />
            </g>
        );
    };

    const renderHeatCloud = (id: string, pos: any) => {
        const block = data?.blocks[id];
        if (!block || block.count === 0) return null;
        return (
            <ellipse key={`heat-${id}`} cx={pos.cx} cy={pos.cy}
                rx={pos.w * 0.6} ry={pos.h * 0.7}
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
            <g key={`lbl-${id}`} onMouseEnter={() => setHoveredBlock(id)} onMouseLeave={() => setHoveredBlock(null)} style={{ cursor: "pointer" }}>
                {isRec && <rect x={pos.x - 3} y={pos.y - 3} width={pos.w + 6} height={pos.h + 6} rx="5" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeDasharray="6 3" />}
                {isHovered && <rect x={pos.x - 2} y={pos.y - 2} width={pos.w + 4} height={pos.h + 4} rx="4" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />}
                <rect x={pos.x + 4} y={pos.y + 5} width={30} height={18} rx="3" fill={isMax ? "rgba(220,38,38,0.85)" : "rgba(15,23,42,0.72)"} />
                <text x={pos.x + 19} y={pos.y + 18} fill="#f8fafc" fontSize="9" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{id}</text>
                {count > 0 && <text x={pos.cx} y={pos.cy - 8} fill="#0f172a" fontSize="17" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">{count}</text>}
                {count > 0 && (
                    <>
                        <rect x={pos.x + 8} y={pos.y + pos.h - 22} width={pos.w - 16} height={8} rx="3" fill="rgba(0,0,0,0.12)" />
                        <rect x={pos.x + 8} y={pos.y + pos.h - 22} width={(pos.w - 16) * Math.min(intensity, 1)} height={8} rx="3" fill={block?.concentration === "High" ? "#dc2626" : block?.concentration === "Medium" ? "#f97316" : "#22c55e"} opacity="0.85" />
                        <text x={pos.cx} y={pos.y + pos.h - 8} fill="#475569" fontSize="9" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">{`${(intensity * 100).toFixed(0)}% intensity`}</text>
                    </>
                )}
            </g>
        );
    };

    const renderShip = (berth: string, vesselName: string) => {
        if (berth === "B1") return (
            <g key="ship-B1">
                <path d="M 820,8 L 820,72 L 655,72 L 636,40 L 655,8 Z" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
                <path d="M 820,8 L 820,20 L 660,20 L 642,40 L 660,60 L 820,60 L 820,72 L 655,72 L 636,40 L 655,8 Z" fill="#3D5068" />
                <rect x="696" y="16" width="48" height="44" rx="2" fill="#475569" stroke="#334155" strokeWidth="0.8" />
                {[0.3, 0.5, 0.7].map(t => (<rect key={t} x="703" y={16 + 44 * t - 4} width="10" height="7" rx="1" fill="#BAE6FD" opacity="0.9" />))}
                <text x="745" y="46" fill="#E2E8F0" fontSize="8" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">MSC OSCAR</text>
                <rect x="812" y="29" width="34" height="22" rx="3" fill="#1e40af" />
                <text x="829" y="44" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B1</text>
            </g>
        );
        if (berth === "B2") return (
            <g key="ship-B2">
                <path d="M 836,80 L 836,510 L 905,510 L 926,295 L 905,80 Z" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
                <path d="M 836,80 L 848,80 L 912,80 L 912,510 L 836,510 Z" fill="#3D5068" />
                <rect x="852" y="220" width="44" height="76" rx="2" fill="#475569" stroke="#334155" strokeWidth="0.8" />
                {[0.3, 0.5, 0.7].map(t => (<rect key={t} x="858" y={220 + 76 * t - 4} width="10" height="7" rx="1" fill="#BAE6FD" opacity="0.9" />))}
                <text x="875" y="280" fill="#E2E8F0" fontSize="8" fontWeight="600" fontFamily="sans-serif" textAnchor="middle" transform="rotate(90,875,280)">{vesselName}</text>
                <rect x="824" y="284" width="34" height="22" rx="3" fill="#1e40af" />
                <text x="841" y="299" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B2</text>
            </g>
        );
        return (
            <g key="ship-B3">
                <path d="M 160,790 L 160,852 L 705,852 L 726,820 L 705,790 Z" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
                <path d="M 160,790 L 160,802 L 703,802 L 722,820 L 703,840 L 160,840 L 160,852 L 705,852 L 726,820 L 705,790 Z" fill="#3D5068" />
                <rect x="372" y="798" width="50" height="44" rx="2" fill="#475569" stroke="#334155" strokeWidth="0.8" />
                {[0.3, 0.5, 0.7].map(t => (<rect key={t} x="379" y={798 + 44 * t - 3} width="10" height="6" rx="1" fill="#BAE6FD" opacity="0.9" />))}
                <text x="397" y="836" fill="#E2E8F0" fontSize="8" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">MAERSK ESSEX</text>
                <rect x="155" y="808" width="34" height="22" rx="3" fill="#1e40af" />
                <text x="172" y="823" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">B3</text>
            </g>
        );
    };

    return (
        <div style={{ background: "#0a0e1a", color: "#e2e8f0", minHeight: "100vh", fontFamily: "'Courier New',monospace", padding: 0 }}>
            <style>{`@keyframes hm-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

            {/* HEADER */}
            <div style={{ background: "#0d1322", borderBottom: "1px solid #1e2d4a", padding: "10px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>🗺️</span>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", letterSpacing: "1.5px", textTransform: "uppercase" }}>Terminal Map Viewer</div>
                        <div style={{ fontSize: 8, color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase" }}>APM Port Elizabeth — Container Yard Layout</div>
                    </div>
                </div>
                <div style={{ flex: 1 }} />

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {[{ c: "rgba(34,197,94,0.82)", l: "Low" }, { c: "rgba(249,115,22,0.86)", l: "Medium" }, { c: "rgba(220,38,38,0.88)", l: "High" }].map(({ c, l }) => (
                        <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />{l}
                        </div>
                    ))}
                </div>

                {/* Vessel search built back in */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontSize: 8, color: "#5a7a9a", letterSpacing: "1px", textTransform: "uppercase" }}>Vessel ID</div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <input value={vesselInput} onChange={e => setVesselInput(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="Vessel name or ID"
                            style={{ width: 160, background: "#111828", border: "1px solid #4a9eff55", color: "#e2e8f0", fontFamily: "'Courier New',monospace", fontSize: 12, padding: "4px 8px", borderRadius: 4, outline: "none" }} />
                        <button onClick={load} style={{ background: "#4a9eff22", color: "#4a9eff", border: "1px solid #4a9eff", fontFamily: "'Courier New',monospace", fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", padding: "4px 12px", borderRadius: 4, cursor: "pointer" }}>
                            {loading ? "..." : "LOAD"}
                        </button>
                    </div>
                </div>
            </div>

            {/* MAP RENDERING */}
            <div style={{ padding: "16px", overflowX: "auto" }}>
                <div style={{ display: "inline-block", borderRadius: 10, overflow: "hidden", border: "1px solid #1e2d4a", boxShadow: "0 0 40px rgba(74,158,255,0.08)" }}>
                    <svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ display: "block" }}>
                        <defs><filter id="hblur" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="30" /></filter></defs>
                        <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="#7EC8E3" />
                        <rect x="160" y="80" width="660" height="700" fill="#DDD8C4" />
                        <rect x="0" y="80" width="160" height="700" fill="#C8C4B0" />
                        <rect x="160" y="80" width="660" height="55" fill="#9CA3AF" />
                        <rect x="765" y="80" width="55" height="700" fill="#9CA3AF" />
                        <rect x="160" y="725" width="660" height="55" fill="#9CA3AF" />

                        {Object.entries(BLOCK_GRID).map(([id, g]) => renderBlockBase(id, getBlockRect(g.col, g.row)))}
                        {data && <g filter="url(#hblur)" style={{ mixBlendMode: "multiply" }}>
                            {Object.entries(BLOCK_GRID).map(([id, g]) => renderHeatCloud(id, getBlockRect(g.col, g.row)))}
                        </g>}
                        {data && Object.entries(BLOCK_GRID).map(([id, g]) => renderBlockLabels(id, getBlockRect(g.col, g.row)))}

                        {NORTH_CRANES.map((cx, i) => <Crane key={`nC${i}`} cx={cx} cy={135} dir="down" />)}
                        {EAST_CRANES.map((cy, i) => <Crane key={`eC${i}`} cx={765} cy={cy} dir="right" />)}
                        {SOUTH_CRANES.map((cx, i) => <Crane key={`sC${i}`} cx={cx} cy={727} dir="up" />)}

                        {renderShip("B1", "MSC OSCAR")}
                        {data && renderShip("B2", data.vessel)}
                        {renderShip("B3", "MAERSK ESSEX")}
                    </svg>
                </div>
            </div>
        </div>
    );
}