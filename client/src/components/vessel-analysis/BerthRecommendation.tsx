import { Card, CardContent, Typography, Box, Divider } from "@mui/material";
import { AnchorRounded, FiberManualRecord } from "@mui/icons-material";

interface Props { berth?: string; concentration?: string; }

const concStyle = (c?: string) => {
  if (c === "High") return { color: "#f28b82", bg: "rgba(242,139,130,0.10)", border: "rgba(242,139,130,0.22)" };
  if (c === "Medium") return { color: "#fdd663", bg: "rgba(253,214,99,0.10)", border: "rgba(253,214,99,0.22)" };
  return { color: "#81c995", bg: "rgba(129,201,149,0.10)", border: "rgba(129,201,149,0.22)" };
};

export default function BerthRecommendation({ berth, concentration }: Props) {
  const s = concStyle(concentration);

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
          <AnchorRounded sx={{ fontSize: 15, color: "#9aa0a6" }} />
          <Typography
            sx={{
              fontSize: "0.6875rem",
              fontWeight: 500,
              color: "#9aa0a6",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Recommended Berth
          </Typography>
        </Box>
        <Box sx={{ px: 2.5, py: 2.5 }}>

          <Typography
            sx={{
              fontSize: 40,
              fontWeight: 300,
              color: "#e8eaed",
              lineHeight: 1,
              letterSpacing: "-1px",
              fontFamily: "'Google Sans', Roboto, sans-serif",
              mb: 0.5,
            }}
          >
            {berth || "N / A"}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "#5f6368", mb: 2.5 }}>
            Optimal berth assignment
          </Typography>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.07)", mb: 2 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              bgcolor: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 1.5,
              px: 1.5,
              py: 1,
            }}
          >
            <FiberManualRecord sx={{ fontSize: 8, color: s.color, flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontSize: "0.6875rem", color: "#9aa0a6", lineHeight: 1.2 }}>
                Cargo concentration
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: s.color }}>
                {concentration ?? "Unknown"}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}