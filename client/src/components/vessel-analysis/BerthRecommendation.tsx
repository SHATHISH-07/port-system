import { Box, Typography } from "@mui/material";

interface Props { berth?: string; concentration?: string; }

const concColor = (c?: string) => {
  if (c === "High") return { color: "#f28b82", bg: "rgba(242,139,130,0.1)", border: "rgba(242,139,130,0.22)" };
  if (c === "Medium") return { color: "#fdd663", bg: "rgba(253,214,99,0.1)", border: "rgba(253,214,99,0.22)" };
  return { color: "#81c995", bg: "rgba(129,201,149,0.1)", border: "rgba(129,201,149,0.22)" };
};

export default function BerthRecommendation({ berth, concentration }: Props) {
  const s = concColor(concentration);

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
      {/* Header strip — same as ExecutionPlan / RiskAndStrategy */}
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
          Recommended Berth
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "#5f6368" }}>
          Optimal assignment
        </Typography>
      </Box>

      {/* Body — centred berth name so it looks good tall or short */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          px: 3,
          py: 3,
        }}
      >
        <Typography
          sx={{
            fontSize: "5rem",
            fontWeight: 200,
            color: "#e8eaed",
            lineHeight: 1,
            letterSpacing: "-3px",
            fontFamily: "'Inter', 'Roboto', sans-serif",
            mb: 0.75,
          }}
        >
          {berth || "—"}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "#5f6368" }}>
          Berth assignment
        </Typography>
      </Box>

      {/* Footer — concentration strip */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6" }}>
          Cargo concentration
        </Typography>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            py: 0.4,
            borderRadius: 0.75,
            bgcolor: s.bg,
            border: `1px solid ${s.border}`,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: s.color,
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: s.color }}>
            {concentration ?? "Unknown"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}