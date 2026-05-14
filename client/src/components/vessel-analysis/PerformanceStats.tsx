import { Box, Typography, useTheme } from "@mui/material";

interface Props {
  actual: number;
  predicted: number;
  mode: string;
  loaded?: number | string;
  discharged?: number | string;
}

export default function PerformanceStats({ actual, predicted, mode, loaded, discharged }: Props) {
  const theme = useTheme();
  const isOverride = mode === "override" || mode === "current-override" || mode === "manual";
  const isUpcoming = mode === "upcoming_prediction";
  const isCurrent = mode === "current" || isUpcoming || isOverride;
  const diff = predicted - actual;
  const pct = actual !== 0 ? Math.abs((diff / actual) * 100).toFixed(1) : "—";
  const isBetter = diff <= 0;

  const stats = [
    {
      label: isUpcoming ? "Historical Baseline" : "Historical Average",
      value: actual.toFixed(1),
      unit: "hrs",
      sub: isUpcoming ? "Based on past service patterns" : "Avg vessel stay time",
    },
    {
      label: isUpcoming 
        ? "Scheduled Prediction"
        : isOverride
          ? `Predicted · ${loaded ?? 0}L / ${discharged ?? 0}D`
          : "ML Prediction",
      value: predicted.toFixed(1),
      unit: "hrs",
      sub: isUpcoming ? "Estimate for next arrival" : "Predicted stay time",
      valueColor: theme.palette.primary.main,
    },
    ...(!isCurrent ? [{
      label: "Variance",
      value: `${isBetter ? "−" : "+"}${Math.abs(diff).toFixed(2)}`,
      unit: "hrs",
      sub: `${pct}% ${isBetter ? "under" : "over"} actual`,
      valueColor: isBetter ? theme.palette.success.main : theme.palette.error.main,
    }] : []),
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {stats.map((s, i) => (
        <Box
          key={i}
          sx={{
            px: 3.5,
            py: 3,
            borderRight: i < stats.length - 1 ? `1px solid ${theme.palette.divider}` : "none",
          }}
        >
          <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
            {s.label}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mb: 0.75 }}>
            <Typography
              sx={{
                fontSize: "2.75rem",
                fontWeight: 300,
                color: s.valueColor || (theme.palette.mode === "dark" ? "text.secondary" : "text.primary"),
                lineHeight: 1,
                letterSpacing: "-2px",
                fontFamily: "'Inter', sans-serif",
                transition: "color 250ms ease",
              }}
            >
              {s.value}
            </Typography>
            <Typography sx={{ fontSize: "1rem", color: "text.secondary", fontWeight: 400 }}>
              {s.unit}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {s.sub}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}