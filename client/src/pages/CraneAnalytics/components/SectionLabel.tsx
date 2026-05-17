import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

interface SectionLabelProps {
  label: string;
  count?: number;
}

export default function SectionLabel({ label, count }: SectionLabelProps) {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
      <Box
        sx={{
          width: 2,
          height: 16,
          borderRadius: 4,
          background: `linear-gradient(180deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          fontSize: "0.65rem",
          fontWeight: 800,
          letterSpacing: "0.18em",
          color: "text.disabled",
          textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {label}
      </Typography>
      {count !== undefined && (
        <Box
          sx={{
            ml: 0.5,
            px: 1,
            py: 0.2,
            borderRadius: "4px",
            bgcolor: `${theme.palette.primary.main}14`,
            border: `1px solid ${theme.palette.primary.main}22`,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.6rem",
              fontWeight: 800,
              color: theme.palette.primary.main,
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.05em",
            }}
          >
            {count}
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          flex: 1,
          height: "1px",
          background: `linear-gradient(90deg, ${theme.palette.divider}, transparent)`,
        }}
      />
    </Box>
  );
}
