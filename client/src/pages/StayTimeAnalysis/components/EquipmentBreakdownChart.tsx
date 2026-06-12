import React from "react";
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
  alpha,
  useTheme
} from "@mui/material";

interface EquipmentBreakdownChartProps {
  equipmentData: Record<string, number>;
}

export const EquipmentBreakdownChart: React.FC<EquipmentBreakdownChartProps> = ({ equipmentData }) => {
  const theme = useTheme();

  // Convert Record<string, number> to an array
  const data = Object.entries(equipmentData || {})
    .map(([type, count]) => ({
      type,
      count,
    }))
    .sort((a, b) => b.count - a.count); // Sort descending

  if (data.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
        No equipment breakdown data available.
      </Box>
    );
  }

  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography variant="h6" sx={{ mb: 0.5, fontWeight: 700, fontSize: "1.1rem" }}>
        Detailed Equipment Classification
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Showing {data.length} unique equipment types during this visit.
      </Typography>

      <Paper
        elevation={0}
        sx={{
          flexGrow: 1,
          bgcolor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.8),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 460
        }}
      >
        <TableContainer sx={{ flexGrow: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    letterSpacing: "0.05em",
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: theme.palette.background.paper,
                  }}
                >
                  Equipment Types
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    letterSpacing: "0.05em",
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: theme.palette.background.paper,
                  }}
                >
                  Count
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, index) => (
                <TableRow
                  key={index}
                  hover
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                    transition: 'background-color 0.2s',
                  }}
                >
                  <TableCell component="th" scope="row" sx={{ fontWeight: 600, color: "text.primary" }}>
                    {row.type}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: "text.primary" }}>
                    {row.count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Footer summary */}
        <Box
          sx={{
            p: 1.5,
            borderTop: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>
            Total Units
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "primary.main" }}>
            {totalCount}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};
