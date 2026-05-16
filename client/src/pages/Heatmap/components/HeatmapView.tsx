import { Box, Typography, Divider, useTheme, alpha } from "@mui/material";
import {
  StarRounded,
  HelpOutlineRounded,
  CheckCircleOutlineRounded,
} from "@mui/icons-material";
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
  if (!block || block.count === 0) return null;

  const colors = getConcColor(theme);
  const cc = colors[block.concentration || "Low"];
  const pct = Math.round((block.intensity || 0) * 100);
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        bgcolor: isDark ? theme.palette.background.paper : theme.palette.background.paper,
        border: isMax
          ? `2px solid ${theme.palette.primary.main}`
          : `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
        boxShadow: isMax
          ? isDark
            ? `0 0 24px ${alpha(theme.palette.primary.main, 0.25)}`
            : `0 8px 24px ${alpha(theme.palette.primary.main, 0.15)}`
          : isDark
            ? "none"
            : "0 2px 4px rgba(0,0,0,0.02)",
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
          color: isDark
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
            color: isDark ? "#ffffff" : theme.palette.text.primary,
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
        <Box
          sx={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            bgcolor: cc.fill,
            borderRadius: 3,
            transition: "width 600ms ease",
          }}
        />
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
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        width: "100%",
        gap: 3,
        pt: { xs: 12, lg: 18 },
        pb: 12,
        px: { xs: 2, md: 4, lg: 6 },
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "1fr 320px" },
          gap: 4,
          alignItems: "start",
          width: "100%",
          maxWidth: 1600,
          mx: "auto",
        }}
      >
        {/* Left Side: Empty Grid */}
        <Box
          sx={{
            bgcolor: isDark ? theme.palette.background.default : "#f1f5f9",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 4,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            opacity: 0.6,
          }}
        >
          <Box sx={{ px: 3, py: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: theme.palette.background.paper }}>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, color: "text.disabled", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Vessel Cargo Concentration — NO DATA SELECTED
            </Typography>
          </Box>
          <Box sx={{ p: { xs: 3, md: 5 }, display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1].map((rowIdx) => (
              <Box key={rowIdx} sx={{ position: "relative" }}>
                <Typography sx={{ position: "absolute", right: 0, top: -32, fontSize: "0.6875rem", fontWeight: 700, color: "text.disabled", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                  {ROW_LABELS[rowIdx] || `ROW ${rowIdx + 1} ZONE`}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }}>
                  {[1, 2, 3].map((i) => (
                    <BlockTile key={i} blockId="--" block={emptyBlock} isMax={false} />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          {/* Bottom Berth area placeholder */}
          <Box sx={{ pt: 8, pb: 5, px: 4, mt: "auto", display: { xs: "none", md: "block" } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
              {[1, 2, 3].map((num) => (
                <Box key={num} sx={{ border: `2px solid ${theme.palette.divider}`, bgcolor: theme.palette.background.paper, borderRadius: "12px 12px 0 0", p: 2, textAlign: "center" }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: "text.disabled", letterSpacing: "0.1em" }}>BERTH {num}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Right Side: Empty Panels */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, opacity: 0.6 }}>
          <Box sx={{ bgcolor: theme.palette.background.paper, border: `1.5px solid ${theme.palette.divider}`, borderRadius: 4, p: 3 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: "text.disabled", textTransform: "uppercase", mb: 2 }}>Berth Suitability</Typography>
            <Typography sx={{ fontSize: 40, fontWeight: 900, color: "text.disabled", lineHeight: 1 }}>—</Typography>
          </Box>
          <Box sx={{ bgcolor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 4, p: 3 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: "text.disabled", textTransform: "uppercase", mb: 2 }}>Concentration Legend</Typography>
            <Box sx={{ width: "100%", height: 8, borderRadius: 4, bgcolor: "divider", mb: 2 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function HeatmapView({ data, loading }: { data?: VesselHeatmapViewData | null; loading?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const colors = getConcColor(theme);

  if (loading || !data) return <HeatmapPlaceholder />;

  const safeBerth = data.recommended_berth || "";
  const optimalNum = parseInt(safeBerth.replace(/\D/g, ""), 10) || 2;

  const activeBlockIds = Object.entries(data.blocks || {})
    .filter(([, block]) => block.count > 0)
    .map(([id]) => id);
  const withoutMax = activeBlockIds.filter((id) => id !== data.max_block);

  withoutMax.sort((a, b) => {
    const posA = data.layout[a] || { x: 0, y: 0 };
    const posB = data.layout[b] || { x: 0, y: 0 };
    return posA.y - posB.y || posA.x - posB.x;
  });

  const totalItems = withoutMax.length + (data.max_block ? 1 : 0);
  const lastRowLength = totalItems % 3 === 0 ? 3 : totalItems % 3 || 3;
  const targetIndexInRow = Math.min(optimalNum - 1, lastRowLength - 1);
  const insertIndex = Math.max(
    0,
    totalItems - lastRowLength + targetIndexInRow,
  );

  const finalOrder = [...withoutMax];
  if (data.max_block) finalOrder.splice(insertIndex, 0, data.max_block);

  const chunkedRows: string[][] = [];
  for (let i = 0; i < finalOrder.length; i += 3) {
    chunkedRows.push(finalOrder.slice(i, i + 3));
  }

  const calcEfficiency = (targetBerth: number) => {
    if (targetBerth === optimalNum) return "100% Optimal";
    const distance = Math.abs(targetBerth - optimalNum);
    const intensityWeight =
      (data.blocks[data.max_block || ""]?.intensity || 0) * 20 || 15;
    const penalty = Math.round(distance * 25 + intensityWeight);
    return `-${penalty}% efficiency`;
  };

  let maxBlockTargetX = 50;
  if (chunkedRows.length > 0 && data.max_block) {
    const maxRow = chunkedRows.find((row) => row.includes(data.max_block!));
    if (maxRow) {
      const colIdx = maxRow.indexOf(data.max_block);
      if (maxRow.length === 3)
        maxBlockTargetX = colIdx === 0 ? 16.6 : colIdx === 1 ? 50 : 83.3;
      else if (maxRow.length === 2)
        maxBlockTargetX = colIdx === 0 ? 33.3 : 66.6;
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        width: "100%",
        gap: 3,
        pt: { xs: 12, lg: 18 },
        pb: 12,
        px: { xs: 2, md: 4, lg: 6 },
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "1fr 320px" },
          gap: 4,
          alignItems: "start",
          width: "100%",
          maxWidth: 1600,
          mx: "auto",
        }}
      >
        {/* Left Side: Heatmap Blocks */}
        <Box
          sx={{
            bgcolor: isDark ? theme.palette.background.default : "#e2e8f0",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 4,
            overflow: "hidden",
            backgroundImage: isDark
              ? "linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)"
              : "linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            boxShadow: isDark ? "none" : "inset 0 2px 10px rgba(0,0,0,0.04)",
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 2.5,
              borderBottom: `1px solid ${theme.palette.divider}`,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              bgcolor: theme.palette.background.paper,
            }}
          >
            <Typography
              noWrap
              sx={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: isDark
                  ? theme.palette.primary.light
                  : theme.palette.primary.main,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                flex: 1,
              }}
            >
              Vessel Cargo Concentration — {data.vessel}
            </Typography>
          </Box>

          <Box
            sx={{
              p: { xs: 3, md: 5 },
              pb: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flexGrow: 1,
            }}
          >
            {chunkedRows.map((rowBlockIds, rowIdx) => (
              <Box key={rowIdx} sx={{ position: "relative", zIndex: 2 }}>
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
                    flexWrap: "wrap",
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

          <Box
            sx={{
              position: "relative",
              pt: 8,
              pb: 5,
              px: 4,
              mt: "auto",
              display: { xs: "none", md: "block" },
            }}
          >
            <svg
              width="100%"
              height="80"
              style={{
                position: "absolute",
                top: -20,
                left: 0,
                zIndex: 1,
                overflow: "visible",
              }}
            >
              {[1, 2, 3].map((num) => {
                const startX = num === 1 ? 16.6 : num === 2 ? 50 : 83.3;
                const isOpt = optimalNum === num;
                return (
                  <g key={num}>
                    <path
                      d={`M ${startX}% 80 L ${maxBlockTargetX}% 0`}
                      fill="none"
                      stroke={
                        isOpt ? "#4ade80" : isDark ? "#ef4444" : "#dc2626"
                      }
                      strokeWidth="2.5"
                      strokeDasharray="8,6"
                      opacity={isOpt ? "1" : "0.5"}
                    />
                    <text
                      x={`${(startX + maxBlockTargetX) / 2}%`}
                      y="40"
                      fill={isOpt ? "#4ade80" : isDark ? "#fca5a5" : "#991b1b"}
                      fontSize="12"
                      fontWeight="800"
                      textAnchor="middle"
                      style={{
                        filter: isDark
                          ? "drop-shadow(0 0 4px rgba(0,0,0,0.5))"
                          : "none",
                      }}
                    >
                      {calcEfficiency(num)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 3,
                position: "relative",
                zIndex: 2,
              }}
            >
              {[1, 2, 3].map((num) => {
                const isOpt = optimalNum === num;
                return (
                  <Box
                    key={num}
                    sx={{
                      border: isOpt
                        ? "2px solid #4ade80"
                        : `2px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                      bgcolor: isOpt
                        ? alpha("#4ade80", isDark ? 0.1 : 0.05)
                        : theme.palette.background.paper,
                      boxShadow: isOpt
                        ? `0 -5px 20px ${alpha("#4ade80", 0.15)}`
                        : isDark
                          ? "none"
                          : "0 2px 4px rgba(0,0,0,0.02)",
                      borderRadius: "12px 12px 0 0",
                      p: 2,
                      textAlign: "center",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        color: isOpt
                          ? "#4ade80"
                          : isDark
                            ? theme.palette.text.secondary
                            : "#64748b",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {isOpt ? `OPTIMAL BERTH ${num}` : `BERTH ${num}`}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        gap: "3px",
                        justifyContent: "center",
                        mt: 1.5,
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Box
                          key={i}
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: isOpt
                              ? "#4ade80"
                              : isDark
                                ? "rgba(138,180,248,0.15)"
                                : "rgba(0,0,0,0.1)",
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Right Side: Fixed Stack Panels */}
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}
        >
          <Box
            sx={{
              bgcolor: theme.palette.background.paper,
              border: `1.5px solid ${alpha("#4ade80", 0.4)}`,
              borderRadius: 4,
              overflow: "hidden",
              boxShadow: isDark ? "none" : "0 8px 24px rgba(0,0,0,0.08)",
            }}
          >
            <Box
              sx={{
                px: 2.5,
                py: 2,
                borderBottom: `1px solid ${theme.palette.divider}`,
                bgcolor: alpha("#4ade80", 0.03),
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#4ade80",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Berth Suitability
              </Typography>
            </Box>
            <Box sx={{ px: 2.5, py: 3 }}>
              <Typography
                sx={{
                  fontSize: 40,
                  fontWeight: 900,
                  color: "#4ade80",
                  lineHeight: 1,
                  fontFamily: "'Google Sans', Roboto, sans-serif",
                  mb: 1,
                }}
              >
                {data.recommended_berth || "Unassigned"}
              </Typography>
              {data.recommended_berth && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mt: 1.5,
                  }}
                >
                  <CheckCircleOutlineRounded
                    sx={{ fontSize: 18, color: "#4ade80" }}
                  />
                  <Typography
                    sx={{
                      fontSize: "0.875rem",
                      color: "#4ade80",
                      fontWeight: 600,
                    }}
                  >
                    Optimal assignment
                  </Typography>
                </Box>
              )}
              <Divider sx={{ borderColor: theme.palette.divider, my: 2.5 }} />
              <Typography
                sx={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: isDark
                    ? theme.palette.primary.light
                    : theme.palette.primary.main,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  mb: 1,
                }}
              >
                Nearest High Density Block
              </Typography>
              <Typography
                sx={{
                  fontSize: 24,
                  fontWeight: 300,
                  color: isDark
                    ? theme.palette.primary.light
                    : theme.palette.primary.main,
                  fontFamily: "'Google Sans', Roboto, sans-serif",
                }}
              >
                {data.max_block || "—"}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 4,
              overflow: "hidden",
              boxShadow: isDark ? "none" : "0 8px 24px rgba(0,0,0,0.08)",
            }}
          >
            <Box
              sx={{
                px: 2.5,
                py: 2,
                borderBottom: `1px solid ${theme.palette.divider}`,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                bgcolor: theme.palette.background.paper,
              }}
            >
              <HelpOutlineRounded
                sx={{
                  fontSize: 18,
                  color: isDark
                    ? theme.palette.primary.light
                    : theme.palette.primary.main,
                }}
              />
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: isDark
                    ? theme.palette.primary.light
                    : theme.palette.primary.main,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Concentration Legend
              </Typography>
            </Box>
            <Box sx={{ px: 2.5, py: 3 }}>
              <Box
                sx={{
                  width: "100%",
                  height: 8,
                  borderRadius: 4,
                  mb: 2,
                  background:
                    "linear-gradient(90deg, #16a34a 0%, #ea580c 50%, #dc2626 100%)",
                }}
              />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {(
                  [
                    {
                      level: "High",
                      desc: "> 65% utilisation",
                      ...colors.High,
                    },
                    {
                      level: "Medium",
                      desc: "30 – 65% utilisation",
                      ...colors.Medium,
                    },
                    {
                      level: "Low",
                      desc: "< 30% utilisation",
                      ...colors.Low,
                    },
                  ] as const
                ).map(({ level, desc, fill, text }) => (
                  <Box
                    key={level}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: fill,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: "0.875rem",
                          fontWeight: 700,
                          color: text,
                        }}
                      >
                        {level}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: "0.75rem",
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {desc}
                    </Typography>
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
