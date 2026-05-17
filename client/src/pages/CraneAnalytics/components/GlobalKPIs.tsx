import { Grid, Box } from "@mui/material";
import MetricCard from "./MetricCard";
import SectionLabel from "./SectionLabel";
import type { ExtendedCraneResponse } from "../../../types/crane";

interface GlobalKPIsProps {
  data: ExtendedCraneResponse;
}

export default function GlobalKPIs({ data }: GlobalKPIsProps) {
  return (
    <Box sx={{ mb: 5 }}>
      <SectionLabel label="Global Performance" />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Total System Moves"
            value={(data.summary?.total_moves ?? 0).toLocaleString()}
            subtitle="Raw terminal throughput"
            accent="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Effective Moves"
            value={(data.summary?.effective_moves ?? 0).toLocaleString()}
            subtitle="Valid operational cycles"
            accent="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Active Assets"
            value={data.summary?.active_cranes ?? 0}
            subtitle="Cranes deployed in window"
            accent="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Anomaly Rate"
            value={`${((data.summary?.anomaly_rate ?? 0) * 100).toFixed(1)}%`}
            subtitle="Flagged for review"
            accent="error"
          />
        </Grid>
      </Grid>
    </Box>
  );
}
