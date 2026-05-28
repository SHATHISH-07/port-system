import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Alert,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useTheme,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ScaleIcon from "@mui/icons-material/Scale";
import SortIcon from "@mui/icons-material/Sort";
import RefreshIcon from "@mui/icons-material/Refresh";

import type { PreConsolidationData } from "../../../types/stowage";

// ─── Props ────────────────────────────────────────────────────────────────────

interface HousekeepingTableProps {
  data: PreConsolidationData | null;
}

// ─── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_COLOR = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
} as const;

const PRIORITY_BG = {
  HIGH: "rgba(239,68,68,0.10)",
  MEDIUM: "rgba(245,158,11,0.10)",
  LOW: "rgba(34,197,94,0.10)",
} as const;

const WEIGHT_COLOR: Record<string, string> = {
  HEAVY: "#ef4444",
  MEDIUM: "#f59e0b",
  LIGHT: "#22c55e",
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color?: string;
  icon: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flex: 1,
        minWidth: 120,
      }}
    >
      <Box
        sx={{
          p: 1,
          borderRadius: 1.5,
          bgcolor: color ? alpha(color, 0.12) : alpha(theme.palette.primary.main, 0.12),
          color: color || "primary.main",
          display: "flex",
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, fontSize: "1.2rem", lineHeight: 1 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
          {label}
        </Typography>
      </Box>
    </Paper>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HousekeepingTable({
  data,
}: HousekeepingTableProps) {
  const theme = useTheme();

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const filteredMoves = useMemo(() => {
    if (!data) return [];
    return data.moves.filter((m) => {
      const matchSearch =
        !search ||
        m.unitId.toLowerCase().includes(search.toLowerCase()) ||
        m.fromPosition.toLowerCase().includes(search.toLowerCase()) ||
        m.block.toLowerCase().includes(search.toLowerCase()) ||
        (m.portOfDischarge || "").toLowerCase().includes(search.toLowerCase());
      const matchPriority = !priorityFilter || m.priority === priorityFilter;
      return matchSearch && matchPriority;
    });
  }, [data, search, priorityFilter]);

  const paginatedMoves = filteredMoves.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ── Empty / initial state ──────────────────────────────────────────────────
  if (!data) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          py: 10,
          gap: 2,
          color: "text.secondary",
        }}
      >
        <CleaningServicesPlaceholder />
        <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
          Yard Preparation Plan
        </Typography>
        <Typography sx={{ fontSize: "0.85rem", maxWidth: 480, textAlign: "center" }}>
          Upload your container list or click Analyze to scan yard stacks for weight and discharge inversions.
        </Typography>
      </Box>
    );
  }

  // ── No data ────────────────────────────────────────────────────────────────
  if (!data) return null;

  const { summary } = data;

  return (
    <Box sx={{ width: "100%" }}>
      {/* Summary cards */}
      <Box sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 1.5, mb: 2.5 }}>
        <StatCard
          label="Total Moves Required"
          value={summary.totalMovesRequired}
          icon={<RefreshIcon fontSize="small" />}
        />
        <StatCard
          label="High Priority"
          value={summary.highPriorityMoves}
          color={PRIORITY_COLOR.HIGH}
          icon={<WarningAmberIcon fontSize="small" />}
        />
        <StatCard
          label="Weight Inversions"
          value={summary.weightInversionsFound}
          color="#f59e0b"
          icon={<ScaleIcon fontSize="small" />}
        />
        <StatCard
          label="Discharge Inversions"
          value={summary.dischargeInversionsFound}
          color="#6366f1"
          icon={<SortIcon fontSize="small" />}
        />
        <StatCard
          label="Stacks Analyzed"
          value={summary.totalStacksAnalyzed}
          icon={<WarningAmberIcon fontSize="small" />}
        />
      </Box>

      {summary.totalMovesRequired === 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Yard is optimally stacked — no housekeeping moves required for this vessel.
        </Alert>
      )}

      {summary.totalMovesRequired > 0 && (
        <>
          {/* Filters */}
          <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
            <TextField
              size="small"
              placeholder="Search container, block, port…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              sx={{
                flex: 1, minWidth: 200,
                "& .MuiOutlinedInput-root": { borderRadius: 2, height: 36, fontSize: "0.8rem" },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <ToggleButtonGroup
              value={priorityFilter}
              exclusive
              onChange={(_, v) => { setPriorityFilter(v); setPage(0); }}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5, py: 0.4, fontSize: "0.72rem", fontWeight: 700, textTransform: "none",
                  borderRadius: "8px !important", border: "1px solid !important",
                  borderColor: "divider !important",
                  "&.Mui-selected": { color: "#fff" },
                },
              }}
            >
              <ToggleButton value="HIGH" sx={{ "&.Mui-selected": { bgcolor: PRIORITY_COLOR.HIGH } }}>
                High
              </ToggleButton>
              <ToggleButton value="MEDIUM" sx={{ "&.Mui-selected": { bgcolor: PRIORITY_COLOR.MEDIUM } }}>
                Medium
              </ToggleButton>
              <ToggleButton value="LOW" sx={{ "&.Mui-selected": { bgcolor: PRIORITY_COLOR.LOW } }}>
                Low
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary">
              Plan automatically generated from Current Planning analysis
            </Typography>
          </Box>

          {/* Table */}
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}
          >
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                <TableRow>
                  {["#", "Unit ID", "Current Position", "Block", "Tier", "Weight", "Port of Discharge", "Reason for Move", "Priority"].map((h) => (
                    <TableCell
                      key={h}
                      sx={{ fontWeight: 700, fontSize: "0.72rem", py: 1.2, color: "text.secondary", whiteSpace: "nowrap" }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedMoves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5, color: "text.secondary" }}>
                      No moves match the current filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMoves.map((move, idx) => (
                    <TableRow
                      key={move.unitId + idx}
                      sx={{
                        "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.03) },
                        borderLeft: `3px solid ${PRIORITY_COLOR[move.priority]}`,
                      }}
                    >
                      <TableCell sx={{ color: "text.secondary", fontSize: "0.72rem" }}>
                        {page * rowsPerPage + idx + 1}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {move.unitId}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "text.secondary" }}>
                        {move.fromPosition}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={move.block}
                          size="small"
                          sx={{ fontWeight: 700, fontSize: "0.68rem", borderRadius: 1, height: 20 }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {move.tier}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={move.weightBand}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.68rem",
                            borderRadius: 1,
                            height: 20,
                            bgcolor: alpha(WEIGHT_COLOR[move.weightBand] || "#999", 0.12),
                            color: WEIGHT_COLOR[move.weightBand] || "text.primary",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.75rem" }}>
                        {move.portOfDischarge || "—"}
                        {move.dischargeOrder != null && (
                          <Typography component="span" sx={{ ml: 0.5, fontSize: "0.65rem", color: "text.secondary" }}>
                            (#{move.dischargeOrder})
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 280 }}>
                        <Tooltip title={move.reason} placement="top">
                          <Typography
                            sx={{
                              fontSize: "0.72rem",
                              color: "text.secondary",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 280,
                              display: "block",
                            }}
                          >
                            {move.reason}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={move.priority}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.68rem",
                            borderRadius: 1,
                            height: 20,
                            bgcolor: PRIORITY_BG[move.priority],
                            color: PRIORITY_COLOR[move.priority],
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[25, 50, 100]}
            component="div"
            count={filteredMoves.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </>
      )}
    </Box>
  );
}

// Simple SVG placeholder icon
function CleaningServicesPlaceholder() {
  return (
    <Box sx={{ color: "text.disabled", "& svg": { width: 56, height: 56 } }}>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 000 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5zM6 20h12v2H6z" />
      </svg>
    </Box>
  );
}
