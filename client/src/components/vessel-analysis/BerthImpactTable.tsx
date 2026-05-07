import {
  Box, Typography, Table, TableHead,
  TableRow, TableCell, TableBody, Button, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useState } from "react";
import { type BerthAnalysisEntry } from "../../types/vessel";

interface Props { data: BerthAnalysisEntry[]; }

const LIMIT = 5;

export default function BerthImpactTable({ data }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!data?.length) return null;

  const rows = expanded ? data : data.slice(0, LIMIT);

  const levelColor = (v: string) => {
    if (v === "High") return theme.palette.error.main;
    if (v === "Medium") return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3, py: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="overline" sx={{ color: "text.secondary" }}>
          Berth Impact Analysis
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
          {data.length} berths ranked
        </Typography>
      </Box>

      {/* Table */}
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48, pl: 3 }}>#</TableCell>
              <TableCell>Berth</TableCell>
              <TableCell>Cargo Concentration</TableCell>
              <TableCell>Travel Distance</TableCell>
              <TableCell>Congestion Risk</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => {
              const concColor = levelColor(row.cargo_concentration);
              const riskColor = levelColor(row.congestion_risk || "Low");
              const isTop = i === 0;

              return (
                <TableRow
                  key={i}
                  sx={{
                    bgcolor: isTop
                      ? alpha(theme.palette.primary.main, 0.04)
                      : "transparent",
                  }}
                >
                  {/* Rank */}
                  <TableCell sx={{ pl: 3 }}>
                    <Typography
                      sx={{
                        fontSize: "0.6875rem",
                        color: isTop ? theme.palette.text.primary : "text.disabled",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </Typography>
                  </TableCell>

                  {/* Berth */}
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Typography
                        sx={{
                          fontSize: "0.875rem",
                          fontWeight: isTop ? 600 : 400,
                          color: isTop ? "text.primary" : "text.secondary",
                        }}
                      >
                        {row.berth}
                      </Typography>
                      {isTop && (
                        <Box
                          sx={{
                            px: 1, py: 0.25, borderRadius: 1,
                            bgcolor: alpha(theme.palette.text.primary, 0.1),
                            border: `1px solid ${alpha(theme.palette.text.primary, 0.25)}`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "0.5625rem", fontWeight: 700,
                              color: theme.palette.text.primary,
                              textTransform: "uppercase", letterSpacing: "0.05em",
                            }}
                          >
                            Recommendeds
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </TableCell>

                  {/* Concentration badge */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex", alignItems: "center", gap: 0.75,
                        px: 1, py: 0.3, borderRadius: 1,
                        bgcolor: alpha(concColor, 0.1),
                        border: `1px solid ${alpha(concColor, 0.25)}`,
                      }}
                    >
                      <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: concColor }} />
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: concColor }}>
                        {row.cargo_concentration}
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* Distance */}
                  <TableCell>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {row.total_travel_distance}
                    </Typography>
                  </TableCell>

                  {/* Risk badge */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex", alignItems: "center", gap: 0.75,
                        px: 1, py: 0.3, borderRadius: 1,
                        bgcolor: alpha(riskColor, 0.1),
                        border: `1px solid ${alpha(riskColor, 0.25)}`,
                      }}
                    >
                      <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: riskColor }} />
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: riskColor }}>
                        {row.congestion_risk}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      {/* Show more */}
      {data.length > LIMIT && (
        <Box sx={{ px: 3, py: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button
            onClick={() => setExpanded((v) => !v)}
            variant="text"
            size="small"
            sx={{ fontSize: "0.8125rem", color: "text.secondary", p: 0, minWidth: 0 }}
          >
            {expanded ? "Show fewer" : `+ ${data.length - LIMIT} more berths`}
          </Button>
        </Box>
      )}
    </Box>
  );
}