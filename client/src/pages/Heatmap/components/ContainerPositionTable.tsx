import React, { useMemo, useState } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  alpha,
  useTheme,
  TablePagination,
  InputAdornment,
  TextField
} from "@mui/material";
import { SearchRounded } from "@mui/icons-material";
import type { VesselHeatmapViewData, ContainerData } from "../../../types/heatmap";

interface ContainerPositionTableProps {
  data: VesselHeatmapViewData | null;
}

export default function ContainerPositionTable({ data }: ContainerPositionTableProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState("");

  const containers = useMemo(() => {
    if (!data || !data.blocks) return [];
    const allContainers: (ContainerData & { blockId: string })[] = [];
    Object.entries(data.blocks).forEach(([blockId, blockData]) => {
      if (blockData.containers && Array.isArray(blockData.containers)) {
        blockData.containers.forEach((c) => {
          allContainers.push({ ...c, blockId });
        });
      }
    });
    return allContainers;
  }, [data]);

  const filteredContainers = useMemo(() => {
    if (!search) return containers;
    const lowerSearch = search.toLowerCase();
    return containers.filter(
      (c) =>
        c.unit_id?.toLowerCase().includes(lowerSearch) ||
        c.blockId?.toLowerCase().includes(lowerSearch) ||
        c.position?.toLowerCase().includes(lowerSearch) ||
        c.category?.toLowerCase().includes(lowerSearch)
    );
  }, [containers, search]);

  const paginatedContainers = useMemo(() => {
    return filteredContainers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredContainers, page, rowsPerPage]);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (!data) {
    return (
      <Box sx={{ p: 4, textAlign: "center", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">No data available. Please load a heatmap analysis.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", px: { xs: 2, md: 4 }, pt: { xs: 8, md: 9 }, pb: { xs: 6, md: 7 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Container Yard Positions</Typography>
          <Typography variant="body2" color="text.secondary">
            Detailed breakdown of {filteredContainers.length} container{filteredContainers.length === 1 ? "" : "s"} across all blocks
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Search container, block, category..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ width: 300, "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>
            }
          }}
        />
      </Box>

      <TableContainer component={Paper} elevation={isDark ? 0 : 2} sx={{ flex: 1, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflowY: "auto", bgcolor: isDark ? alpha("#000", 0.4) : alpha("#fff", 0.7), backdropFilter: "blur(12px)" }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Unit ID</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Block</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Bay</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Row</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Tier</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Outbound Service</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Flags</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedContainers.map((row, idx) => {
              return (
              <TableRow key={`${row.unit_id}-${idx}`} hover>
                <TableCell sx={{ fontWeight: 600, fontFamily: "'Inter', monospace" }}>{row.unit_id}</TableCell>
                <TableCell>
                  <Chip size="small" label={row.blockId} sx={{ borderRadius: 1, fontWeight: 700, fontSize: "0.7rem", bgcolor: isDark ? alpha("#fff", 0.1) : alpha("#000", 0.05) }} />
                </TableCell>
                <TableCell sx={{ color: "text.secondary", fontFamily: "'Inter', monospace" }}>{row.bay || "-"}</TableCell>
                <TableCell sx={{ color: "text.secondary", fontFamily: "'Inter', monospace" }}>{row.row || "-"}</TableCell>
                <TableCell sx={{ color: "text.secondary", fontFamily: "'Inter', monospace" }}>{row.tier || "-"}</TableCell>
                <TableCell>{row.category || "-"}</TableCell>
                <TableCell>{row.outbound_service || "-"}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                    {row.hazardous && <Chip size="small" label="HAZ" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700, bgcolor: alpha("#ef4444", 0.1), color: "#ef4444" }} />}
                    {row.reefer && <Chip size="small" label="REF" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700, bgcolor: alpha("#3b82f6", 0.1), color: "#3b82f6" }} />}
                    {row.oog && <Chip size="small" label="OOG" sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700, bgcolor: alpha("#f59e0b", 0.1), color: "#f59e0b" }} />}
                  </Box>
                </TableCell>
              </TableRow>
              );
            })}
            {paginatedContainers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6, color: "text.secondary" }}>
                  No containers match the current criteria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[25, 50, 100]}
        component="div"
        count={filteredContainers.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Box>
  );
}
