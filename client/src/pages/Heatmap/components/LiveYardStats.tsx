import { Box, Card, CardContent, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface LiveYardStatsProps {
  summary: any;
  blocks?: any[] | Record<string, any>;
}

type StatTone = "primary" | "success" | "warning" | "error" | "info";

function normalizeBlocks(blocks?: any[] | Record<string, any>) {
  if (!blocks) return [];
  if (Array.isArray(blocks)) return blocks;
  return Object.values(blocks);
}

function StatCard({
  label,
  value,
  helper,
  tone = "primary",
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  helper: string;
  tone?: StatTone;
  highlight?: boolean;
}) {
  const theme = useTheme();
  const colorMap: Record<StatTone, string> = {
    primary: theme.palette.primary.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
    error: theme.palette.error.main,
    info: theme.palette.info.main,
  };

  const c = colorMap[tone];

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        borderRadius: 3,
        overflow: "hidden",
        borderColor: highlight ? alpha(c, 0.55) : "divider",
        background: `linear-gradient(180deg, ${alpha(c, 0.08)} 0%, ${alpha(
          theme.palette.background.paper,
          0.95
        )} 48%, ${theme.palette.background.paper} 100%)`,
        boxShadow: highlight ? `0 12px 30px ${alpha(c, 0.12)}` : "none",
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Stack spacing={1.2}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 1, color: "text.secondary" }}>
              {label}
            </Typography>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: 999,
                bgcolor: c,
                boxShadow: `0 0 0 6px ${alpha(c, 0.12)}`,
              }}
            />
          </Box>

          <Typography
            sx={{
              fontSize: { xs: "2rem", sm: "2.3rem" },
              lineHeight: 1,
              fontWeight: 900,
              color: highlight ? c : "text.primary",
            }}
          >
            {value}
          </Typography>

          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {helper}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function LiveYardStats({ summary, blocks }: LiveYardStatsProps) {
  if (!summary) return null;

  const normalizedBlocks = normalizeBlocks(blocks);

  const totalContainers =
    summary.total_containers ??
    normalizedBlocks.reduce((sum, b) => sum + (b.count ?? b.total_containers ?? 0), 0);

  const totalBlocks =
    summary.total_blocks ??
    normalizedBlocks.length;

  const hazmat =
    summary.hazmat_total ??
    summary.hazardous ??
    normalizedBlocks.reduce((sum, b) => sum + (b.hazardous ?? b.hazmat_count ?? 0), 0);

  const reefer =
    summary.reefer_total ??
    summary.reefer ??
    normalizedBlocks.reduce((sum, b) => sum + (b.reefer ?? b.reefer_count ?? 0), 0);

  const oog =
    summary.oog_total ??
    summary.oog ??
    normalizedBlocks.reduce((sum, b) => sum + (b.oog ?? b.oog_count ?? 0), 0);

  const specialTotal = hazmat + reefer + oog;
  const specialPct = totalContainers > 0 ? Math.min(100, Math.round((specialTotal / totalContainers) * 100)) : 0;

  return (
    <Box sx={{ width: "100%" }}>
      <Stack spacing={1.25} sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>
          Terminal Statistics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          High-level operational view of the active vessel and yard load.
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
          gap: 2,
        }}
      >
        <StatCard
          label="Total Volume"
          value={Number(totalContainers).toLocaleString()}
          helper="Active container moves required"
          tone="primary"
          highlight
        />
        <StatCard
          label="Impacted Blocks"
          value={Number(totalBlocks).toLocaleString()}
          helper="Yard blocks handling this vessel"
          tone="info"
        />
        <StatCard
          label="Hazardous Cargo"
          value={Number(hazmat).toLocaleString()}
          helper="HAZMAT units requiring buffer"
          tone={hazmat > 0 ? "error" : "primary"}
          highlight={hazmat > 0}
        />
        <StatCard
          label="Refrigerated Units"
          value={Number(reefer).toLocaleString()}
          helper="Reefers requiring active power"
          tone={reefer > 0 ? "info" : "primary"}
          highlight={reefer > 0}
        />
        <StatCard
          label="Out of Gauge"
          value={Number(oog).toLocaleString()}
          helper="Oversized units requiring special handling"
          tone={oog > 0 ? "warning" : "primary"}
          highlight={oog > 0}
        />

        <Card
          variant="outlined"
          sx={{
            borderRadius: 3,
            borderColor: "divider",
            background: (theme) => alpha(theme.palette.background.paper, 0.92),
          }}
        >
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Stack spacing={1.4}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 1, color: "text.secondary" }}>
                  Special Cargo Mix
                </Typography>
                <Chip
                  size="small"
                  label={`${specialPct}% of volume`}
                  color={specialPct > 0 ? "warning" : "default"}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={specialPct}
                sx={{ height: 10, borderRadius: 999, bgcolor: "action.hover" }}
              />

              <Typography variant="body2" color="text.secondary">
                Combined hazardous, reefer, and OOG cargo footprint.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}