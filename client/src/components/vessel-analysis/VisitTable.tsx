import {
  Box, Typography, Table, TableHead,
  TableRow, TableCell, TableBody,
} from "@mui/material";

interface Visit {
  stay_hours: number;
  loaded_containers: number;
  discharged_containers: number;
  move_start: string;
  move_end: string;
}
interface Props { visits: Record<string, Visit>; avg: number; }

const stayColor = (v: number, avg: number) => {
  if (v > avg * 1.3) return { color: "#f28b82", bg: "rgba(242,139,130,0.1)", border: "rgba(242,139,130,0.22)" };
  if (v > avg) return { color: "#fdd663", bg: "rgba(253,214,99,0.1)", border: "rgba(253,214,99,0.22)" };
  return { color: "#81c995", bg: "rgba(129,201,149,0.1)", border: "rgba(129,201,149,0.22)" };
};

export default function VisitTable({ visits, avg }: Props) {
  const rows = Object.entries(visits || {});
  const maxStay = Math.max(...rows.map(([, v]) => v.stay_hours), 1);

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
          Visit History
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "#5f6368", fontFamily: "monospace" }}>
          avg {avg.toFixed(1)} hrs / visit
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
              <TableCell sx={{ pl: 3 }}>Visit ID</TableCell>
              <TableCell>Stay Duration</TableCell>
              <TableCell>Loaded</TableCell>
              <TableCell>Discharged</TableCell>
              <TableCell>Operation Window</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(([id, v]) => {
              const s = stayColor(v.stay_hours, avg);
              const barW = (v.stay_hours / maxStay) * 100;
              return (
                <TableRow
                  key={id}
                  sx={{
                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                    "& td": {
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      py: 1.75,
                    },
                  }}
                >
                  {/* ID */}
                  <TableCell sx={{ pl: 3 }}>
                    <Typography
                      sx={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "#e8eaed",
                        fontFamily: "'Roboto Mono', monospace",
                        letterSpacing: "-0.3px",
                      }}
                    >
                      {id}
                    </Typography>
                  </TableCell>

                  {/* Stay + mini bar */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        px: 1,
                        py: 0.3,
                        borderRadius: 0.5,
                        bgcolor: s.bg,
                        border: `1px solid ${s.border}`,
                        mb: 0.75,
                      }}
                    >
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: s.color }}>
                        {v.stay_hours.toFixed(1)} hrs
                      </Typography>
                    </Box>
                    <Box sx={{ height: 2, width: 72, bgcolor: "rgba(255,255,255,0.08)", borderRadius: 1 }}>
                      <Box
                        sx={{
                          height: "100%",
                          width: `${barW}%`,
                          bgcolor: s.color,
                          opacity: 0.65,
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                  </TableCell>

                  {/* Loaded */}
                  <TableCell>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#bdc1c6", fontFamily: "monospace" }}>
                      {v.loaded_containers}
                      <Typography component="span" sx={{ fontSize: "0.6875rem", color: "#5f6368", ml: 0.5, fontFamily: "inherit" }}>
                        ctr
                      </Typography>
                    </Typography>
                  </TableCell>

                  {/* Discharged */}
                  <TableCell>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#bdc1c6", fontFamily: "monospace" }}>
                      {v.discharged_containers}
                      <Typography component="span" sx={{ fontSize: "0.6875rem", color: "#5f6368", ml: 0.5, fontFamily: "inherit" }}>
                        ctr
                      </Typography>
                    </Typography>
                  </TableCell>

                  {/* Window */}
                  <TableCell>
                    <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6", fontFamily: "'Roboto Mono', monospace" }}>
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
    </Box>
  );
}