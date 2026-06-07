import { Box, Typography, Button, useTheme } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();
  const theme = useTheme();
  
  // Enforce strictly white text in dark mode and black text in light mode
  const textColor = theme.palette.mode === "dark" ? "#ffffff" : "#000000";
  // Custom border color: faint smoke white in dark mode, faint dark gray in light mode
  const customBorderColor = theme.palette.mode === "dark" ? "rgba(245, 245, 245, 0.2)" : "rgba(102, 102, 102, 0.3)";

  return (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        justifyContent: "space-between",
        alignItems: "center",
        pt: 1,
        mb: 2,
        px: { xs: 2.5, md: 4 }, // Matches the padding used in StayTimeAnalysis header exactly
        bgcolor: "transparent",
        boxShadow: "none",
        borderBottom: "1px solid",
        borderColor: customBorderColor,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Typography
        sx={{
          fontWeight: "bold",
          color: textColor,
          fontSize: "20px",
        }}
      >
        Deck Optimizer
      </Typography>

      <Box sx={{ display: "flex", gap: 1.5 }}>
        <Button
          variant="text"
          onClick={() => navigate("/ingest")}
          sx={{
            color: textColor,
            fontWeight: 600,
            fontSize: { md: "1.05rem", lg: "1.1rem" },
            textTransform: "none",
            px: 2,
            "&:hover": {
              bgcolor: "transparent",
              opacity: 0.7,
            }
          }}
        >
          Upload
        </Button>
        <Button
          variant="text"
          onClick={() => navigate("/train-model")}
          sx={{
            color: textColor,
            fontWeight: 600,
            fontSize: { md: "1.05rem", lg: "1.1rem" },
            textTransform: "none",
            px: 2,
            "&:hover": {
              bgcolor: "transparent",
              opacity: 0.7,
            }
          }}
        >
          Retrain
        </Button>
      </Box>
    </Box>
  );
}
