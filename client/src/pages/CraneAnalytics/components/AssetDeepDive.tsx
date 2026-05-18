import { Box, Paper, alpha, useTheme } from "@mui/material";

import MetricCard from "./MetricCard";
import type { ExtendedCraneResponse } from "../../../types/crane";

interface AssetDeepDiveProps {
  craneId: string;
  data: ExtendedCraneResponse;
}

export default function AssetDeepDive({ craneId, data }: AssetDeepDiveProps) {
  const theme = useTheme();
  const selectedStat = data.crane_stats?.find((s) => s.crane_id === craneId);

  if (!selectedStat) return null;

  const activeVisitsCount =
    data.visit_crane_allocation?.filter((v) => v.cranes_used.includes(craneId)).length ?? 0;

  return (
    <Box sx={{ mb: 2.5 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: alpha(theme.palette.primary.main, 0.12),
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${alpha(
            theme.palette.background.paper,
            0.88,
          )} 100%)`,
          backdropFilter: "blur(10px)",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <MetricCard
            title="Productivity"
            value={selectedStat.moves_per_hour.toFixed(1)}
            subtitle="Average gross hourly productivity"
            accent="primary"
          />

          <MetricCard
            title="Avg Cycle"
            value={`${selectedStat.avg_cycle_minutes.toFixed(1)}m`}
            subtitle="Average time per single cycle"
            accent="info"
          />

          <MetricCard
            title="Restow Ratio"
            value={`${((selectedStat.restow_ratio ?? 0) * 100).toFixed(1)}%`}
            subtitle="Ratio of container restows to total moves"
            accent="error"
          />

          <MetricCard
            title="Active Visits"
            value={activeVisitsCount}
            subtitle="Total vessel visits allocated to asset"
            accent="success"
          />
        </Box>
      </Paper>
    </Box>
  );
}