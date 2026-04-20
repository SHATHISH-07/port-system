import React, { useMemo, useState } from "react";
import {
  Box,
  Typography,
  Tooltip,
  Paper,
  IconButton,
  Chip,
  Divider,
  Fade
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Warehouse as YardIcon
} from "@mui/icons-material";
import type { HeatmapData } from "../../types/vessel";

interface HeatmapProps {
  yardHeatmap: Record<string, HeatmapData>;
  gridData: Record<string, Record<string, number>>;
  dominantBlock: string;
}

const Heatmap: React.FC<HeatmapProps> = ({
  yardHeatmap,
  gridData,
  dominantBlock
}) => {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

  const blockGridData = useMemo(() => {
    if (!selectedBlock || !gridData[selectedBlock]) return null;

    const data = gridData[selectedBlock];
    let max = 1;

    const entries = Object.entries(data).map(([key, value]) => {
      const [b, r] = key.split("-");
      if (value > max) max = value;
      return { bay: parseFloat(b), row: parseFloat(r), value };
    });


    const MIN_BAYS = 6;
    const uniqueBaysRaw = [...new Set(entries.map((e) => e.bay))];
    let nextBay = uniqueBaysRaw.length > 0 ? Math.max(...uniqueBaysRaw) + 1 : 1;
    while (uniqueBaysRaw.length < MIN_BAYS) {
      uniqueBaysRaw.push(nextBay++);
    }
    const uniqueBays = uniqueBaysRaw.sort((a, b) => a - b);

    const MIN_ROWS = 4;
    const uniqueRowsRaw = [...new Set(entries.map((e) => e.row))];
    let nextRow = uniqueRowsRaw.length > 0 ? Math.max(...uniqueRowsRaw) + 1 : 1;
    while (uniqueRowsRaw.length < MIN_ROWS) {
      uniqueRowsRaw.push(nextRow++);
    }
    const uniqueRows = uniqueRowsRaw.sort((a, b) => b - a);

    const matrix: Record<string, number> = {};
    entries.forEach((e) => {
      matrix[`${e.bay}-${e.row}`] = e.value;
    });

    return { bays: uniqueBays, rows: uniqueRows, matrix, max };
  }, [selectedBlock, gridData]);

  const getYardStatusColor = (level: string) => {
    switch (level) {
      case "High":
        return { main: "#ef4444", bg: "#fef2f2" };
      case "Medium":
        return { main: "#f59e0b", bg: "#fffbeb" };
      case "Low":
        return { main: "#22c55e", bg: "#f0fdf4" };
      default:
        return { main: "#94a3b8", bg: "#f8fafc" };
    }
  };

  const getHeatColor = (value: number, max: number) => {
    if (value === 0) return "#f1f5f9";
    const p = value / max;
    return `rgba(79, 70, 229, ${0.2 + 0.8 * p})`;
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 4,
        border: "1px solid #e2e8f0",
        bgcolor: "#ffffff"
      }}
    >
      {!selectedBlock ? (
        <Fade in timeout={500}>
          <Box>
            {/* HEADER */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
              <YardIcon sx={{ color: "#949494ff", fontSize: 18 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, color: "#737374ff" }}>
                Yard Distribution
              </Typography>
            </Box>

            {/* YARD LEGEND */}
            <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#737374ff" }}>Density Percentage:</Typography>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: "#22c55e", borderRadius: 1 }} />
                <Typography sx={{ fontSize: 12 }}>Low</Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: "#f59e0b", borderRadius: 1 }} />
                <Typography sx={{ fontSize: 12 }}>Medium</Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: "#ef4444", borderRadius: 1 }} />
                <Typography sx={{ fontSize: 12 }}>High</Typography>
              </Box>
            </Box>

            {/* GRID */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                columnGap: "12px",
                rowGap: "12px",
                pt: 4,
                px: 3,
                pb: 3
              }}
            >
              {Object.entries(yardHeatmap).map(([block, info]) => {
                const colors = getYardStatusColor(info.level);
                const isDominant = block === dominantBlock;

                return (
                  <Box
                    key={block}
                    onClick={() => setSelectedBlock(block)}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      cursor: "pointer",
                      border: isDominant
                        ? "2px solid #ec0808ff"
                        : "1px solid #e2e8f0",
                      bgcolor: colors.bg,
                      transition: "all 0.2s",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 12px 20px -10px rgba(0,0,0,0.1)",
                        borderColor: colors.main
                      }
                    }}
                  >
                    {/* HEADER */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        mb: 2
                      }}
                    >
                      <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        {block}
                      </Typography>

                      <Typography sx={{ fontWeight: 700 }}>
                        {info.count}
                      </Typography>
                    </Box>

                    {/* CONCENTRATION */}
                    <Typography
                      sx={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: colors.main,
                        textTransform: "uppercase"
                      }}
                    >
                      {info.level} Concentration
                    </Typography>

                    {/* RECOMMENDED */}
                    {isDominant && (
                      <Chip
                        label="RECOMMENDED"
                        size="small"
                        sx={{
                          mt: 1,
                          height: 20,
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          bgcolor: "#da2222ff",
                          color: "white"
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Fade>
      ) : (
        <Fade in timeout={400}>
          <Box>
            {/* HEADER */}
            <Box sx={{ display: "flex", alignItems: "center", mb: 4 }}>
              <IconButton onClick={() => setSelectedBlock(null)}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  ml: 2
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Block {selectedBlock} Analysis
                </Typography>

                <Typography sx={{ fontWeight: 500, fontSize: 14 }}>
                  Container Count: {yardHeatmap[selectedBlock]?.count || 0}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* GRID LEGEND */}
            <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
              <Typography sx={{ fontSize: 12 }}>Density Percentage:</Typography>

              <Box sx={{ display: "flex", gap: 1 }}>
                <Box sx={{ width: 14, height: 14, bgcolor: "rgba(79,70,229,0.2)" }} />
                <Typography sx={{ fontSize: 11 }}>Low</Typography>

                <Box sx={{ width: 14, height: 14, bgcolor: "rgba(79,70,229,0.6)" }} />
                <Typography sx={{ fontSize: 11 }}>Medium</Typography>

                <Box sx={{ width: 14, height: 14, bgcolor: "rgba(79,70,229,1)" }} />
                <Typography sx={{ fontSize: 11 }}>High</Typography>
              </Box>
            </Box>

            {!blockGridData ? (
              <Typography>No detailed grid data available.</Typography>
            ) : (
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Box sx={{ overflowX: "auto" }}>
                  <Box
                    sx={{
                      display: "inline-grid",
                      gridTemplateColumns: `50px repeat(${blockGridData.bays.length}, 40px)`,
                      gap: "8px",
                      p: 3
                    }}
                  >
                    <Box />

                    {blockGridData.bays.map((b) => (
                      <Typography
                        key={b}
                        sx={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          textAlign: "center",
                          px: 0.5,
                          color: "#94a3b8"
                        }}
                      >
                        B{b}
                      </Typography>
                    ))}

                    {blockGridData.rows.map((r) => (
                      <React.Fragment key={r}>
                        <Typography
                          sx={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            color: "#94a3b8"
                          }}
                        >
                          R{r}
                        </Typography>

                        {blockGridData.bays.map((b) => {
                          const val = blockGridData.matrix[`${b}-${r}`] || 0;

                          return (
                            <Tooltip
                              key={`${b}-${r}`}
                              title={`${val} Units`}
                            >
                              <Box
                                sx={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 1,
                                  bgcolor: getHeatColor(
                                    val,
                                    blockGridData.max
                                  )
                                }}
                              />
                            </Tooltip>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Fade>
      )}
    </Paper>
  );
};

export default Heatmap;