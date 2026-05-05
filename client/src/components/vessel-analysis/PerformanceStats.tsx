import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

interface Props {
  actual: number;
  predicted: number;
  mode: string;
  loaded?: number | string;
  discharged?: number | string;
}

export default function PerformanceStats({ actual, predicted, mode, loaded, discharged }: Props) {
  const theme = useTheme();
  const isOverride = mode === "override" || mode === "current-override";
  const diff = predicted - actual;
  const pct = actual !== 0 ? Math.abs((diff / actual) * 100).toFixed(1) : "—";
  const isBetter = diff <= 0;

  const stats = [
    {
      label: "Historical Average",
      value: actual.toFixed(1),
      unit: "hrs",
      sub: "Avg vessel stay time",
      valueColor: theme.palette.text.primary,
    },
    {
      label: isOverride
        ? `Predicted · ${loaded ?? 0} loaded / ${discharged ?? 0} discharged`
        : "ML Prediction",
      value: predicted.toFixed(1),
      unit: "hrs",
      sub: "Predicted stay time",
      valueColor: theme.palette.primary.main,
    },
    {
      label: "Variance",
      value: `${isBetter ? "−" : "+"}${Math.abs(diff).toFixed(2)}`,
      unit: "hrs",
      sub: `${pct}% ${isBetter ? "under" : "over"} actual`,
      valueColor: isBetter ? theme.palette.success.main : theme.palette.error.main,
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
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
            borderRight: i < 2 ? `1px solid ${theme.palette.divider}` : "none",
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
                color: s.valueColor,
                lineHeight: 1,
                letterSpacing: "-2px",
                fontFamily: "'Inter', sans-serif",
                transition: "color 250ms ease",
              }}
            >
              {s.value}
            </Typography>
            <Typography sx={{ fontSize: "1rem", color: "text.disabled", fontWeight: 400 }}>
              {s.unit}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: alpha(s.valueColor, 0.7) }}>
            {s.sub}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}