import { Box, Typography, useTheme, alpha, IconButton, Tooltip } from "@mui/material";
import { StarRounded, RestartAltRounded, GpsFixedRounded } from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { Theme } from "@mui/material/styles";
import type { BlockData, VesselHeatmapViewData } from "../../../types/heatmap";

// ── UI Configuration ─────────────────────────────────────────────────────────

const getConcColor = (theme: Theme) => {
  const isDark = theme.palette.mode === "dark";
  return {
    High: {
      main: isDark ? "#ef4444" : "#dc2626",
      light: isDark ? "#fca5a5" : "#fee2e2",
      glow: alpha(isDark ? "#ef4444" : "#dc2626", 0.25),
    },
    Medium: {
      main: isDark ? "#f97316" : "#ea580c",
      light: isDark ? "#fdba74" : "#ffedd5",
      glow: alpha(isDark ? "#f97316" : "#ea580c", 0.25),
    },
    Low: {
      main: isDark ? "#10b981" : "#059669",
      light: isDark ? "#6ee7b7" : "#d1fae5",
      glow: alpha(isDark ? "#10b981" : "#059669", 0.25),
    },
  };
};

const ROW_LABELS: Record<number, string> = {
  0: "ROW A — FAR ZONE",
  1: "ROW B — MID ZONE",
  2: "ROW C — NEAR QUAY",
  3: "ROW D — QUAY SIDE",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function BlockTile({ blockId, block, isMax }: { blockId: string; block?: BlockData; isMax: boolean }) {
  const theme = useTheme();
  if (!block) return null;

  const colors = getConcColor(theme);
  const cc = colors[block.concentration || "Low"];
  const pct = Math.round((block.intensity || 0) * 100);
  const isDark = true;
  const isEmpty = block.count === 0;

  // Empty state styling (Wireframe look)
  if (isEmpty) {
    return (
      <Box
        sx={{
          bgcolor: isDark ? "#1e293b" : "#e2e8f0",
          border: `1px dashed ${isDark ? alpha("#ffffff", 0.1) : alpha("#000000", 0.15)}`,
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
          transition: "all 0.2s ease",
          "&:hover": {
            bgcolor: isDark ? alpha("#ffffff", 0.03) : alpha("#000000", 0.03),
          },
        }}
      >
        <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, color: "text.disabled", letterSpacing: "0.1em" }}>
          BLOCK {blockId}
        </Typography>
        <Typography sx={{ fontSize: "0.65rem", color: "text.disabled", mt: 1, textTransform: "uppercase" }}>
          No Containers
        </Typography>
      </Box>
    );
  }

  // Active state styling
  return (
    <Box
      sx={{
        bgcolor: isDark ? alpha("#161b24", 0.9) : alpha("#ffffff", 0.9),
        backdropFilter: { xs: "none", md: "blur(12px)" },
        border: `1px solid ${isMax ? theme.palette.primary.main : isDark ? alpha("#ffffff", 0.08) : alpha("#000000", 0.08)}`,
        boxShadow: isMax
          ? { xs: `0 0 0 1px ${theme.palette.primary.main}`, md: `0 0 0 1px ${theme.palette.primary.main}, 0 12px 24px ${alpha(theme.palette.primary.main, 0.2)}` }
          : { xs: "none", md: `0 8px 16px ${alpha("#000", isDark ? 0.2 : 0.03)}` },
        borderRadius: 2,
        p: 2.5,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 140,
        flex: "0 1 calc(33.333% - 16px)",
        minWidth: 180,
        maxWidth: 280,
        overflow: "hidden",
        transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          transform: "translateY(-4px)",
        },
      }}
    >
      {/* Background ambient glow based on concentration */}
      <Box
        sx={{
          position: "absolute",
          top: "-50%",
          left: "-50%",
          width: "200%",
          height: "200%",
          background: `radial-gradient(circle at 50% 120%, ${cc.glow} 0%, transparent 60%)`,
          pointerEvents: "none",
          opacity: 0.6,
        }}
      />

      {/* Max Highlight Accents */}
      {isMax && (
        <>
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 16, height: 16, borderTop: `2px solid ${theme.palette.primary.main}`, borderLeft: `2px solid ${theme.palette.primary.main}`, borderTopLeftRadius: 8 }} />
          <Box sx={{ position: "absolute", top: 0, right: 0, width: 16, height: 16, borderTop: `2px solid ${theme.palette.primary.main}`, borderRight: `2px solid ${theme.palette.primary.main}`, borderTopRightRadius: 8 }} />
          <Box sx={{ position: "absolute", bottom: 0, left: 0, width: 16, height: 16, borderBottom: `2px solid ${theme.palette.primary.main}`, borderLeft: `2px solid ${theme.palette.primary.main}`, borderBottomLeftRadius: 8 }} />
          <Box sx={{ position: "absolute", bottom: 0, right: 0, width: 16, height: 16, borderBottom: `2px solid ${theme.palette.primary.main}`, borderRight: `2px solid ${theme.palette.primary.main}`, borderBottomRightRadius: 8 }} />
          <Tooltip title="Maximum Density Block">
            <StarRounded sx={{ position: "absolute", top: 12, right: 12, color: theme.palette.primary.main, fontSize: 18, animation: "pulseOpacity 2s infinite" }} />
          </Tooltip>
        </>
      )}

      {/* Header */}
      <Box sx={{ position: "absolute", top: 14, left: 16, display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: cc.main, boxShadow: `0 0 8px ${cc.main}` }} />
        <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: isDark ? "#ffffff" : "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Block {blockId}
        </Typography>
      </Box>

      {/* Main Stats */}
      <Box sx={{ mt: 2, display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
        <Typography
          sx={{
            fontSize: "3rem",
            fontWeight: 800,
            color: isDark ? "#ffffff" : "#0f172a",
            lineHeight: 1,
            fontFamily: "'Roboto Mono', 'Google Sans', monospace",
            letterSpacing: "-0.05em",
          }}
        >
          {pct}
          <span style={{ fontSize: "1.5rem", color: isDark ? "#ffffff" : "#475569", marginLeft: "2px" }}>%</span>
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: isDark ? "#ffffff" : "#475569", mt: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {block.count} Units
        </Typography>
      </Box>

      {/* LED Progress Bar */}
      <Box
        sx={{
          position: "absolute",
          bottom: 16,
          width: "calc(100% - 32px)",
          height: 6,
          bgcolor: isDark ? alpha("#ffffff", 0.05) : alpha("#000000", 0.05),
          borderRadius: 4,
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            bgcolor: cc.main,
            borderRadius: 4,
            transition: "width 800ms cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: `0 0 8px ${cc.main}`,
            position: "relative",
            overflow: "hidden",
            "&::after": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              transform: "translateX(-100%)",
              animation: "shimmer 2s infinite",
            },
          }}
        />
      </Box>
    </Box>
  );
}

function BerthCard({ id, label, isTarget, vesselName, isDark }: { id: string; label: string; isTarget: boolean; vesselName?: string; isDark: boolean }) {
  const isHorizontal = id.startsWith("T") || id.startsWith("B");
  const w = isHorizontal ? 200 : 160;
  const h = isHorizontal ? 100 : 200;

  // Vacant State
  if (!isTarget) {
    return (
      <Box
        sx={{
          width: w,
          height: h,
          border: `1px dashed ${isDark ? alpha("#94a3b8", 0.2) : alpha("#64748b", 0.3)}`,
          bgcolor: isDark ? "#1e293b" : "#e2e8f0",
          backdropFilter: { xs: "none", md: "blur(4px)" },
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          transition: "all 0.3s ease",
        }}
      >
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: isDark ? "#ffffff" : "#475569", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: isDark ? "#334155" : "#cbd5e1" }} />
          <Typography variant="caption" sx={{ fontSize: "0.6rem", color: isDark ? "#475569" : "#94a3b8", textTransform: "uppercase", fontWeight: 800 }}>
            Standby
          </Typography>
        </Box>
      </Box>
    );
  }

  // Active Target State
  const primary = "#0ea5e9";
  const bg = isDark ? "#0f172a" : "#ffffff";

  return (
    <Box
      sx={{
        width: w,
        height: h,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: "scale(1.05)",
      }}
    >
      {/* Radar Pulse Background */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: Math.max(w, h) * 1.5,
          height: Math.max(w, h) * 1.5,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1px solid ${primary}`,
          opacity: 0,
          animation: "radarPulse 3s infinite cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: "none",
        }}
      />

      {/* Target Badge */}
      <Box
        sx={{
          position: "absolute",
          top: isHorizontal ? -14 : 10,
          left: "50%",
          transform: "translateX(-50%)",
          bgcolor: primary,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.3,
          borderRadius: 1,
          boxShadow: `0 4px 12px ${alpha(primary, 0.4)}`,
          zIndex: 10,
        }}
      >
        <GpsFixedRounded sx={{ fontSize: 12 }} />
        <Typography sx={{ fontSize: "0.55rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Target Berth
        </Typography>
      </Box>

      {/* Ship Shape Vector */}
      <Box sx={{ width: "100%", height: "100%", position: "relative", filter: `drop-shadow(0 8px 16px ${alpha(primary, isDark ? 0.3 : 0.2)})` }}>
        <svg width={w} height={h} style={{ display: "block" }}>
          <defs>
            <linearGradient id={`shipGrad-${id}`} x1="0%" y1="0%" x2={isHorizontal ? "100%" : "0%"} y2={isHorizontal ? "0%" : "100%"}>
              <stop offset="0%" stopColor={bg} />
              <stop offset="100%" stopColor={isDark ? "#1e293b" : "#f1f5f9"} />
            </linearGradient>
          </defs>
          {isHorizontal ? (
            <path
              d={`M 12,${h / 2} L 40,12 L ${w - 20},12 Q ${w - 10},12 ${w - 10},20 L ${w - 10},${h - 20} Q ${w - 10},${h - 12} ${w - 20},${h - 12} L 40,${h - 12} Z`}
              fill={`url(#shipGrad-${id})`}
              stroke={primary}
              strokeWidth={2}
            />
          ) : (
            <path
              d={`M ${w / 2},${h - 12} L 12,${h - 40} L 12,20 Q 12,10 20,10 L ${w - 20},10 Q ${w - 10},10 ${w - 10},20 L ${w - 10},${h - 40} Z`}
              fill={`url(#shipGrad-${id})`}
              stroke={primary}
              strokeWidth={2}
            />
          )}
        </svg>

        {/* Info Overlay */}
        <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 2, pointerEvents: "none" }}>
          <Typography sx={{ fontSize: "0.7rem", fontWeight: 800, color: isDark ? "#ffffff" : primary, letterSpacing: "0.1em", textTransform: "uppercase", mt: !isHorizontal ? 3 : 0 }}>
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 800,
              color: isDark ? "#ffffff" : "#0f172a",
              mt: 0.5,
              fontFamily: "'Roboto Mono', monospace",
              px: 2,
              textAlign: "center",
              width: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {(vesselName || "ACTIVE VESSEL").toUpperCase()}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

function HeatmapPlaceholder() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const emptyBlock = { count: 0, intensity: 0, concentration: "Low" as const, cells: [], hazardous: 0, reefer: 0, oog: 0 };

  // High-tech blueprint background
  const bgColor = isDark ? "#121212" : "#f1f5f9";
  const gridColor = isDark ? alpha("#ffffff", 0.03) : alpha("#000000", 0.04);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        bgcolor: bgColor,
        backgroundImage: `radial-gradient(${gridColor} 1.5px, transparent 1.5px)`,
        backgroundSize: "24px 24px",
      }}
    >
      <TransformWrapper initialScale={0.72} minScale={0.4} maxScale={3} centerOnInit wheel={{ step: 0.002 }} panning={{ disabled: false }}>
        {() => (
          <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", willChange: "transform" }} contentStyle={{ willChange: "transform" }}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 1200, p: 4, gap: 5, opacity: 0.5 }}>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  <BerthCard id="T1" label="BERTH T1" isTarget={false} isDark={isDark} />
                  <BerthCard id="T2" label="BERTH T2" isTarget={false} isDark={isDark} />
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 6, alignItems: "center", width: "100%", maxWidth: 1100 }}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[0, 1, 2].map((rowIdx) => (
                      <Box key={rowIdx} sx={{ position: "relative" }}>
                        <Typography sx={{ position: "absolute", right: 0, top: -28, fontSize: "0.6rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                          {ROW_LABELS[rowIdx]}
                        </Typography>
                        <Box sx={{ display: "flex", justifyContent: "center", gap: 4 }}>
                          {[1, 2, 3].map((i) => <BlockTile key={i} blockId="--" block={emptyBlock} isMax={false} />)}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                    <BerthCard id="R1" label="BERTH R1" isTarget={false} isDark={isDark} />
                    <BerthCard id="R2" label="BERTH R2" isTarget={false} isDark={isDark} />
                  </Box>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  <BerthCard id="B1" label="BERTH B1" isTarget={false} isDark={isDark} />
                  <BerthCard id="B2" label="BERTH B2" isTarget={false} isDark={isDark} />
                </Box>
              </Box>
            </TransformComponent>
          </Box>
        )}
      </TransformWrapper>
    </Box>
  );
}

export default function BlockIllustrator({ data, loading, targetBerthId }: { data?: VesselHeatmapViewData | null; loading?: boolean; targetBerthId?: string; }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // Tech canvas background
  const bgColor = isDark ? "#121212" : "#f4f7fb";
  const gridColor = isDark ? alpha("#ffffff", 0.04) : alpha("#000000", 0.05);

  if (loading || !data) return <HeatmapPlaceholder />;

  const blockIds = Object.keys(data.blocks || {});
  const sampleLayout = data.layout && Object.values(data.layout)[0];
  const isAECY = sampleLayout && sampleLayout.w !== undefined;

  const sortedBlockIds = [...blockIds].sort((a, b) => {
    const posA = data.layout[a] || { x: 0, y: 0 };
    const posB = data.layout[b] || { x: 0, y: 0 };
    return (posA.y * 3 + posA.x) - (posB.y * 3 + posB.x);
  });

  const chunkedRows: string[][] = [];
  for (let i = 0; i < sortedBlockIds.length; i += 3) {
    chunkedRows.push(sortedBlockIds.slice(i, i + 3));
  }

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        bgcolor: bgColor,
        backgroundImage: { xs: "none", md: `radial-gradient(${gridColor} 1.5px, transparent 1.5px)` },
        backgroundSize: "28px 28px",
      }}
    >
      {/* Global CSS for Animations */}
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        @keyframes pulseOpacity {
          0% { opacity: 0.6; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0.6; transform: scale(0.95); }
        }
        @keyframes radarPulse {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
      `}</style>

      <TransformWrapper initialScale={0.75} minScale={0.15} maxScale={3} centerOnInit wheel={{ step: 0.002 }} panning={{ disabled: false }}>
        {({ resetTransform }) => (
          <Box sx={{ width: "100%", height: "100%", position: "relative" }}>

            {/* Glassmorphic Controls Header */}
            <Box sx={{ position: "absolute", top: { xs: 52, lg: "auto" }, bottom: { xs: "auto", lg: 16 }, right: 16, zIndex: 100 }}>
              <Tooltip title="Reset View" placement="left">
                <IconButton
                  onClick={() => resetTransform()}
                  sx={{
                    bgcolor: isDark ? alpha("#1e293b", 0.7) : alpha("#ffffff", 0.8),
                    backdropFilter: "blur(8px)",
                    border: `1px solid ${isDark ? alpha("#ffffff", 0.1) : alpha("#000000", 0.1)}`,
                    boxShadow: `0 4px 12px ${alpha("#000", 0.1)}`,
                    "&:hover": { bgcolor: isDark ? "#334155" : "#f8fafc" },
                    p: 0.6, width: 28, height: 28
                  }}
                >
                  <RestartAltRounded fontSize="small" sx={{ color: isDark ? "#fff" : "#0f172a" }} />
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ position: "absolute", top: { xs: 88, lg: "auto" }, bottom: { xs: "auto", lg: 24 }, right: { xs: 16, lg: "auto" }, left: { xs: "auto", lg: 24 }, zIndex: 100 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: { xs: "flex-start", lg: "center" },
                  flexDirection: { xs: "column", lg: "row" },
                  gap: { xs: 1.5, lg: 1.2 },
                  px: { xs: 1.5, lg: 1.2 },
                  py: { xs: 1, lg: 0.4 },
                  bgcolor: isDark ? "rgba(18, 22, 31, 0.9)" : "rgba(255, 255, 255, 0.9)",
                  backdropFilter: "blur(12px)",
                  border: `1px solid ${isDark ? alpha("#ffffff", 0.1) : alpha("#000", 0.08)}`,
                  boxShadow: `0 8px 24px ${alpha("#000", 0.15)}`,
                  borderRadius: 2,
                }}
              >
                <Typography sx={{ display: { xs: "none", lg: "block" }, fontSize: "0.45rem", color: "text.secondary", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", mr: 0.2 }}>
                  Concentration
                </Typography>
                {[
                  { c: "#ff0000", l: "High" },
                  { c: "#ffaa00", l: "Medium" },
                  { c: "#00ff00", l: "Low" },
                ].map(({ c, l }) => (
                  <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Box sx={{ width: { xs: 7, lg: 6 }, height: { xs: 7, lg: 6 }, bgcolor: c, borderRadius: "1px" }} />
                    <Typography sx={{ fontSize: { xs: "0.6rem", lg: "0.55rem" }, color: "text.secondary", fontWeight: 500 }}>{l}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Main Canvas */}
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", willChange: "transform" }} contentStyle={{ willChange: "transform" }}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 1200, p: 6, gap: 6 }}>

                {isAECY ? (
                  <Box sx={{ position: "relative", width: 1200, height: 900, mx: "auto" }}>
                    {data.shapes && data.shapes.length > 0 && (
                      <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0, zIndex: 0 }}>
                        {data.shapes.map((s, i) => {
                          const pts = s.points.map(p => `${p.x * 1200},${p.y * 900}`).join(" ");
                          const isBoundary = s.type === 'boundary';
                          return (
                            <polygon
                              key={`shape-${i}`}
                              points={pts}
                              fill={isBoundary ? (isDark ? "#161b22" : "#e2e8f0") : (isDark ? "#21262d" : "#cbd5e1")}
                              stroke={isBoundary ? (isDark ? "#30363d" : "#94a3b8") : (isDark ? "#30363d" : "#94a3b8")}
                              strokeWidth={isBoundary ? 2 : 1}
                            />
                          );
                        })}
                      </svg>
                    )}
                    {Object.keys(data.layout).map((blockId) => {
                      const pos = data.layout[blockId];
                      if (!pos) return null;
                      return (
                        <Box
                          key={blockId}
                          sx={{
                            position: "absolute",
                            left: `${pos.x * 100}%`,
                            top: `${pos.y * 100}%`,
                            width: `${(pos.w || 0.1) * 100}%`,
                            height: `${(pos.h || 0.1) * 100}%`,
                            transform: "translate(-50%, -50%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Box sx={{ transform: "scale(0.65)" }}>
                            <BlockTile blockId={blockId} block={data.blocks[blockId]} isMax={blockId === data.max_block} />
                          </Box>
                        </Box>
                      );
                    })}
                    {(data.berths && Object.keys(data.berths).length > 0) ? (
                      Object.entries(data.berths).map(([bId, pts]) => {
                        let cx = 0, cy = 0;
                        pts.forEach(p => { cx += p.x; cy += p.y; });
                        cx /= pts.length;
                        cy /= pts.length;
                        return (
                          <Box key={bId} sx={{ position: "absolute", left: `${cx * 100}%`, top: `${cy * 100}%`, transform: "translate(-50%, -50%)" }}>
                            <BerthCard id={bId} label={`BERTH ${bId}`} isTarget={targetBerthId === bId} vesselName={data.vessel} isDark={isDark} />
                          </Box>
                        );
                      })
                    ) : (
                      <Box sx={{ position: "absolute", left: -100, top: "50%", transform: "translateY(-50%)" }}>
                        <BerthCard id="T1" label="BERTH AECT1" isTarget={targetBerthId === "AECT1"} vesselName={data.vessel} isDark={isDark} />
                      </Box>
                    )}
                  </Box>
                ) : (
                  <>
                    <Box sx={{ display: "flex", justifyContent: "center", gap: 8 }}>
                      <BerthCard id="T1" label="BERTH T1" isTarget={targetBerthId === "T1"} vesselName={data.vessel} isDark={isDark} />
                      <BerthCard id="T2" label="BERTH T2" isTarget={targetBerthId === "T2"} vesselName={data.vessel} isDark={isDark} />
                    </Box>

                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 6, alignItems: "center", width: "100%", maxWidth: 1100 }}>

                      <Box sx={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", alignItems: "center" }}>
                        {chunkedRows.map((rowBlockIds, rowIdx) => (
                          <Box key={rowIdx} sx={{ position: "relative", width: "100%", maxWidth: 900 }}>
                            <Typography sx={{ position: "absolute", left: -40, top: "50%", transform: "translateY(-50%) rotate(-90deg)", fontSize: "0.6rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", letterSpacing: "0.2em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                              {ROW_LABELS[rowIdx]}
                            </Typography>
                            <Box sx={{ display: "flex", justifyContent: "center", gap: 4 }}>
                              {rowBlockIds.map((blockId) => (
                                <BlockTile key={blockId} blockId={blockId} block={data.blocks[blockId]} isMax={blockId === data.max_block} />
                              ))}
                            </Box>
                          </Box>
                        ))}
                      </Box>

                      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                        <BerthCard id="R1" label="BERTH R1" isTarget={targetBerthId === "R1"} vesselName={data.vessel} isDark={isDark} />
                        <BerthCard id="R2" label="BERTH R2" isTarget={targetBerthId === "R2"} vesselName={data.vessel} isDark={isDark} />
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", justifyContent: "center", gap: 8 }}>
                      <BerthCard id="B1" label="BERTH B1" isTarget={targetBerthId === "B1"} vesselName={data.vessel} isDark={isDark} />
                      <BerthCard id="B2" label="BERTH B2" isTarget={targetBerthId === "B2"} vesselName={data.vessel} isDark={isDark} />
                    </Box>
                  </>
                )}

              </Box>
            </TransformComponent>
          </Box>
        )}
      </TransformWrapper>
    </Box>
  );
}