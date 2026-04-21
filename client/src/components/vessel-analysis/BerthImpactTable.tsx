import {
  Card, CardContent, Typography, Table, TableHead,
  TableRow, TableCell, TableBody, Chip, Box, Button,
} from "@mui/material";
import { TableChartRounded, KeyboardArrowDownRounded, KeyboardArrowUpRounded } from "@mui/icons-material";
import { useState } from "react";

interface Row {
  berth: string;
  block: string;
  cargo_concentration: string;
  total_travel_distance: string;
  congestion_risk: "Low" | "Medium" | "High";
}
interface Props { data: Row[]; }

const riskStyle = (v: string) => {
  if (v === "Low")    return { bgcolor: "rgba(129,201,149,0.1)", color: "#81c995", border: "1px solid rgba(129,201,149,0.22)" };
  if (v === "Medium") return { bgcolor: "rgba(253,214,99,0.1)",  color: "#fdd663", border: "1px solid rgba(253,214,99,0.22)" };
  return                     { bgcolor: "rgba(242,139,130,0.1)", color: "#f28b82", border: "1px solid rgba(242,139,130,0.22)" };
};

const COLS = ["Berth", "Cargo Concentration", "Travel Distance", "Congestion Risk"];
const LIMIT = 5;

export default function BerthImpactTable({ data }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!data?.length) return null;
  const rows = expanded ? data : data.slice(0, LIMIT);

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
          <TableChartRounded sx={{ fontSize: 16, color: "#9aa0a6" }} />
          <Typography
            sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6", letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}
          >
            Berth Impact Analysis
          </Typography>
          <Box
            sx={{
              bgcolor: "rgba(138,180,248,0.08)",
              border: "1px solid rgba(138,180,248,0.18)",
              borderRadius: 1,
              px: 1,
              py: 0.25,
            }}
          >
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#8ab4f8" }}>
              {data.length} berths
            </Typography>
          </Box>
        </Box>

        {/* Table */}
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 480 }}>
            <TableHead>
              <TableRow>
                {COLS.map(h => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={i}
                  sx={{ bgcolor: i === 0 ? "rgba(138,180,248,0.04)" : "transparent" }}
                >
                  {/* Berth */}
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ fontWeight: i === 0 ? 600 : 400, color: "#e8eaed", fontSize: "0.8125rem" }}>
                        {row.berth}
                      </Typography>
                      {i === 0 && (
                        <Chip
                          label="Recommended"
                          size="small"
                          sx={{ bgcolor: "rgba(138,180,248,0.12)", color: "#8ab4f8", border: "1px solid rgba(138,180,248,0.25)", fontSize: "0.625rem", height: 18 }}
                        />
                      )}
                    </Box>
                  </TableCell>

                  {/* Concentration */}
                  <TableCell>
                    <Typography sx={{ color: "#e8eaed", fontSize: "0.8125rem" }}>
                      {row.cargo_concentration}
                    </Typography>
                  </TableCell>

                  {/* Distance */}
                  <TableCell>
                    <Chip label={row.total_travel_distance} size="small" sx={{ ...riskStyle(row.total_travel_distance), fontSize: "0.6875rem" }} />
                  </TableCell>

                  {/* Congestion */}
                  <TableCell>
                    <Chip label={row.congestion_risk} size="small" sx={{ ...riskStyle(row.congestion_risk), fontSize: "0.6875rem" }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {/* Show more */}
        {data.length > LIMIT && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 1.5 }}>
            <Button
              onClick={() => setExpanded(v => !v)}
              endIcon={expanded ? <KeyboardArrowUpRounded /> : <KeyboardArrowDownRounded />}
              variant="text"
              size="small"
              sx={{ color: "#9aa0a6", fontSize: "0.75rem", "&:hover": { color: "#e8eaed" } }}
            >
              {expanded ? "Show less" : `Show ${data.length - LIMIT} more`}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}