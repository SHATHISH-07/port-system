import {
  Box, Typography, Table, TableHead,
  TableRow, TableCell, TableBody, Button,
} from "@mui/material";
import { useState } from "react";

interface Row {
  berth: string;
  block: string;
  cargo_concentration: string;
  total_travel_distance: string;
  congestion_risk: "Low" | "Medium" | "High";
}
interface Props { data: Row[]; }

const badgeColor = (v: string) => {
  if (v === "High") return { color: "#f28b82", bg: "rgba(242,139,130,0.1)", border: "rgba(242,139,130,0.22)" };
  if (v === "Medium") return { color: "#fdd663", bg: "rgba(253,214,99,0.1)", border: "rgba(253,214,99,0.22)" };
  return { color: "#81c995", bg: "rgba(129,201,149,0.1)", border: "rgba(129,201,149,0.22)" };
};

const LIMIT = 5;

export default function BerthImpactTable({ data }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!data?.length) return null;
  const rows = expanded ? data : data.slice(0, LIMIT);

  return (
    <Box
      sx={{
        bgcolor: "#292a2d",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      {/* Header strip */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 500,
            color: "#9aa0a6",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Berth Impact Analysis
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "#5f6368", fontFamily: "monospace" }}>
          {data.length} berths ranked
        </Typography>
      </Box>

      {/* Table */}
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow
              sx={{
                bgcolor: "rgba(255,255,255,0.025)",
                "& th": {
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  color: "#5f6368",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  py: 1.5,
                  whiteSpace: "nowrap",
                },
              }}
            >
              <TableCell sx={{ width: 48, pl: 3 }}>#</TableCell>
              <TableCell>Berth</TableCell>
              <TableCell>Cargo Concentration</TableCell>
              <TableCell>Travel Distance</TableCell>
              <TableCell>Congestion Risk</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => {
              const concS = badgeColor(row.cargo_concentration);
              const riskS = badgeColor(row.congestion_risk);
              return (
                <TableRow
                  key={i}
                  sx={{
                    bgcolor: i === 0 ? "rgba(138,180,248,0.04)" : "transparent",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                    "& td": {
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      py: 1.75,
                      fontSize: "0.8125rem",
                    },
                  }}
                >
                  {/* Rank */}
                  <TableCell sx={{ pl: 3 }}>
                    <Typography
                      sx={{
                        fontSize: "0.6875rem",
                        color: i === 0 ? "#8ab4f8" : "#3c4043",
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
                          fontWeight: i === 0 ? 600 : 400,
                          color: i === 0 ? "#e8eaed" : "#bdc1c6",
                        }}
                      >
                        {row.berth}
                      </Typography>
                      {i === 0 && (
                        <Typography
                          sx={{
                            fontSize: "0.5625rem",
                            fontWeight: 700,
                            px: 0.875,
                            py: 0.25,
                            borderRadius: 0.5,
                            color: "#8ab4f8",
                            bgcolor: "rgba(138,180,248,0.1)",
                            border: "1px solid rgba(138,180,248,0.2)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Recommended
                        </Typography>
                      )}
                    </Box>
                  </TableCell>

                  {/* Concentration */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1,
                        py: 0.3,
                        borderRadius: 0.5,
                        bgcolor: concS.bg,
                        border: `1px solid ${concS.border}`,
                      }}
                    >
                      <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: concS.color }} />
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: concS.color }}>
                        {row.cargo_concentration}
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* Distance */}
                  <TableCell>
                    <Typography sx={{ fontSize: "0.8125rem", color: "#9aa0a6" }}>
                      {row.total_travel_distance}
                    </Typography>
                  </TableCell>

                  {/* Risk */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1,
                        py: 0.3,
                        borderRadius: 0.5,
                        bgcolor: riskS.bg,
                        border: `1px solid ${riskS.border}`,
                      }}
                    >
                      <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: riskS.color }} />
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: riskS.color }}>
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

      {data.length > LIMIT && (
        <Box sx={{ px: 3, py: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Button
            onClick={() => setExpanded(v => !v)}
            variant="text"
            size="small"
            sx={{
              fontSize: "0.75rem",
              color: "#9aa0a6",
              textTransform: "none",
              fontWeight: 500,
              p: 0,
              minWidth: 0,
              "&:hover": { color: "#bdc1c6", bgcolor: "transparent" },
            }}
          >
            {expanded ? "Show fewer" : `+ ${data.length - LIMIT} more berths`}
          </Button>
        </Box>
      )}
    </Box>
  );
}