import { Box, Typography, useTheme } from "@mui/material";
import type { OperationalPredictions, VesselAnalysisData } from "../../types/vessel";

interface Props { 
  risks?: string[]; 
  predictions?: OperationalPredictions;
  delays?: VesselAnalysisData["delay_analysis"];
}

const SEVERITY = [
  { label: "HIGH", colorKey: "error"   as const },
  { label: "MED",  colorKey: "warning" as const },
  { label: "LOW",  colorKey: "info"    as const },
];

export default function RiskAndStrategy({ risks, predictions, delays }: Props) {
  const theme = useTheme();
  const safeRisks = risks || [];
  const items = [...safeRisks];
  if (predictions) {
    items.push(`Conflict Risk: ${predictions.conflict_risk}`);
    items.push(`ITV Impact: ${predictions.itv_impact.itv_cycle_impact}`);
  }
  if (delays) {
    delays.forEach(d => items.push(`${d.factor}: ${d.reason}`));
  }

  const hasRisks = items.length > 0;

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3, py: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="overline" sx={{ color: "text.secondary" }}>
          Operational Risks
        </Typography>
        {hasRisks && (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontWeight: 700,
            }}
          >
            {items.length} factors
          </Typography>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1 }}>
        {hasRisks ? (
          items.map((item, i) => {
            const sev = SEVERITY[Math.min(i, SEVERITY.length - 1)];
            const color = theme.palette[sev.colorKey].main;
            return (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  borderBottom: i < items.length - 1
                    ? `1px solid ${theme.palette.divider}`
                    : "none",
                }}
              >
                {/* Severity gutter */}
                <Box
                  sx={{
                    width: 44,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    pt: 2.25,
                    borderRight: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.5rem",
                      fontWeight: 700,
                      color,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontFamily: "monospace",
                    }}
                  >
                    {sev.label}
                  </Typography>
                </Box>

                {/* Risk text */}
                <Box sx={{ px: 2, py: 2, flex: 1 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.6 }}>
                    {item}
                  </Typography>
                </Box>
              </Box>
            );
          })
        ) : (
          <Box sx={{ px: 3, py: 3, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 7, height: 7, borderRadius: "50%",
                bgcolor: theme.palette.success.main, flexShrink: 0,
              }}
            />
            <Typography variant="body2" sx={{ color: theme.palette.success.main }}>
              No operational risks identified
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}