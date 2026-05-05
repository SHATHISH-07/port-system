import { Box, Typography, useTheme } from "@mui/material";

interface Props { steps: string[]; }

export default function ExecutionPlan({ steps }: Props) {
  const theme = useTheme();
  const safeSteps = steps || [];

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
          Execution Plan
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
          {safeSteps.length} steps
        </Typography>
      </Box>

      {/* Steps */}
      <Box sx={{ flex: 1 }}>
        {safeSteps.map((step, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              borderBottom: i < safeSteps.length - 1
                ? `1px solid ${theme.palette.divider}`
                : "none",
            }}
          >
            {/* Number gutter */}
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
                  fontSize: "0.625rem",
                  fontWeight: 700,
                  color: i === 0 ? theme.palette.primary.main : "text.disabled",
                  fontFamily: "monospace",
                  letterSpacing: "0.05em",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </Typography>
            </Box>

            {/* Step text */}
            <Box sx={{ px: 2, py: 2, flex: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  color: i === 0 ? "text.primary" : "text.secondary",
                  lineHeight: 1.6,
                  fontWeight: i === 0 ? 500 : 400,
                }}
              >
                {step}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}