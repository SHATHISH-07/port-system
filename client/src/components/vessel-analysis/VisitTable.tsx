import {
  Box, Typography, Table, TableHead,
  TableRow, TableCell, TableBody, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

interface Visit {
  stay_hours: number;
  loaded_containers: number;
  discharged_containers: number;
  move_start: string;
  move_end: string;
}

interface Props { visits: Record<string, Visit>; avg: number; }

const LIMIT = 10;

export default function VisitTable({ visits, avg }: Props) {
  const theme = useTheme();

  const allRows = Object.entries(visits || {}).sort((a, b) =>
    new Date(b[1].move_start).getTime() - new Date(a[1].move_start).getTime()
  );
  const rows = allRows.slice(0, LIMIT);
  const hasMore = allRows.length > LIMIT;
  const maxStay = Math.max(...rows.map(([, v]) => v.stay_hours), 1);

  const stayColor = (v: number) => {
    if (v > avg * 1.3) return theme.palette.error.main;
    if (v > avg)       return theme.palette.warning.main;
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
          Visit History {hasMore && `(Recent 10 of ${allRows.length})`}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
          avg {avg.toFixed(1)} hrs / visit
        </Typography>
      </Box>

      {/* Table */}
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ pl: 3 }}>Visit ID</TableCell>
              <TableCell>Stay Duration</TableCell>
              <TableCell>Loaded</TableCell>
              <TableCell>Discharged</TableCell>
              <TableCell>Operation Window</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(([id, v]) => {
              const sc = stayColor(v.stay_hours);
              const barW = (v.stay_hours / maxStay) * 100;
              return (
                <TableRow key={id}>
                  {/* ID */}
                  <TableCell sx={{ pl: 3 }}>
                    <Typography
                      sx={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "text.primary",
                        fontFamily: "monospace",
                        letterSpacing: "-0.3px",
                      }}
                    >
                      {id}
                    </Typography>
                  </TableCell>

                  {/* Stay + bar */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        px: 1, py: 0.3,
                        borderRadius: 1,
                        bgcolor: alpha(sc, 0.1),
                        border: `1px solid ${alpha(sc, 0.25)}`,
                        mb: 0.75,
                      }}
                    >
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: sc }}>
                        {v.stay_hours.toFixed(1)} hrs
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        height: 3, width: 72,
                        bgcolor: alpha(theme.palette.text.primary, 0.08),
                        borderRadius: 2,
                      }}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          width: `${barW}%`,
                          bgcolor: sc,
                          opacity: 0.7,
                          borderRadius: 2,
                        }}
                      />
                    </Box>
                  </TableCell>

                  {/* Loaded */}
                  <TableCell>
                    <Typography
                      sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", fontFamily: "monospace" }}
                    >
                      {v.loaded_containers}
                      <Typography component="span" sx={{ fontSize: "0.6875rem", color: "text.disabled", ml: 0.5, fontFamily: "inherit" }}>
                        ctr
                      </Typography>
                    </Typography>
                  </TableCell>

                  {/* Discharged */}
                  <TableCell>
                    <Typography
                      sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", fontFamily: "monospace" }}
                    >
                      {v.discharged_containers}
                      <Typography component="span" sx={{ fontSize: "0.6875rem", color: "text.disabled", ml: 0.5, fontFamily: "inherit" }}>
                        ctr
                      </Typography>
                    </Typography>
                  </TableCell>

                  {/* Window */}
                  <TableCell>
                    <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontFamily: "monospace" }}>
                      {v.move_start}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
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