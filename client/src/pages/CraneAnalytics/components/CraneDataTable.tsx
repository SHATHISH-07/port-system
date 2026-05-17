import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { RatingChip, TerminalBadge } from "./RatingChip";
import type { ExtendedCraneResponse } from "../../../types/crane";

interface CraneDataTableProps {
  craneId: string;
  data: ExtendedCraneResponse;
  page: number;
  rowsPerPage: number;
  onPageChange: (newPage: number) => void;
  onCraneSelect: (craneId: string) => void;
}

const thSx = (theme: ReturnType<typeof useTheme>) => ({
  fontWeight: 800,
  fontSize: "0.72rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "text.primary",
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
  py: 2,
  px: 3,
  bgcolor: theme.palette.mode === "light"
    ? alpha(theme.palette.grey[100], 0.96)
    : alpha(theme.palette.background.default, 0.92),
  whiteSpace: "nowrap" as const,
});

const tdSx = (theme: ReturnType<typeof useTheme>) => ({
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.05)}`,
  py: 1.8,
  px: 3,
  fontSize: "0.82rem",
});

export default function CraneDataTable({
  craneId,
  data,
  page,
  rowsPerPage,
  onPageChange,
  onCraneSelect,
}: CraneDataTableProps) {
  const theme = useTheme();

  const visitRows = data.visit_crane_allocation ?? [];
  const statRows = data.crane_stats ?? [];
  const activeRows = craneId ? visitRows : statRows;
  const paginatedRows = activeRows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  return (
    <Box sx={{ mt: 5 }}>
      <Box
        sx={{
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
          overflow: "hidden",
          bgcolor: "background.paper",
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
          width: "100%",
        }}
      >
        <Box sx={{ px: 3, py: 2.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {craneId ? "Visit History" : "Asset Overview"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {craneId 
              ? `Operational visit logs for ${craneId} showing total moves and cranes deployed` 
              : "Overview of all active crane assets, their throughput and productivity ratings"}
          </Typography>
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              {craneId ? (
                <>
                  <TableCell sx={thSx(theme)}>Visit ID</TableCell>
                  <TableCell sx={thSx(theme)}>Terminal</TableCell>
                  <TableCell align="right" sx={thSx(theme)}>
                    Moves
                  </TableCell>
                  <TableCell sx={thSx(theme)}>Cranes Used</TableCell>
                </>
              ) : (
                <>
                  <TableCell sx={thSx(theme)}>Asset ID</TableCell>
                  <TableCell sx={thSx(theme)}>Terminal</TableCell>
                  <TableCell align="right" sx={thSx(theme)}>
                    Total Moves
                  </TableCell>
                  <TableCell align="right" sx={thSx(theme)}>
                    MPH
                  </TableCell>
                  <TableCell align="right" sx={thSx(theme)}>
                    Cycle (min)
                  </TableCell>
                  <TableCell align="right" sx={thSx(theme)}>
                    Rating
                  </TableCell>
                </>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {craneId
              ? (paginatedRows as typeof visitRows).map((v, index) => (
                  <TableRow
                    key={v.visit_id}
                    hover
                    sx={{
                      bgcolor:
                        index % 2 === 0
                          ? theme.palette.mode === "light"
                            ? alpha(theme.palette.grey[50], 0.9)
                            : alpha(theme.palette.action.hover, 0.18)
                          : "transparent",
                      "&:last-child td": { border: 0 },
                      "&:hover": {
                        bgcolor:
                          theme.palette.mode === "light"
                            ? alpha(theme.palette.primary.main, 0.05)
                            : alpha(theme.palette.action.hover, 0.28),
                      },
                    }}
                  >
                    <TableCell
                      sx={{
                        ...tdSx(theme),
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {v.visit_id}
                    </TableCell>
                    <TableCell sx={tdSx(theme)}>
                      <TerminalBadge id={v.yard_id} />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...tdSx(theme),
                        fontWeight: 800,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {v.total_moves.toLocaleString()}
                    </TableCell>
                    <TableCell sx={tdSx(theme)}>
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {v.cranes_used.map((cid) => (
                          <Box
                            key={cid}
                            sx={{
                              display: "inline-flex",
                              px: 1,
                              py: 0.3,
                              borderRadius: "5px",
                              border: `1px solid ${
                                cid === craneId
                                  ? alpha(theme.palette.primary.main, 0.35)
                                  : alpha(theme.palette.divider, 0.12)
                              }`,
                              bgcolor:
                                cid === craneId
                                  ? alpha(theme.palette.primary.main, 0.07)
                                  : "transparent",
                            }}
                          >
                            <Typography
                              sx={{
                                fontFamily: "'DM Mono', monospace",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color:
                                  cid === craneId
                                    ? "primary.main"
                                    : "text.disabled",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {cid}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              : (paginatedRows as typeof statRows).map((s, index) => (
                  <TableRow
                    key={`${s.crane_id}-${s.yard_id}`}
                    hover
                    onClick={() => onCraneSelect(s.crane_id)}
                    sx={{
                      cursor: "pointer",
                      bgcolor:
                        index % 2 === 0
                          ? theme.palette.mode === "light"
                            ? alpha(theme.palette.grey[50], 0.9)
                            : alpha(theme.palette.action.hover, 0.18)
                          : "transparent",
                      "&:last-child td": { border: 0 },
                      "&:hover": {
                        bgcolor:
                          theme.palette.mode === "light"
                            ? alpha(theme.palette.primary.main, 0.05)
                            : alpha(theme.palette.action.hover, 0.28),
                      },
                    }}
                  >
                    <TableCell
                      sx={{
                        ...tdSx(theme),
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                      }}
                    >
                      {s.crane_id}
                    </TableCell>
                    <TableCell sx={tdSx(theme)}>
                      <TerminalBadge id={s.yard_id} />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...tdSx(theme),
                        fontWeight: 800,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {s.total_moves.toLocaleString()}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...tdSx(theme),
                        fontWeight: 800,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "0.8rem",
                        color: "primary.main",
                      }}
                    >
                      {s.moves_per_hour.toFixed(1)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...tdSx(theme),
                        fontFamily: "'DM Mono', monospace",
                        fontWeight: 700,
                        fontSize: "0.78rem",
                      }}
                    >
                      {s.avg_cycle_minutes?.toFixed(1) ?? "—"}
                    </TableCell>
                    <TableCell align="right" sx={tdSx(theme)}>
                      <RatingChip rating={s.productivity_rating} />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={activeRows.length}
          page={page}
          onPageChange={(_, newPage) => onPageChange(newPage)}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[10]}
          sx={{
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
            color: "text.disabled",
            ".MuiTablePagination-toolbar": { minHeight: 46, px: 2.5 },
            ".MuiTablePagination-displayedRows": {
              fontSize: "0.68rem",
              fontFamily: "'DM Mono', monospace",
            },
            ".MuiTablePagination-actions button": { color: "text.secondary" },
          }}
        />
      </Box>
    </Box>
  );
}
