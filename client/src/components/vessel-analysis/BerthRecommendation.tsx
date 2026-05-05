import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

interface Props { berth?: string; concentration?: string; }

export default function BerthRecommendation({ berth, concentration }: Props) {
  const theme = useTheme();

  const concStyle = (() => {
    const c = concentration;
    if (c === "High")   return { color: theme.palette.error.main };
    if (c === "Medium") return { color: theme.palette.warning.main };
    return { color: theme.palette.success.main };
  })();

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
          Recommended Berth
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          Optimal assignment
        </Typography>
      </Box>

      {/* Body — big berth number */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          px: 3, py: 3,
        }}
      >
        <Typography
          sx={{
            fontSize: "4.5rem",
            fontWeight: 200,
            color: "text.primary",
            lineHeight: 1,
            letterSpacing: "-3px",
            fontFamily: "'Inter', sans-serif",
            mb: 0.5,
          }}
        >
          {berth || "—"}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          Berth assignment
        </Typography>
      </Box>

      {/* Footer — concentration badge */}
      <Box
        sx={{
          px: 3, py: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Cargo concentration
        </Typography>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25, py: 0.4,
            borderRadius: 1,
            bgcolor: alpha(concStyle.color, 0.1),
            border: `1px solid ${alpha(concStyle.color, 0.25)}`,
          }}
        >
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: concStyle.color, flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: concStyle.color }}>
            {concentration ?? "Unknown"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}