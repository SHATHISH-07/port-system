import { Box, Typography } from "@mui/material";
import { SearchOutlined, AnalyticsOutlined } from "@mui/icons-material";

interface Props {
  mode: "history" | "current";
}

export default function OperationalPlaceholder({ mode }: Props) {
  const isCurrent = mode === "current";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        textAlign: "center",
        py: 12,
      }}
    >
      <Box sx={{ color: "text.disabled", mb: 2, opacity: 0.5 }}>
        {isCurrent ? <AnalyticsOutlined sx={{ fontSize: 48 }} /> : <SearchOutlined sx={{ fontSize: 48 }} />}
      </Box>

      <Typography variant="h5" sx={{ fontWeight: 800, color: "text.primary", mb: 1, letterSpacing: "-0.5px" }}>
        {isCurrent ? "Ready for Analysis" : "Historical Archive"}
      </Typography>

      <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 450, mb: 0 }}>
        {isCurrent
          ? "Input a Vessel ID to generate performance insights."
          : "Search for a past visit to retrieve historical data."}
      </Typography>
    </Box>
  );
}
