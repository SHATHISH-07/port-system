import { Box, Grid, Paper, Stack, Typography, alpha, useTheme } from "@mui/material";
import { RatingChip } from "./RatingChip";
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

  const activeVisitsCount = data.visit_crane_allocation?.filter((v) =>
    v.cranes_used.includes(craneId),
  ).length ?? 0;

  return (
    <Box sx={{ mb: 2.5 }}>
      {/* Visual Parity Grid */}
      <Grid container spacing={2}>
        {/* Left Side: Huge Hero productivity card */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              height: "100%",
              borderRadius: 2,
              border: "1px solid",
              borderColor: alpha(theme.palette.primary.main, 0.15),
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.5)} 100%)`,
              backdropFilter: "blur(10px)",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Box sx={{ position: "relative", zIndex: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", fontSize: '0.7rem' }}>
                  Asset Efficiency
                </Typography>
                <RatingChip rating={selectedStat.productivity_rating} />
              </Box>

              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.08em", fontSize: '0.68rem' }}>
                Asset: {craneId} • Terminal: {selectedStat.yard_id?.toUpperCase()}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mt: 0.5 }}>
                <Typography sx={{ fontWeight: 900, letterSpacing: "-0.03em", fontSize: { xs: "2.5rem", md: "3.5rem" }, fontFamily: "'DM Mono', monospace" }}>
                  {selectedStat.moves_per_hour.toFixed(1)}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: "text.secondary", opacity: 0.5 }}>
                  MPH
                </Typography>
              </Box>

              <Typography variant="caption" sx={{ mt: 1, display: 'block', color: "text.secondary", fontWeight: 500, lineHeight: 1.4 }}>
                Average gross hourly productivity of the crane asset during the selected window.
              </Typography>
            </Box>
            
            <Box
              sx={{
                position: "absolute",
                right: -30,
                bottom: -30,
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
                zIndex: 0,
              }}
            />
          </Paper>
        </Grid>

        {/* Right Side: Stacked KPIs */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={1.5} sx={{ height: "100%" }}>
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
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
