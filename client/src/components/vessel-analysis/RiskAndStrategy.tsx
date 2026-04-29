import { Box, Typography } from "@mui/material";

interface Props { risks: string[]; }

const severityOf = (i: number, total: number) => {
  if (total === 0) return null;
  if (i === 0) return { label: "HIGH", color: "#f28b82" };
  if (i === 1) return { label: "MED", color: "#fdd663" };
  return { label: "LOW", color: "#9aa0a6" };
};

export default function RiskAndStrategy({ risks }: Props) {
  const safeRisks = risks || [];
  const hasRisks = safeRisks.length > 0;

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
          Operational Risks
        </Typography>
        {hasRisks && (
          <Typography sx={{ fontSize: "0.6875rem", color: "#f28b82", fontFamily: "monospace", fontWeight: 700 }}>
            {safeRisks.length} flagged
          </Typography>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1 }}>
        {hasRisks ? (
          safeRisks.map((risk, i) => {
            const sev = severityOf(i, safeRisks.length)!;
            return (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  gap: 0,
                  borderBottom: i < safeRisks.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
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
                    pt: 2,
                    borderRight: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.5rem",
                      fontWeight: 700,
                      color: sev.color,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontFamily: "monospace",
                    }}
                  >
                    {sev.label}
                  </Typography>
                </Box>

                {/* Risk text */}
                <Box sx={{ px: 2, py: 1.75, flex: 1 }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "#bdc1c6", lineHeight: 1.6 }}>
                    {risk}
                  </Typography>
                </Box>
              </Box>
            );
          })
        ) : (
          <Box sx={{ px: 3, py: 3, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#81c995", flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.8125rem", color: "#81c995" }}>
              No operational risks identified
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}