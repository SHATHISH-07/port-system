import { Box, Typography } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";

export function RatingChip({ rating }: { rating: string }) {
  const theme = useTheme();
  const map: Record<string, { color: string; label: string }> = {
    Optimal: { color: theme.palette.success.main, label: "OPTIMAL" },
    Satisfactory: { color: theme.palette.warning.main, label: "SATISFACTORY" },
    "Below Target": { color: theme.palette.error.main, label: "BELOW TARGET" },
  };
  const style = map[rating] ?? {
    color: theme.palette.text.secondary,
    label: rating.toUpperCase(),
  };

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.6,
        px: 1,
        py: 0.4,
        borderRadius: "5px",
        bgcolor: alpha(style.color, 0.08),
        border: `1px solid ${alpha(style.color, 0.18)}`,
      }}
    >
      <Box
        sx={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          bgcolor: style.color,
          boxShadow: `0 0 6px ${style.color}`,
        }}
      />
      <Typography
        sx={{
          fontSize: "0.58rem",
          fontWeight: 800,
          color: style.color,
          letterSpacing: "0.12em",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {style.label}
      </Typography>
    </Box>
  );
}

export function TerminalBadge({ id }: { id: string }) {
  const theme = useTheme();
  const isCwit = id.toLowerCase().includes("cwit");
  const isPeb = id.toLowerCase().includes("peb");

  const badgeColor = isCwit
    ? theme.palette.primary.main
    : isPeb
    ? theme.palette.info.main
    : theme.palette.text.primary;

  const badgeBg = isCwit
    ? alpha(theme.palette.primary.main, 0.08)
    : isPeb
    ? alpha(theme.palette.info.main, 0.08)
    : alpha(theme.palette.text.primary, 0.05);

  const badgeBorder = isCwit
    ? alpha(theme.palette.primary.main, 0.25)
    : isPeb
    ? alpha(theme.palette.info.main, 0.25)
    : alpha(theme.palette.text.primary, 0.15);

  return (
    <Box
      sx={{
        display: "inline-flex",
        px: 1.25,
        py: 0.4,
        borderRadius: "5px",
        border: `1px solid ${badgeBorder}`,
        bgcolor: badgeBg,
      }}
    >
      <Typography
        sx={{
          fontSize: "0.62rem",
          fontWeight: 800,
          color: badgeColor,
          letterSpacing: "0.08em",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {id.toUpperCase()}
      </Typography>
    </Box>
  );
}
