import {
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
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

const thSx = (theme: Theme) => ({
  fontWeight: 800,
  fontSize: "0.8rem",
  color: "text.secondary",
  borderBottom: `2px solid`,
  borderColor: 'divider',
  py: 1.5,
  px: 2,
  bgcolor: "transparent",
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
});

const tdSx = (theme: Theme) => ({
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
  py: 1.25,
  px: 2,
  fontSize: "0.8rem",
  textAlign: "center" as const,
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
    <Box sx={{ mt: 2.5 }}>
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          bgcolor: "background.paper",
          width: "100%",
          overflow: "hidden",
          borderColor: alpha(theme.palette.divider, 0.9),
          boxShadow: "0 4px 16px rgba(0,0,0,0.02)",
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 800, fontSize: "0.9rem" }}>
            {craneId ? "Visit History" : "Asset Overview"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
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
                  <TableCell sx={thSx(theme)}>
                    Moves
                  </TableCell>
                  <TableCell sx={thSx(theme)}>Cranes Used</TableCell>
                </>
              ) : (
                <>
                  <TableCell sx={thSx(theme)}>Asset ID</TableCell>
                  <TableCell sx={thSx(theme)}>Terminal</TableCell>
                  <TableCell sx={thSx(theme)}>
                    Total Moves
                  </TableCell>
                  <TableCell sx={thSx(theme)}>
                    MPH
                  </TableCell>
                  <TableCell sx={thSx(theme)}>
                    Cycle (min)
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
                    "&:last-child td": { border: 0 },
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <TableCell
                    sx={{
                      ...tdSx(theme),
                      fontSize: "0.8rem",
                      fontWeight: 700,
                    }}
                  >
                    {v.visit_id}
                  </TableCell>
                  <TableCell sx={tdSx(theme)}>
                    <TerminalBadge id={v.yard_id} />
                  </TableCell>
                  <TableCell
                    sx={{
                      ...tdSx(theme),
                      fontWeight: 800,
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
                            px: 0.75,
                            py: 0.2,
                            borderRadius: "4px",
                            border: `1px solid ${cid === craneId
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
                              fontSize: "0.55rem",
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
                    "&:last-child td": { border: 0 },
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <TableCell
                    sx={{
                      ...tdSx(theme),
                      fontSize: "0.8rem",
                      fontWeight: 700,
                    }}
                  >
                    {s.crane_id}
                  </TableCell>
                  <TableCell sx={tdSx(theme)}>
                    <TerminalBadge id={s.yard_id} />
                  </TableCell>
                  <TableCell
                    sx={{
                      ...tdSx(theme),
                      fontWeight: 800,
                      fontSize: "0.8rem",
                    }}
                  >
                    {s.total_moves.toLocaleString()}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...tdSx(theme),
                      fontWeight: 800,
                      fontSize: "0.8rem",
                      color: "primary.main",
                    }}
                  >
                    {s.moves_per_hour.toFixed(1)}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...tdSx(theme),
                      fontWeight: 700,
                      fontSize: "0.8rem",
                    }}
                  >
                    {s.avg_cycle_minutes?.toFixed(1) ?? "—"}
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
            ".MuiTablePagination-toolbar": { minHeight: 40, px: 2 },
            ".MuiTablePagination-displayedRows": {
              fontSize: "0.65rem",
            },
            ".MuiTablePagination-actions button": { color: "text.secondary", p: 0.5 },
          }}
        />
      </Card>
    </Box>
  );
}
