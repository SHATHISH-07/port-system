import { Box, Typography, Divider, Stack } from "@mui/material";
import { StarRounded, ViewInArRounded, InventoryRounded, WarningAmberRounded, HelpOutlineRounded, CheckCircleOutlineRounded } from "@mui/icons-material";
import type { BlockData, VesselHeatmapViewData } from "../../../types/heatmap";

const CONC_COLOR = {
  High: { fill: "#dc2626", text: "#f87171" },
  Medium: { fill: "#ea580c", text: "#fb923c" },
  Low: { fill: "#16a34a", text: "#4ade80" },
} as const;

const concColor = (c?: "High" | "Medium" | "Low") => CONC_COLOR[c ?? "Low"];

const ROW_LABELS: Record<number, string> = {
  0: "ROW A - FAR ZONE",
  1: "ROW B - MID ZONE",
  2: "ROW C - NEAR QUAY",
  3: "ROW D - QUAY SIDE",
};

function BlockTile({ blockId, block, isMax }: { blockId: string; block?: BlockData; isMax: boolean }) {
  if (!block || block.count === 0) return null;

  const cc = concColor(block.concentration);
  const pct = Math.round((block.intensity || 0) * 100);

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
        flex: "0 1 calc(33.333% - 16px)",
        minWidth: 180,
        maxWidth: 280,
        transition: "transform 150ms",
        zIndex: 2,
        "&:hover": { transform: "translateY(-2px)" },
      }}
    >
      {isMax && <StarRounded sx={{ position: "absolute", top: 8, right: 8, color: "#a855f7", fontSize: 20 }} />}
      <Typography sx={{ position: "absolute", top: 12, left: 14, fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Block {blockId}
      </Typography>
      <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Typography sx={{ fontSize: "2.75rem", fontWeight: 700, color: "#ffffff", lineHeight: 1, fontFamily: "'Google Sans', Roboto, sans-serif" }}>
          {pct}%
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6", mt: 0.5 }}>
          {block.count} Containers
        </Typography>
      </Box>
      <Box sx={{ position: "absolute", bottom: 16, width: "calc(100% - 32px)", height: 4, bgcolor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ height: "100%", width: `${Math.min(pct, 100)}%`, bgcolor: cc.fill, borderRadius: 3, transition: "width 600ms ease" }} />
      </Box>
    </Box>
  );
}

export default function HeatmapView({ data }: { data: VesselHeatmapViewData }) {
  if (!data) return null;

  const safeBerth = data.recommended_berth || "";
  const optimalNum = parseInt(safeBerth.replace(/\D/g, ""), 10) || 2;

  const activeBlockIds = Object.entries(data.blocks || {}).filter(([, block]) => block.count > 0).map(([id]) => id);
  const withoutMax = activeBlockIds.filter((id) => id !== data.max_block);

  withoutMax.sort((a, b) => {
    const posA = data.layout[a] || { x: 0, y: 0 };
    const posB = data.layout[b] || { x: 0, y: 0 };
    return posA.y - posB.y || posA.x - posB.x;
  });

  const totalItems = withoutMax.length + (data.max_block ? 1 : 0);
  const lastRowLength = totalItems % 3 === 0 ? 3 : totalItems % 3 || 3;
  const targetIndexInRow = Math.min(optimalNum - 1, lastRowLength - 1);
  const insertIndex = Math.max(0, totalItems - lastRowLength + targetIndexInRow);

  const finalOrder = [...withoutMax];
  if (data.max_block) finalOrder.splice(insertIndex, 0, data.max_block);

  const chunkedRows: string[][] = [];
  for (let i = 0; i < finalOrder.length; i += 3) {
    chunkedRows.push(finalOrder.slice(i, i + 3));
  }

  const totalContainers = Object.values(data.blocks || {}).reduce((s, b) => s + (b.count || 0), 0);
  const hazmatTotal = data.summary?.hazmat_total ?? data.summary?.hazardous ?? 0;
  const reeferTotal = data.summary?.reefer_total ?? data.summary?.reefer ?? 0;
  const oogTotal = data.summary?.oog_total ?? data.summary?.oog ?? 0;

  const calcEfficiency = (targetBerth: number) => {
    if (targetBerth === optimalNum) return "100% Optimal";
    const distance = Math.abs(targetBerth - optimalNum);
    const intensityWeight = (data.blocks[data.max_block || ""]?.intensity || 0) * 20 || 15;
    const penalty = Math.round((distance * 25) + intensityWeight);
    return `-${penalty}% efficiency`;
  };

  let maxBlockTargetX = 50;
  if (chunkedRows.length > 0 && data.max_block) {
    const maxRow = chunkedRows.find((row) => row.includes(data.max_block!));
    if (maxRow) {
      const colIdx = maxRow.indexOf(data.max_block);
      if (maxRow.length === 3) maxBlockTargetX = colIdx === 0 ? 16.6 : colIdx === 1 ? 50 : 83.3;
      else if (maxRow.length === 2) maxBlockTargetX = colIdx === 0 ? 33.3 : 66.6;
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: { xs: 10, lg: 12 }, pb: 16, px: { xs: 2, md: 4, lg: 6 } }}>

      {/* Top Header Grid fixed for responsive wrapping without pushing off screen */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1.5, minWidth: 0 }}>
        {[
          { label: "Vessel", value: data.vessel || "—", accent: "#ffffff" },
          { label: "Visit ID", value: data.visit_id || "—", accent: "#9aa0a6" },
          { label: "Total Containers", value: String(totalContainers), accent: "#ffffff" },
          { label: "Recommended Berth", value: data.recommended_berth || "Unassigned", accent: "#4ade80" },
          { label: "Highest Block", value: data.max_block || "—", accent: "#a855f7" },
          { label: "Hazardous", value: String(hazmatTotal), accent: "#f87171" },
          { label: "Reefer / OOG", value: `${reeferTotal} / ${oogTotal}`, accent: "#8ab4f8" },
        ].map(({ label, value, accent }) => (
          <Box key={label} sx={{ border: "1px solid rgba(138,180,248,0.15)", borderRadius: 1.5, px: 2, py: 1.5, bgcolor: "background.paper", minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.625rem", fontWeight: 500, color: "#8ab4f8", letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.5 }}>{label}</Typography>
            <Typography noWrap sx={{ fontSize: "1rem", fontWeight: 400, color: accent, lineHeight: 1.2, fontFamily: "'Google Sans', Roboto, sans-serif" }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 320px" }, gap: 3, alignItems: "start", minWidth: 0 }}>

        {/* Left Side: Heatmap Blocks */}
        <Box sx={{ bgcolor: "#0d1726", border: "1px solid rgba(138,180,248,0.15)", borderRadius: 2, overflow: "hidden", backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", position: "relative", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Box sx={{ px: 3, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)", display: "flex", alignItems: "center", gap: 1, bgcolor: "#0d1726" }}>
            <Typography noWrap sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}>
              Vessel Cargo Concentration — {data.vessel}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#4ade80" }} />
              <Typography sx={{ fontSize: "0.6875rem", color: "#4ade80", fontWeight: 600, letterSpacing: "0.05em" }}>LIVE</Typography>
            </Box>
          </Box>

          <Box sx={{ p: { xs: 2, md: 4 }, pb: 0, display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 }}>
            {chunkedRows.map((rowBlockIds, rowIdx) => (
              <Box key={rowIdx} sx={{ position: "relative", zIndex: 2 }}>
                <Typography sx={{ position: "absolute", right: 0, top: -28, fontSize: "0.625rem", fontWeight: 600, color: "#475e7a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {ROW_LABELS[rowIdx] || `ROW ${rowIdx + 1} ZONE`}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }}>
                  {rowBlockIds.map((blockId) => (
                    <BlockTile key={blockId} blockId={blockId} block={data.blocks[blockId]} isMax={blockId === data.max_block} />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ position: "relative", pt: 6, pb: 4, px: 4, mt: "auto", display: { xs: "none", md: "block" } }}>
            <svg width="100%" height="80" style={{ position: "absolute", top: -20, left: 0, zIndex: 1, overflow: "visible" }}>
              {[1, 2, 3].map((num) => {
                const startX = num === 1 ? 16.6 : num === 2 ? 50 : 83.3;
                const isOpt = optimalNum === num;
                return (
                  <g key={num}>
                    <path d={`M ${startX}% 80 L ${maxBlockTargetX}% 0`} fill="none" stroke={isOpt ? "#4ade80" : "#dc2626"} strokeWidth="2" strokeDasharray="6,6" opacity={isOpt ? "1" : "0.5"} />
                    <text x={`${(startX + maxBlockTargetX) / 2}%`} y="40" fill={isOpt ? "#4ade80" : "#dc2626"} fontSize="11" fontWeight="700" textAnchor="middle">{calcEfficiency(num)}</text>
                  </g>
                );
              })}
            </svg>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, position: "relative", zIndex: 2 }}>
              {[1, 2, 3].map(num => {
                const isOpt = optimalNum === num;
                return (
                  <Box key={num} sx={{ border: isOpt ? "2px solid #4ade80" : "2px solid rgba(138,180,248,0.2)", bgcolor: isOpt ? "rgba(74, 222, 128, 0.1)" : "#111827", boxShadow: isOpt ? "0 -5px 15px rgba(74, 222, 128, 0.2)" : "none", borderRadius: "8px 8px 0 0", p: 1.5, textAlign: "center" }}>
                    <Typography sx={{ fontSize: "0.6875rem", fontWeight: isOpt ? 700 : 600, color: isOpt ? "#4ade80" : "#8ab4f8", letterSpacing: "0.1em" }}>
                      {isOpt ? `OPTIMAL BERTH ${num}` : `BERTH ${num}`}
                    </Typography>
                    <Box sx={{ display: "flex", gap: "2px", justifyContent: "center", mt: 1 }}>
                      {[1, 2, 3, 4, 5, 6].map(i => <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: isOpt ? "#4ade80" : "rgba(138,180,248,0.2)" }} />)}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Box>
        </Box>

        {/* Right Side: Fixed Stack Panels */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>

          <Box sx={{ bgcolor: "background.paper", border: "1px solid rgba(138,180,248,0.15)", borderRadius: 2, p: 2.5 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase", mb: 2 }}>
              Density Profile
            </Typography>

            <Stack spacing={2} divider={<Divider sx={{ borderColor: "rgba(138,180,248,0.1)" }} />}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ViewInArRounded sx={{ color: 'text.secondary', fontSize: 18 }} />
                  <Typography variant="caption" color="text.secondary">Highest block</Typography>
                </Box>
                <Typography sx={{ fontSize: "1.2rem", fontWeight: 900 }}>{data.max_block || "—"}</Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InventoryRounded sx={{ color: 'text.secondary', fontSize: 18 }} />
                  <Typography variant="caption" color="text.secondary">Total containers</Typography>
                </Box>
                <Typography sx={{ fontSize: "1.2rem", fontWeight: 900 }}>{totalContainers}</Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningAmberRounded sx={{ color: 'warning.main', fontSize: 18 }} />
                  <Typography variant="caption" color="text.secondary">Special cargo</Typography>
                </Box>
                <Typography sx={{ fontSize: "1.2rem", fontWeight: 900, color: "warning.main" }}>
                  {hazmatTotal + reeferTotal + oogTotal}
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ bgcolor: "#0d1726", border: "1.5px solid rgba(74, 222, 128, 0.4)", borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)" }}>
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Berth Suitability</Typography>
            </Box>
            <Box sx={{ px: 2.5, py: 2.5 }}>
              <Typography sx={{ fontSize: 32, fontWeight: 700, color: "#4ade80", lineHeight: 1, fontFamily: "'Google Sans', Roboto, sans-serif", mb: 0.5 }}>
                {data.recommended_berth || "Unassigned"}
              </Typography>
              {data.recommended_berth && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1 }}>
                  <CheckCircleOutlineRounded sx={{ fontSize: 14, color: "#4ade80" }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "#4ade80" }}>Optimal assignment</Typography>
                </Box>
              )}
              <Divider sx={{ borderColor: "rgba(138,180,248,0.1)", my: 1.5 }} />
              <Typography sx={{ fontSize: "0.625rem", fontWeight: 500, color: "#8ab4f8", letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.75 }}>
                Nearest High Density Block
              </Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 300, color: "#a855f7", fontFamily: "'Google Sans', Roboto, sans-serif" }}>
                {data.max_block || "—"}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ bgcolor: "#0d1726", border: "1px solid rgba(138,180,248,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid rgba(138,180,248,0.1)", display: "flex", alignItems: "center", gap: 1 }}>
              <HelpOutlineRounded sx={{ fontSize: 14, color: "#8ab4f8" }} />
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Concentration Legend</Typography>
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
  );
}