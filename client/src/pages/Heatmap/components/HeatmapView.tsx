import { Box, Typography, useTheme, alpha, IconButton, Tooltip } from "@mui/material";
import {
  StarRounded,
  RestartAltRounded,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { Theme } from "@mui/material/styles";
import type { BlockData, VesselHeatmapViewData } from "../../../types/heatmap";

const getConcColor = (theme: Theme) => ({
  High: {
    fill: theme.palette.mode === "dark" ? "#f87171" : "#dc2626",
    text: theme.palette.mode === "dark" ? "#fca5a5" : "#991b1b",
    bg:
      theme.palette.mode === "dark"
        ? alpha("#dc2626", 0.15)
        : alpha("#fee2e2", 0.6),
  },
  Medium: {
    fill: theme.palette.mode === "dark" ? "#fb923c" : "#ea580c",
    text: theme.palette.mode === "dark" ? "#fdba74" : "#9a3412",
    bg:
      theme.palette.mode === "dark"
        ? alpha("#ea580c", 0.15)
        : alpha("#ffedd5", 0.6),
  },
  Low: {
    fill: theme.palette.mode === "dark" ? "#4ade80" : "#16a34a",
    text: theme.palette.mode === "dark" ? "#86efac" : "#166534",
    bg:
      theme.palette.mode === "dark"
        ? alpha("#16a34a", 0.15)
        : alpha("#dcfce7", 0.6),
  },
});

const ROW_LABELS: Record<number, string> = {
  0: "ROW A - FAR ZONE",
  1: "ROW B - MID ZONE",
  2: "ROW C - NEAR QUAY",
  3: "ROW D - QUAY SIDE",
};

function BlockTile({
  blockId,
  block,
  isMax,
}: {
  blockId: string;
  block?: BlockData;
  isMax: boolean;
}) {
  const theme = useTheme();
  if (!block) return null;

  const colors = getConcColor(theme);
  const cc = colors[block.concentration || "Low"];
  const pct = Math.round((block.intensity || 0) * 100);
  const isDark = theme.palette.mode === "dark";
  const isEmpty = block.count === 0;

  return (
    <Box
      sx={{
        bgcolor: isEmpty
          ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)")
          : theme.palette.background.paper,
        border: isMax
          ? `2px solid ${theme.palette.primary.main}`
          : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        boxShadow: isMax
          ? isDark
            ? `0 0 24px ${alpha(theme.palette.primary.main, 0.25)}`
            : `0 8px 24px ${alpha(theme.palette.primary.main, 0.15)}`
          : "none",
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
        opacity: isEmpty ? 0.45 : 1,
        transition: "transform 150ms",
        zIndex: 2,
        "&:hover": { transform: isEmpty ? "none" : "translateY(-2px)" },
      }}
    >
      {isMax && (
        <StarRounded
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: theme.palette.primary.main,
            fontSize: 20,
          }}
        />
      )}
      <Typography
        sx={{
          position: "absolute",
          top: 12,
          left: 14,
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: isEmpty
            ? "text.disabled"
            : isDark
              ? theme.palette.primary.light
              : theme.palette.primary.main,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Block {blockId}
      </Typography>
      <Box
        sx={{
          mt: 1.5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography
          sx={{
            fontSize: "2.75rem",
            fontWeight: 700,
            color: isEmpty ? "text.disabled" : isDark ? "#ffffff" : theme.palette.text.primary,
            lineHeight: 1,
            fontFamily: "'Google Sans', Roboto, sans-serif",
          }}
        >
          {pct}%
        </Typography>
        <Typography
          sx={{
            fontSize: "0.75rem",
            color: isDark ? theme.palette.text.secondary : "#64748b",
            mt: 0.5,
          }}
        >
          {block.count} Containers
        </Typography>
      </Box>
      <Box
        sx={{
          position: "absolute",
          bottom: 16,
          width: "calc(100% - 32px)",
          height: 4,
          bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {!isEmpty && (
          <Box
            sx={{
              height: "100%",
              width: `${Math.min(pct, 100)}%`,
              bgcolor: cc.fill,
              borderRadius: 3,
              transition: "width 600ms ease",
            }}
          />
        )}
      </Box>
    </Box>
  );
}

function BerthCard({
  id,
  label,
  isTarget,
  vesselName,
  isDark,
}: {
  id: string;
  label: string;
  isTarget: boolean;
  vesselName?: string;
  isDark: boolean;
}) {
  const isHorizontal = id.startsWith("T") || id.startsWith("B");

  if (!isTarget) {
    return (
      <Box
        sx={{
          width: isHorizontal ? 180 : 140,
          height: isHorizontal ? 92 : 180,
          border: `1px dashed ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
          bgcolor: isDark ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)",
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          transition: "all 0.3s ease",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.75rem",
            fontWeight: 800,
            color: isDark ? "text.secondary" : "#64748b",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.6rem",
            color: "text.disabled",
            mt: 0.5,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Vacant
        </Typography>
      </Box>
    );
  }

  const w = isHorizontal ? 180 : 140;
  const h = isHorizontal ? 92 : 180;

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
        transition: "all 0.3s ease",
        transform: "scale(1.05)",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: isHorizontal ? -12 : 6,
          left: "50%",
          transform: "translateX(-50%)",
          bgcolor: "#10b981",
          color: "#000",
          fontSize: "0.55rem",
          fontWeight: 950,
          px: 1.25,
          py: 0.2,
          borderRadius: 0.5,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
          zIndex: 10,
        }}
      >
        Optimal
      </Box>

      <Box
        sx={{
          width: "100%",
          height: "100%",
          position: "relative",
          filter: `drop-shadow(0 0 12px ${alpha("#10b981", isDark ? 0.35 : 0.2)})`,
        }}
      >
        <svg width={w} height={h} style={{ display: "block" }}>
          {isHorizontal ? (
            <path
              d="M 8,46 L 36,12 L 172,12 Q 178,12 178,18 L 178,74 Q 178,80 172,80 L 36,80 Z"
              fill={isDark ? "#0f172a" : "#1e293b"}
              stroke="#10b981"
              strokeWidth={2.5}
            />
          ) : (
            <path
              d="M 70,172 L 12,144 L 12,18 Q 12,12 18,12 L 122,12 Q 128,12 128,18 L 128,144 Z"
              fill={isDark ? "#0f172a" : "#1e293b"}
              stroke="#10b981"
              strokeWidth={2.5}
            />
          )}
        </svg>

        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            pr: isHorizontal ? 3 : 2,
            pb: isHorizontal ? 2 : 4,
            pointerEvents: "none",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 900,
              color: "#10b981",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              mt: !isHorizontal ? 2 : 0,
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.6875rem",
              fontWeight: 800,
              color: "#ffffff",
              mt: 0.5,
              fontFamily: "'Roboto Mono', monospace",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {(vesselName || "ACTIVE VESSEL").toUpperCase()}
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: "4px",
              justifyContent: "center",
              mt: 1.5,
            }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  bgcolor: "#10b981",
                  animation: "pulse 2s infinite",
                  "@keyframes pulse": {
                    "0%": { opacity: 0.4 },
                    "50%": { opacity: 1 },
                    "100%": { opacity: 0.4 },
                  },
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function HeatmapPlaceholder() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const emptyBlock = {
    count: 0,
    intensity: 0,
    concentration: "Low" as const,
    cells: [],
    hazardous: 0,
    reefer: 0,
    oog: 0,
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <TransformWrapper
        initialScale={0.72}
        minScale={0.4}
        maxScale={3}
        centerOnInit
        wheel={{ step: 0.002 }}
        panning={{ disabled: false }}
      >
        {({ resetTransform }) => (
          <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
            {/* Unified zoom controls overlay */}
            <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 100 }}>
              <Tooltip title="Reset View">
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
                  size="small"
                >
                  <RestartAltRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Legend floating overlay */}
            <Box sx={{ position: "absolute", bottom: 16, left: 16, zIndex: 100 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.2,
                  py: 0.6,
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
                    fontSize: "0.5rem",
                    color: "text.secondary",
                    fontWeight: 800,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    mr: 0.5,
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
                      sx={{ width: 7, height: 7, bgcolor: c, borderRadius: "1px" }}
                    />
                    <Typography
                      sx={{
                        fontSize: "0.6rem",
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

            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 1200,
                  p: 4,
                  gap: 5,
                  opacity: 0.6,
                }}
              >
                {/* TOP BERTHS ROW */}
                <Box sx={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  <BerthCard id="T1" label="BERTH T1" isTarget={false} isDark={isDark} />
                  <BerthCard id="T2" label="BERTH T2" isTarget={false} isDark={isDark} />
                </Box>

                {/* MIDDLE AREA: Yards + Right Berths */}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px",
                    gap: 4,
                    alignItems: "center",
                    width: "100%",
                    maxWidth: 1100,
                  }}
                >
                  {/* Blocks */}
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[0, 1, 2].map((rowIdx) => (
                      <Box key={rowIdx} sx={{ position: "relative" }}>
                        <Typography sx={{ position: "absolute", right: 0, top: -32, fontSize: "0.6875rem", fontWeight: 700, color: "text.disabled", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                          {ROW_LABELS[rowIdx] || `ROW ${rowIdx + 1} ZONE`}
                        </Typography>
                        <Box sx={{ display: "flex", justifyContent: "center", gap: 3 }}>
                          {[1, 2, 3].map((i) => (
                            <BlockTile key={i} blockId="--" block={emptyBlock} isMax={false} />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </Box>

                  {/* Right Side Berths */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <BerthCard id="R1" label="BERTH R1" isTarget={false} isDark={isDark} />
                    <BerthCard id="R2" label="BERTH R2" isTarget={false} isDark={isDark} />
                  </Box>
                </Box>

                {/* BOTTOM BERTHS ROW */}
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

export default function HeatmapView({
  data,
  loading,
  targetBerthId,
}: {
  data?: VesselHeatmapViewData | null;
  loading?: boolean;
  targetBerthId?: string;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (loading || !data) return <HeatmapPlaceholder />;

  // Sort all 9 blocks by their (y * 3 + x) grid coordinates so they are ordered properly in the 3x3 layout
  const blockIds = Object.keys(data.blocks || {});
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
      }}
    >
      <TransformWrapper
        initialScale={0.72}
        minScale={0.4}
        maxScale={3}
        centerOnInit
        wheel={{ step: 0.002 }}
        panning={{ disabled: false }}
      >
        {({ resetTransform }) => (
          <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
            {/* Unified zoom controls overlay */}
            <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 100 }}>
              <Tooltip title="Reset View">
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
                  size="small"
                >
                  <RestartAltRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Legend floating overlay */}
            <Box sx={{ position: "absolute", bottom: 16, left: 16, zIndex: 100 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.2,
                  py: 0.6,
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
                    fontSize: "0.5rem",
                    color: "text.secondary",
                    fontWeight: 800,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    mr: 0.5,
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
                      sx={{ width: 7, height: 7, bgcolor: c, borderRadius: "1px" }}
                    />
                    <Typography
                      sx={{
                        fontSize: "0.6rem",
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

            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 1200,
                  p: 4,
                  gap: 5,
                }}
              >
                {/* TOP BERTHS ROW */}
                <Box sx={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  <BerthCard id="T1" label="BERTH T1" isTarget={targetBerthId === "T1"} vesselName={data.vessel} isDark={isDark} />
                  <BerthCard id="T2" label="BERTH T2" isTarget={targetBerthId === "T2"} vesselName={data.vessel} isDark={isDark} />
                </Box>

                {/* MIDDLE AREA: Yards + Right Berths */}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px",
                    gap: 4,
                    alignItems: "center",
                    width: "100%",
                    maxWidth: 1100,
                  }}
                >
                  {/* Yards 3x3 Grid */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    {chunkedRows.map((rowBlockIds, rowIdx) => (
                      <Box key={rowIdx} sx={{ position: "relative", width: "100%", maxWidth: 900 }}>
                        <Typography
                          sx={{
                            position: "absolute",
                            right: 0,
                            top: -32,
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            color: isDark ? "#475e7a" : "#94a3b8",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                          }}
                        >
                          {ROW_LABELS[rowIdx] || `ROW ${rowIdx + 1} ZONE`}
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "center",
                            gap: 3,
                          }}
                        >
                          {rowBlockIds.map((blockId) => (
                            <BlockTile
                              key={blockId}
                              blockId={blockId}
                              block={data.blocks[blockId]}
                              isMax={blockId === data.max_block}
                            />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </Box>

                  {/* Right Side Berths */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <BerthCard id="R1" label="BERTH R1" isTarget={targetBerthId === "R1"} vesselName={data.vessel} isDark={isDark} />
                    <BerthCard id="R2" label="BERTH R2" isTarget={targetBerthId === "R2"} vesselName={data.vessel} isDark={isDark} />
                  </Box>
                </Box>

                {/* BOTTOM BERTHS ROW */}
                <Box sx={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  <BerthCard id="B1" label="BERTH B1" isTarget={targetBerthId === "B1"} vesselName={data.vessel} isDark={isDark} />
                  <BerthCard id="B2" label="BERTH B2" isTarget={targetBerthId === "B2"} vesselName={data.vessel} isDark={isDark} />
                </Box>
              </Box>
            </TransformComponent>
          </Box>
        )}
      </TransformWrapper>
    </Box>
  );
}
