import { Card, CardContent, Typography, Box } from "@mui/material";

interface Props { steps: string[]; }

export default function ExecutionPlan({ steps }: Props) {
  const safeSteps = steps || [];

  return (
    <Card>
      <CardContent sx={{ p: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2.5,
            py: 2,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.6875rem",
              fontWeight: 500,
              color: "#9aa0a6",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              flex: 1,
            }}
          >
            Execution Plan
          </Typography>
          <Box
            sx={{
              height: 20,
              minWidth: 20,
              borderRadius: 10,
              bgcolor: "rgba(138,180,248,0.12)",
              border: "1px solid rgba(138,180,248,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              px: 0.75,
            }}
          >
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8ab4f8" }}>
              {safeSteps.length}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ px: 2.5, py: 2 }}>
          {safeSteps.map((step, i) => (
            <Box
              key={i}
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "flex-start",
                position: "relative",
                pb: i < safeSteps.length - 1 ? 2 : 0,
              }}
            >
              {i < safeSteps.length - 1 && (
                <Box
                  sx={{
                    position: "absolute",
                    left: 11,
                    top: 22,
                    width: 1,
                    bottom: 0,
                    bgcolor: "rgba(255,255,255,0.07)",
                  }}
                />
              )}

              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1,
                  bgcolor: i === 0 ? "rgba(138,180,248,0.14)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${i === 0 ? "rgba(138,180,248,0.28)" : "rgba(255,255,255,0.09)"}`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: i === 0 ? "#8ab4f8" : "#9aa0a6",
                    lineHeight: 1,
                  }}
                >
                  {i + 1}
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: "0.8125rem",
                  color: "#e8eaed",
                  lineHeight: 1.6,
                  pt: "3px",
                }}
              >
                {step}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}