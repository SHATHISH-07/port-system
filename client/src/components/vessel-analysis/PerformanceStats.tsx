import { Box, Typography } from "@mui/material";

// Props for the PerformanceStats component
interface Props {
  actual: number;
  predicted: number;
  mode: string;
  loaded?: number | string;
  discharged?: number | string;
}

// TSX component to display the performance stats for vessels
export default function PerformanceStats({ actual, predicted, mode, loaded, discharged }: Props) {
  const isOverride = mode === "override";
  const diff = predicted - actual;
  const pct = actual !== 0 ? Math.abs((diff / actual) * 100).toFixed(1) : "—";
  const isBetter = diff <= 0;

  // Stats for the performance stats component
  const stats = [
    {
      label: "Historical Average",
      value: actual.toFixed(1),
      unit: "hrs",
      sub: "Avg vessel stay time",
      valueColor: "#e8eaed",
      subColor: "#9aa0a6",
    },
    {
      label: isOverride
        ? `Predicted · ${loaded ?? 0} loaded / ${discharged ?? 0} discharged`
        : "ML Prediction",
      value: predicted.toFixed(1),
      unit: "hrs",
      sub: "Predicted stay time",
      valueColor: "#8ab4f8",
      subColor: "#9aa0a6",
    },
    {
      label: "Variance",
      value: `${isBetter ? "−" : "+"}${Math.abs(diff).toFixed(2)}`,
      unit: "hrs",
      sub: `${pct}% ${isBetter ? "under" : "over"} actual`,
      valueColor: isBetter ? "#81c995" : "#f28b82",
      subColor: isBetter ? "rgba(129,201,149,0.7)" : "rgba(242,139,130,0.7)",
    },
  ];

  // Main component to display the performance stats for vessels
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        bgcolor: "#292a2d",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      {stats.map((s, i) => (
        <Box
          key={i}
          sx={{
            px: 3.5,
            py: 3,
            borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.6875rem",
              fontWeight: 500,
              color: "#9aa0a6",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              mb: 1.5,
            }}
          >
            {s.label}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.75 }}>
            <Typography
              sx={{
                fontSize: "3rem",
                fontWeight: 300,
                color: s.valueColor,
                lineHeight: 1,
                letterSpacing: "-2px",
                fontFamily: "'Inter', 'Roboto', sans-serif",
              }}
            >
              {s.value}
            </Typography>
            <Typography sx={{ fontSize: "1rem", color: "#5f6368", fontWeight: 400 }}>
              {s.unit}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: s.subColor }}>
            {s.sub}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}