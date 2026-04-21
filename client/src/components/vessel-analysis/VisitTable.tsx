import {
  Card, CardContent, Typography, Table, TableHead,
  TableRow, TableCell, TableBody, Chip, Box,
} from "@mui/material";
import { HistoryRounded } from "@mui/icons-material";

interface Visit {
  stay_hours: number;
  loaded_containers: number;
  discharged_containers: number;
  move_start: string;
  move_end: string;
}
interface Props { visits: Record<string, Visit>; avg: number; }

const stayStyle = (v: number, avg: number) => {
  if (v > avg * 1.3) return { bgcolor: "rgba(242,139,130,0.1)", color: "#f28b82", border: "1px solid rgba(242,139,130,0.22)" };
  if (v > avg)       return { bgcolor: "rgba(253,214,99,0.1)",  color: "#fdd663", border: "1px solid rgba(253,214,99,0.22)" };
  return                    { bgcolor: "rgba(129,201,149,0.1)", color: "#81c995", border: "1px solid rgba(129,201,149,0.22)" };
};

const COLS = ["Visit ID", "Stay", "Loaded", "Discharged", "Operation Window"];

export default function VisitTable({ visits, avg }: Props) {
  const rows = Object.entries(visits);

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
          <HistoryRounded sx={{ fontSize: 16, color: "#9aa0a6" }} />
          <Typography
            sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6", letterSpacing: "0.1em", textTransform: "uppercase", flex: 1 }}
          >
            Visit History
          </Typography>
          <Box
            sx={{
              bgcolor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 1,
              px: 1,
              py: 0.25,
            }}
          >
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6" }}>
              avg {avg.toFixed(1)} hrs
            </Typography>
          </Box>
        </Box>

        {/* Table */}
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableHead>
              <TableRow>
                {COLS.map(h => <TableCell key={h}>{h}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(([id, v]) => {
                const s = stayStyle(v.stay_hours, avg);
                return (
                  <TableRow key={id}>
                    {/* Visit ID */}
                    <TableCell>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: "#e8eaed", fontFamily: "'Roboto Mono', monospace" }}>
                        {id}
                      </Typography>
                    </TableCell>

                    {/* Stay */}
                    <TableCell>
                      <Chip
                        label={`${v.stay_hours.toFixed(1)} hrs`}
                        size="small"
                        sx={{ ...s, fontSize: "0.6875rem", fontWeight: 600 }}
                      />
                    </TableCell>

                    {/* Loaded */}
                    <TableCell>
                      <Typography sx={{ fontSize: "0.8125rem", color: "#e8eaed" }}>
                        {v.loaded_containers}
                        <Typography component="span" sx={{ fontSize: "0.75rem", color: "#5f6368", ml: 0.5 }}>ctr</Typography>
                      </Typography>
                    </TableCell>

                    {/* Discharged */}
                    <TableCell>
                      <Typography sx={{ fontSize: "0.8125rem", color: "#e8eaed" }}>
                        {v.discharged_containers}
                        <Typography component="span" sx={{ fontSize: "0.75rem", color: "#5f6368", ml: 0.5 }}>ctr</Typography>
                      </Typography>
                    </TableCell>

                    {/* Operation window */}
                    <TableCell>
                      <Typography sx={{ fontSize: "0.75rem", color: "#e8eaed", fontFamily: "'Roboto Mono', monospace" }}>
                        {v.move_start}
                      </Typography>
                      <Typography sx={{ fontSize: "0.75rem", color: "#5f6368", fontFamily: "'Roboto Mono', monospace" }}>
                        → {v.move_end}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}