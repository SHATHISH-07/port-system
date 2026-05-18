import { Box, Typography } from "@mui/material";

interface SectionLabelProps {
  label: string;
  count?: number;
}

export default function SectionLabel({ label, count }: SectionLabelProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
      <Typography
        sx={{
          fontSize: "0.725rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "text.secondary",
          textTransform: "uppercase",
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
            bgcolor: "action.selected",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.65rem",
              fontWeight: 800,
              color: "text.primary",
              letterSpacing: "0.02em",
            }}
          >
            {count}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
