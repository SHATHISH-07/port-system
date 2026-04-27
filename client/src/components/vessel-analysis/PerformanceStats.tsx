import { Card, CardContent, Typography, Box, Divider, Chip } from "@mui/material";
import { AccessTimeRounded, TrendingUpRounded, TrendingDownRounded } from "@mui/icons-material";

interface Props {
  actual: number;
  predicted: number;
  mode: string;
  loaded?: number | string;
  discharged?: number | string;
}

export default function PerformanceStats({ actual, predicted, mode, loaded, discharged }: Props) {
  const isOverride = mode === "override";
  const diff = predicted - actual;
  const pct = actual !== 0 ? Math.abs(diff / actual * 100).toFixed(1) : "—";
  const positive = diff <= 0;

  const METRIC = [
    {
      label: "Historical avg",
      value: actual.toFixed(1),
      unit: "hrs",
      sub: "Average vessel stay",
      color: "#e8eaed",
      dimColor: "#9aa0a6",
    },
    {
      label: isOverride ? `Predicted · ${loaded ?? 0} load / ${discharged ?? 0} disc` : "ML prediction",
      value: predicted.toFixed(1),
      unit: "hrs",
      sub: "Predicted stay time",
      color: "#8ab4f8",
      dimColor: "rgba(138,180,248,0.7)",
    },
  ];

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AccessTimeRounded sx={{ fontSize: 16, color: "#9aa0a6" }} />
            <Typography
              sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6", letterSpacing: "0.1em", textTransform: "uppercase" }}
            >
              Performance Metrics
            </Typography>
          </Box>
          {isOverride && (
            <Chip
              label="Override mode"
              size="small"
              sx={{ bgcolor: "rgba(215,174,251,0.12)", color: "#d7aefb", border: "1px solid rgba(215,174,251,0.22)", fontSize: "0.6875rem" }}
            />
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 0, alignItems: "stretch" }}>
          {METRIC.map((m, i) => (
            <Box key={i} sx={{ flex: 1, pr: i === 0 ? 3 : 0, pl: i === 1 ? 3 : 0 }}>
              <Typography sx={{ fontSize: "0.6875rem", color: m.dimColor, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.75 }}>
                {m.label}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                <Typography sx={{ fontSize: 44, fontWeight: 300, color: m.color, lineHeight: 1, letterSpacing: "-1.5px", fontFamily: "'Google Sans', Roboto, sans-serif" }}>
                  {m.value}
                </Typography>
                <Typography sx={{ fontSize: 18, color: m.dimColor, fontWeight: 300 }}>hrs</Typography>
              </Box>
              <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6", mt: 0.5 }}>{m.sub}</Typography>
            </Box>
          ))}

          <Divider orientation="vertical" flexItem sx={{ mx: 0, borderColor: "rgba(255,255,255,0.08)" }} />

          <Box sx={{ pl: 3, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 120 }}>
            <Typography sx={{ fontSize: "0.6875rem", color: "#9aa0a6", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", mb: 0.75 }}>
              Delta
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {positive
                ? <TrendingDownRounded sx={{ fontSize: 18, color: "#81c995" }} />
                : <TrendingUpRounded sx={{ fontSize: 18, color: "#f28b82" }} />
              }
              <Typography sx={{ fontSize: 28, fontWeight: 300, color: positive ? "#81c995" : "#f28b82", lineHeight: 1, letterSpacing: "-0.5px", fontFamily: "'Google Sans', Roboto, sans-serif" }}>
                {Math.abs(diff).toFixed(2)}
              </Typography>
              <Typography sx={{ fontSize: 14, color: positive ? "#81c995" : "#f28b82", fontWeight: 300 }}>hrs</Typography>
            </Box>
            <Box
              sx={{
                mt: 0.75,
                display: "inline-flex",
                alignItems: "center",
                bgcolor: positive ? "rgba(129,201,149,0.1)" : "rgba(242,139,130,0.1)",
                border: `1px solid ${positive ? "rgba(129,201,149,0.22)" : "rgba(242,139,130,0.22)"}`,
                borderRadius: 20,
                px: 1,
                py: 0.25,
              }}
            >
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: positive ? "#81c995" : "#f28b82" }}>
                {positive ? "−" : "+"}{pct}% vs actual
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}