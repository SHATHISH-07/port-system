import { Card, CardContent, Typography, Box } from "@mui/material";
import { WarningAmberRounded, CheckCircleOutlineRounded } from "@mui/icons-material";

interface Props { risks: string[]; }

export default function RiskEvaluation({ risks }: Props) {
  const hasRisks = risks.length > 0;

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
          <WarningAmberRounded sx={{ fontSize: 15, color: hasRisks ? "#fdd663" : "#81c995" }} />
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
            Operational Risks
          </Typography>
          {hasRisks && (
            <Box
              sx={{
                height: 20,
                minWidth: 20,
                borderRadius: 10,
                bgcolor: "rgba(242,139,130,0.12)",
                border: "1px solid rgba(242,139,130,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: 0.75,
              }}
            >
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "#f28b82" }}>
                {risks.length}
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ px: 2.5, py: 2, display: "flex", flexDirection: "column", gap: 1 }}>
          {hasRisks ? (
            risks.map((risk, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  alignItems: "flex-start",
                  p: "10px 12px",
                  bgcolor: "rgba(253,214,99,0.04)",
                  border: "1px solid rgba(253,214,99,0.12)",
                  borderLeft: "3px solid #fdd663",
                  borderRadius: 1,
                  transition: "background-color 150ms",
                  "&:hover": { bgcolor: "rgba(253,214,99,0.08)" },
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "#fdd663",
                    lineHeight: "1.6rem",
                    flexShrink: 0,
                    minWidth: 14,
                  }}
                >
                  {i + 1}
                </Typography>
                <Typography sx={{ color: "#e8eaed", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                  {risk}
                </Typography>
              </Box>
            ))
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: "10px 12px",
                bgcolor: "rgba(129,201,149,0.06)",
                border: "1px solid rgba(129,201,149,0.18)",
                borderLeft: "3px solid #81c995",
                borderRadius: 1,
              }}
            >
              <CheckCircleOutlineRounded sx={{ fontSize: 16, color: "#81c995", flexShrink: 0 }} />
              <Typography sx={{ color: "#81c995", fontSize: "0.8125rem" }}>
                No significant operational risks identified
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}