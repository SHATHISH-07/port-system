import { useEffect, useState } from "react";
import {
  Box, Typography, TextField, Button, CircularProgress, Divider, InputAdornment,
} from "@mui/material";
import {
  SearchRounded,
  AutoGraphRounded,
  WarningAmberRounded,
  CheckCircleOutlineRounded,
  HelpOutlineRounded,
  GridViewOutlined,
  StarRounded
} from "@mui/icons-material";
import { api } from "../api/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BlockData {
  count: number;
  hazardous: number;
  reefer: number;
  oog: number;
  intensity: number;
  concentration: "High" | "Medium" | "Low";
}

interface VesselHeatmapResponse {
  vessel: string;
  visit_id: string;
  recommended_berth: string;
  max_block: string;
  summary: { hazardous: number; reefer: number; oog: number };
  layout: Record<string, { x: number; y: number }>;
  blocks: Record<string, BlockData>;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
const CONC_COLOR = {
  High: { fill: "#dc2626", track: "rgba(220,38,38,0.18)", text: "#f87171", border: "rgba(220,38,38,0.30)" }, // Red
  Medium: { fill: "#ea580c", track: "rgba(234,88,12,0.18)", text: "#fb923c", border: "rgba(234,88,12,0.30)" }, // Orange
  Low: { fill: "#16a34a", track: "rgba(22,163,74,0.18)", text: "#4ade80", border: "rgba(22,163,74,0.30)" }, // Green
};

const concColor = (c?: "High" | "Medium" | "Low") =>
  CONC_COLOR[c ?? "Low"];

// Row labels
const ROW_LABELS: Record<number, string> = {
  0: "ROW A - FAR ZONE",
  1: "ROW B - MID ZONE",
  2: "ROW C - NEAR QUAY",
  3: "ROW D - QUAY SIDE",
};

// ─── Single block tile ────────────────────────────────────────────────────────
function BlockTile({
  blockId, block, isMax,
}: {
  blockId: string;
  block?: BlockData;
  isMax: boolean;
}) {
  if (!block || block.count === 0) return null;

  const cc = concColor(block.concentration);
  const pct = (block.intensity * 100).toFixed(0);

  return (
    <Box
      sx={{
        bgcolor: "#111827",
        border: isMax ? "2px solid #a855f7" : "1px solid rgba(255,255,255,0.05)",
        boxShadow: isMax ? "0 0 20px rgba(168, 85, 247, 0.4), inset 0 0 10px rgba(168, 85, 247, 0.1)" : "none",
        borderRadius: 2,
        p: 2,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 140,
        // Force exactly up to 3 blocks per row centrally
        flex: "0 1 calc(33.333% - 16px)",
        minWidth: 180,
        maxWidth: 280,
        transition: "transform 150ms",
        zIndex: 2,
        "&:hover": { transform: "translateY(-2px)" },
      }}
    >
      {isMax && (
        <StarRounded sx={{ position: "absolute", top: 8, right: 8, color: "#a855f7", fontSize: 20 }} />
      )}

      <Typography sx={{ position: "absolute", top: 12, left: 14, fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Block {blockId}
      </Typography>

      <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Typography
          sx={{
            fontSize: "2.75rem",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1,
            fontFamily: "'Google Sans', Roboto, sans-serif",
          }}
        >
          {pct}%
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6", mt: 0.5 }}>
          {block.count} Containers
        </Typography>
      </Box>

      <Box sx={{ position: "absolute", bottom: 16, width: "calc(100% - 32px)", height: 4, bgcolor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
        <Box
          sx={{
            height: "100%",
            width: `${Math.min(Number(pct), 100)}%`,
            bgcolor: cc.fill,
            borderRadius: 3,
            transition: "width 600ms ease",
          }}
        />
      </Box>
    </Box>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HeatmapPage() {
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
      .then(res => setData(res.data))
      .catch(() => setError("Failed to load data. Check vessel ID and try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHeatmap(); }, []);

  // 1) Extract and chunk active blocks logic (3 per row, max block strictly at the very end)
  const chunkedRows: string[][] = [];
  if (data) {
    const activeBlockIds = Object.entries(data.blocks)
      .filter(([, block]) => block.count > 0)
      .map(([id]) => id);

    // Isolate max block
    const withoutMax = activeBlockIds.filter(id => id !== data.max_block);

    // Sort standard blocks by original layout proximity to keep things tidy
    withoutMax.sort((a, b) => {
      const posA = data.layout[a] || { x: 0, y: 0 };
      const posB = data.layout[b] || { x: 0, y: 0 };
      return posA.y - posB.y || posA.x - posB.x;
    });

    // Re-append max block at the absolute end so it's always closest to the berth
    const finalOrder = [...withoutMax, data.max_block];

    // Chunk into arrays of 3
    for (let i = 0; i < finalOrder.length; i += 3) {
      chunkedRows.push(finalOrder.slice(i, i + 3));
    }
  }

  const totalContainers = data
    ? Object.values(data.blocks).reduce((s, b) => s + b.count, 0)
    : 0;

  // Efficiency string calculator
  const calcEfficiency = (targetBerth: number) => {
    if (!data) return "";
    const optimalBerthNum = parseInt(data.recommended_berth.replace(/\D/g, '')) || 2;
    if (targetBerth === optimalBerthNum) return "100% Optimal";

    const distance = Math.abs(targetBerth - optimalBerthNum);
    const intensityWeight = data.blocks[data.max_block]?.intensity * 20 || 15;
    const penalty = Math.round((distance * 25) + intensityWeight);

    return `-${penalty}% efficiency`;
  };

  const optimalNum = data ? parseInt(data.recommended_berth.replace(/\D/g, '')) || 2 : 2;

  // Calculate the physical X position of the max block for SVG lines to target
  let maxBlockTargetX = 50; // Default center
  if (chunkedRows.length > 0) {
    const lastRowLength = chunkedRows[chunkedRows.length - 1].length;
    if (lastRowLength === 3) maxBlockTargetX = 83.3; // Right-most of 3
    else if (lastRowLength === 2) maxBlockTargetX = 66.6; // Right of 2
    else maxBlockTargetX = 50; // Centered by itself
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", bgcolor: "#060d17", minHeight: "100vh", p: 2 }}>

      {/* ── QUERY CARD ──────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: "#0d1726",
          border: "1px solid rgba(138,180,248,0.15)",
          borderRadius: 2,
          p: 3,
          mb: 3,
          display: "flex",
          alignItems: "flex-end",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase", mb: 1 }}>
            Query parameters
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <TextField
              placeholder="Vessel ID (e.g. AA7)"
              value={vesselInput}
              onChange={e => setVesselInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchHeatmap()}
              size="small"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 16, color: "#8ab4f8" }} /></InputAdornment> }}
              sx={{
                width: 240,
                "& .MuiOutlinedInput-root": { borderRadius: 1, color: "#fff", bgcolor: "rgba(255,255,255,0.05)" },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(138,180,248,0.2)" }
              }}
            />
            <Button
              variant="contained"
              onClick={fetchHeatmap}
              disabled={loading}
              startIcon={loading ? undefined : <AutoGraphRounded sx={{ fontSize: 16 }} />}
              sx={{ height: 37, px: 2.5, borderRadius: 1, bgcolor: "#1a73e8" }}
            >
              {loading ? <CircularProgress size={16} color="inherit" /> : "Load Data"}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Empty State */}
      {!data && !loading && !error && (
        <Box sx={{ py: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "1px dashed rgba(138,180,248,0.2)", borderRadius: 2 }}>
          <GridViewOutlined sx={{ fontSize: 40, color: "#5f6368" }} />
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 500, color: "#9aa0a6" }}>No heatmap data</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "#5f6368" }}>Enter a Vessel ID above and click Load Data</Typography>
        </Box>
      )}

      {data && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

          {/* ── SUMMARY STRIP ─────────────────────────────────── */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(4,1fr)", md: "repeat(7,1fr)" },
              gap: 1.5,
            }}
          >
            {[
              { label: "Vessel", value: data.vessel, accent: "#ffffff" },
              { label: "Visit ID", value: data.visit_id, accent: "#9aa0a6" },
              { label: "Total Containers", value: String(totalContainers), accent: "#ffffff" },
              { label: "Recommended Berth", value: data.recommended_berth, accent: "#4ade80" },
              { label: "Highest Block", value: data.max_block, accent: "#a855f7" },
              { label: "Hazardous", value: String(data.summary?.hazardous ?? 0), accent: "#f87171" },
              { label: "Reefer / OOG", value: `${data.summary?.reefer ?? 0} / ${data.summary?.oog ?? 0}`, accent: "#8ab4f8" },
            ].map(({ label, value, accent }) => (
              <Box
                key={label}
                sx={{
                  bgcolor: "#0d1726",
                  border: "1px solid rgba(138,180,248,0.15)",
                  borderRadius: 1.5,
                  px: 2,
                  py: 1.5,
                }}
              >
                <Typography sx={{ fontSize: "0.625rem", fontWeight: 500, color: "#8ab4f8", letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.5 }}>
                  {label}
                </Typography>
                <Typography sx={{ fontSize: "1rem", fontWeight: 400, color: accent, lineHeight: 1.2, fontFamily: "'Google Sans', Roboto, sans-serif" }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* ── MAIN CONTENT ──────────────────────────────────── */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 280px" }, gap: 3, alignItems: "start" }}>

            {/* LEFT — Block Grid Map */}
            <Box
              sx={{
                bgcolor: "#0d1726",
                border: "1px solid rgba(138,180,248,0.15)",
                borderRadius: 2,
                overflow: "hidden",
                backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
                position: "relative",
                display: "flex",
                flexDirection: "column"
              }}
            >
              {/* Header */}
              <Box sx={{ px: 3, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)", display: "flex", alignItems: "center", gap: 1, bgcolor: "#0d1726" }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}>
                  Vessel Cargo Concentration — {data.vessel}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#4ade80" }} />
                  <Typography sx={{ fontSize: "0.6875rem", color: "#4ade80", fontWeight: 600, letterSpacing: "0.05em" }}>LIVE</Typography>
                </Box>
              </Box>

              {/* Grid Rows (Rendered in max-3 chunks, max block guaranteed in last row) */}
              <Box sx={{ p: 4, pb: 0, display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
                {chunkedRows.map((rowBlockIds, rowIdx) => (
                  <Box key={rowIdx} sx={{ position: "relative", zIndex: 2 }}>
                    <Typography
                      sx={{
                        position: "absolute", right: 0, top: -28,
                        fontSize: "0.625rem", fontWeight: 600, color: "#475e7a",
                        letterSpacing: "0.1em", textTransform: "uppercase"
                      }}
                    >
                      {ROW_LABELS[rowIdx] || `ROW ${rowIdx + 1} ZONE`}
                    </Typography>

                    <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }}>
                      {rowBlockIds.map(blockId => (
                        <BlockTile
                          key={blockId}
                          blockId={blockId}
                          block={data.blocks[blockId]}
                          isRecommended={data.recommended_berth.includes(blockId)}
                          isMax={blockId === data.max_block}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* ── BERTHS AND DYNAMIC DASHED LINES ────────────────── */}
              <Box sx={{ position: "relative", pt: 6, pb: 4, px: 4, mt: "auto" }}>

                {/* SVG Connecting Lines - Originating from center of berths directly to the highest block */}
                <svg width="100%" height="80" style={{ position: "absolute", top: -20, left: 0, zIndex: 1, overflow: "visible" }}>

                  {/* Line from Berth 1 to Max Block */}
                  <path d={`M 16.6% 80 L ${maxBlockTargetX}% 0`} fill="none" stroke={optimalNum === 1 ? "#4ade80" : "#dc2626"} strokeWidth="2" strokeDasharray="6,6" opacity={optimalNum === 1 ? "1" : "0.5"} />
                  <text x={`${(16.6 + maxBlockTargetX) / 2}%`} y="40" fill={optimalNum === 1 ? "#4ade80" : "#dc2626"} fontSize="11" fontWeight="600" textAnchor="middle" style={{ textShadow: "0px 0px 4px #000" }}>
                    {calcEfficiency(1)}
                  </text>

                  {/* Line from Berth 2 to Max Block */}
                  <path d={`M 50% 80 L ${maxBlockTargetX}% 0`} fill="none" stroke={optimalNum === 2 ? "#4ade80" : "#dc2626"} strokeWidth="2" strokeDasharray="6,6" opacity={optimalNum === 2 ? "1" : "0.5"} />
                  <text x={`${(50 + maxBlockTargetX) / 2}%`} y="40" fill={optimalNum === 2 ? "#4ade80" : "#dc2626"} fontSize="11" fontWeight="600" textAnchor="middle" style={{ textShadow: "0px 0px 4px #000" }}>
                    {calcEfficiency(2)}
                  </text>

                  {/* Line from Berth 3 to Max Block */}
                  <path d={`M 83.3% 80 L ${maxBlockTargetX}% 0`} fill="none" stroke={optimalNum === 3 ? "#4ade80" : "#dc2626"} strokeWidth="2" strokeDasharray="6,6" opacity={optimalNum === 3 ? "1" : "0.5"} />
                  <text x={`${(83.3 + maxBlockTargetX) / 2}%`} y="40" fill={optimalNum === 3 ? "#4ade80" : "#dc2626"} fontSize="11" fontWeight="600" textAnchor="middle" style={{ textShadow: "0px 0px 4px #000" }}>
                    {calcEfficiency(3)}
                  </text>

                </svg>

                {/* Berth Docks Layout */}
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, position: "relative", zIndex: 2 }}>

                  {/* Berth 1 */}
                  <Box sx={{ border: optimalNum === 1 ? "2px solid #4ade80" : "2px solid rgba(138,180,248,0.2)", bgcolor: optimalNum === 1 ? "rgba(74, 222, 128, 0.1)" : "#111827", boxShadow: optimalNum === 1 ? "0 -5px 15px rgba(74, 222, 128, 0.2)" : "none", borderRadius: "8px 8px 0 0", p: 1.5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "0.6875rem", fontWeight: optimalNum === 1 ? 700 : 600, color: optimalNum === 1 ? "#4ade80" : "#8ab4f8", letterSpacing: "0.1em" }}>
                      {optimalNum === 1 ? "OPTIMAL BERTH 1" : "BERTH 1"}
                    </Typography>
                    <Box sx={{ display: "flex", gap: "2px", justifyContent: "center", mt: 1 }}>
                      {[1, 2, 3, 4, 5, 6].map(i => <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: optimalNum === 1 ? "#4ade80" : "rgba(138,180,248,0.2)" }} />)}
                    </Box>
                  </Box>

                  {/* Berth 2 */}
                  <Box sx={{ border: optimalNum === 2 ? "2px solid #4ade80" : "2px solid rgba(138,180,248,0.2)", bgcolor: optimalNum === 2 ? "rgba(74, 222, 128, 0.1)" : "#111827", boxShadow: optimalNum === 2 ? "0 -5px 15px rgba(74, 222, 128, 0.2)" : "none", borderRadius: "8px 8px 0 0", p: 1.5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "0.6875rem", fontWeight: optimalNum === 2 ? 700 : 600, color: optimalNum === 2 ? "#4ade80" : "#8ab4f8", letterSpacing: "0.1em" }}>
                      {optimalNum === 2 ? "OPTIMAL BERTH 2" : "BERTH 2"}
                    </Typography>
                    <Box sx={{ display: "flex", gap: "2px", justifyContent: "center", mt: 1 }}>
                      {[1, 2, 3, 4, 5, 6].map(i => <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: optimalNum === 2 ? "#4ade80" : "rgba(138,180,248,0.2)" }} />)}
                    </Box>
                  </Box>

                  {/* Berth 3 */}
                  <Box sx={{ border: optimalNum === 3 ? "2px solid #4ade80" : "2px solid rgba(138,180,248,0.2)", bgcolor: optimalNum === 3 ? "rgba(74, 222, 128, 0.1)" : "#111827", boxShadow: optimalNum === 3 ? "0 -5px 15px rgba(74, 222, 128, 0.2)" : "none", borderRadius: "8px 8px 0 0", p: 1.5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "0.6875rem", fontWeight: optimalNum === 3 ? 700 : 600, color: optimalNum === 3 ? "#4ade80" : "#8ab4f8", letterSpacing: "0.1em" }}>
                      {optimalNum === 3 ? "OPTIMAL BERTH 3" : "BERTH 3"}
                    </Typography>
                    <Box sx={{ display: "flex", gap: "2px", justifyContent: "center", mt: 1 }}>
                      {[1, 2, 3, 4, 5, 6].map(i => <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: optimalNum === 3 ? "#4ade80" : "rgba(138,180,248,0.2)" }} />)}
                    </Box>
                  </Box>

                </Box>
              </Box>
            </Box>

            {/* RIGHT PANEL */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

              {/* Recommended Berth card */}
              <Box sx={{ bgcolor: "#0d1726", border: "1.5px solid rgba(74, 222, 128, 0.4)", borderRadius: 2, overflow: "hidden" }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)" }}>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Berth Suitability
                  </Typography>
                </Box>
                <Box sx={{ px: 2.5, py: 2.5 }}>
                  <Typography sx={{ fontSize: 32, fontWeight: 700, color: "#4ade80", lineHeight: 1, fontFamily: "'Google Sans', Roboto, sans-serif", mb: 0.5 }}>
                    {data.recommended_berth}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1 }}>
                    <CheckCircleOutlineRounded sx={{ fontSize: 14, color: "#4ade80" }} />
                    <Typography sx={{ fontSize: "0.75rem", color: "#4ade80" }}>Optimal assignment</Typography>
                  </Box>
                  <Divider sx={{ borderColor: "rgba(138,180,248,0.1)", my: 1.5 }} />
                  <Typography sx={{ fontSize: "0.625rem", fontWeight: 500, color: "#8ab4f8", letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.75 }}>
                    Nearest High Density Block
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 300, color: "#a855f7", fontFamily: "'Google Sans', Roboto, sans-serif" }}>
                    {data.max_block}
                  </Typography>
                  {data.blocks[data.max_block] && (
                    <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6", mt: 0.25 }}>
                      {data.blocks[data.max_block].count} Containers · {(data.blocks[data.max_block].intensity * 100).toFixed(0)}% utilisation
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Cargo summary */}
              <Box sx={{ bgcolor: "#0d1726", border: "1px solid rgba(138,180,248,0.15)", borderRadius: 2, overflow: "hidden" }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)" }}>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Cargo Summary
                  </Typography>
                </Box>
                <Box sx={{ px: 2.5, py: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
                  {[
                    { label: "Hazardous", value: data.summary?.hazardous ?? 0, accent: "#f87171", warnAt: 1 },
                    { label: "Reefer", value: data.summary?.reefer ?? 0, accent: "#60a5fa", warnAt: 1 },
                    { label: "OOG", value: data.summary?.oog ?? 0, accent: "#c084fc", warnAt: 1 },
                  ].map(({ label, value, accent, warnAt }) => (
                    <Box key={label} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Typography sx={{ fontSize: "0.8125rem", color: "#9aa0a6" }}>{label}</Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        {value >= warnAt && <WarningAmberRounded sx={{ fontSize: 13, color: accent }} />}
                        <Typography sx={{ fontSize: "0.875rem", fontWeight: 500, color: value >= warnAt ? accent : "#5f6368" }}>
                          {value}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                  {(data.summary?.hazardous ?? 0) === 0 &&
                    (data.summary?.reefer ?? 0) === 0 &&
                    (data.summary?.oog ?? 0) === 0 && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                        <CheckCircleOutlineRounded sx={{ fontSize: 14, color: "#4ade80" }} />
                        <Typography sx={{ fontSize: "0.75rem", color: "#4ade80" }}>No special cargo</Typography>
                      </Box>
                    )}
                </Box>
              </Box>

              {/* Visual Legend Panel */}
              <Box sx={{ bgcolor: "#0d1726", border: "1px solid rgba(138,180,248,0.15)", borderRadius: 2, overflow: "hidden", mt: 'auto' }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)", display: "flex", alignItems: "center", gap: 1 }}>
                  <HelpOutlineRounded sx={{ fontSize: 14, color: "#8ab4f8" }} />
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Concentration Legend
                  </Typography>
                </Box>
                <Box sx={{ px: 2.5, py: 2 }}>
                  <Box sx={{ width: "100%", height: 6, borderRadius: 2, mb: 1.5, background: "linear-gradient(90deg, #16a34a 0%, #ea580c 50%, #dc2626 100%)" }} />

                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                    {([
                      { level: "High", desc: "> 65% utilisation", ...CONC_COLOR.High },
                      { level: "Medium", desc: "30 – 65% utilisation", ...CONC_COLOR.Medium },
                      { level: "Low", desc: "< 30% utilisation", ...CONC_COLOR.Low },
                    ] as const).map(({ level, desc, fill, text }) => (
                      <Box key={level} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: fill }} />
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: text }}>{level}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: "0.6875rem", color: "#9aa0a6" }}>{desc}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>

            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}