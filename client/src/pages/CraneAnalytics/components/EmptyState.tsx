import { Box, Typography } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";

export default function EmptyState() {
  const theme = useTheme();
  return (
    <Box
      sx={{
        height: "55vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 2,
      }}
    >
      {/* Abstract crane icon */}
      <Box sx={{ position: "relative", mb: 2 }}>
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: "16px",
            border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: alpha(theme.palette.background.paper, 0.6),
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke={alpha(theme.palette.text.primary, 0.18)}
            strokeWidth={1.5}
          >
            <path d="M12 2v6M6 8h12M8 8v10M16 8v10M4 18h16" />
          </svg>
        </Box>
        <Box
          sx={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 14,
            height: 14,
            borderRadius: "50%",
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            border: `2px solid ${theme.palette.background.default}`,
          }}
        />
      </Box>
      <Typography
        sx={{
          fontSize: "0.68rem",
          fontWeight: 800,
          color: "text.disabled",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        No Data Selected
      </Typography>
      <Typography
        sx={{
          fontSize: "0.8rem",
          color: "text.disabled",
          maxWidth: 320,
          lineHeight: 1.8,
          fontWeight: 400,
        }}
      >
        Select a crane ID or run analytics to view terminal performance data.
      </Typography>
    </Box>
  );
}
