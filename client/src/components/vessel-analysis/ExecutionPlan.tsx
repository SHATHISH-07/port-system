import { Box, Typography } from "@mui/material";

interface Props { steps: string[]; }

export default function ExecutionPlan({ steps }: Props) {
  const safeSteps = steps || [];

  return (
    <Box
      sx={{
        bgcolor: "#292a2d",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 1.5,
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header strip */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 500,
            color: "#9aa0a6",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Execution Plan
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "#5f6368", fontFamily: "monospace" }}>
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
              gap: 0,
              borderBottom: i < safeSteps.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
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
                pt: 2,
                borderRight: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.625rem",
                  fontWeight: 700,
                  color: i === 0 ? "#8ab4f8" : "#3c4043",
                  fontFamily: "monospace",
                  letterSpacing: "0.05em",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </Typography>
            </Box>

            {/* Step text */}
            <Box sx={{ px: 2, py: 1.75, flex: 1 }}>
              <Typography
                sx={{
                  fontSize: "0.8125rem",
                  color: i === 0 ? "#e8eaed" : "#bdc1c6",
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