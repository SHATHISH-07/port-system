import {
  Box, Typography, Button, CircularProgress,
  InputAdornment, TextField, useTheme,
} from "@mui/material";
import { SearchOutlined } from "@mui/icons-material";

interface Props {
  mode?: "history" | "current";
  vesselId: string;
  setVesselId: (v: string) => void;
  loaded?: string;
  setLoaded?: (v: string) => void;
  discharged?: string;
  setDischarged?: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}

export default function AnalysisHeader({
  mode = "current",
  vesselId, setVesselId,
  loaded, setLoaded,
  discharged, setDischarged,
  onAnalyze,
  loading,
}: Props) {
  const theme = useTheme();
  const isCurrent = mode === "current";

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onAnalyze();
  };

  return (
    <Box
      sx={{
        mb: 6,
        pb: 3,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* ── Title Section ── */}
      <Box sx={{ mb: 4 }}>
        <Typography
          sx={{
            fontWeight: 900,
            letterSpacing: "-2px",
            color: "text.primary",
            mb: 1,
            fontSize: "40px"
          }}
        >
          {isCurrent ? "Current Vessel Analysis" : "Historical Berth Analytics"}
        </Typography>
        <Typography variant="h6" sx={{ color: "text.secondary", fontWeight: 400, maxWidth: 800 }}>
          {isCurrent
            ? "Live operational intelligence — berth assignment, yard heatmap, and execution planning."
            : "Retrospective performance review — visit records, stay times, and berth rankings."
          }
        </Typography>
      </Box>

      {/* ── Minimal Search Controls ── */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
          mt: 2,
        }}
      >
        {/* Vessel Search Group */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <TextField
            size="small"
            variant="standard"
            placeholder="Search Vessel ID..."
            value={vesselId}
            onChange={(e) => setVesselId(e.target.value)}
            onKeyDown={handleEnter}
            sx={{ width: 300, "& .MuiInput-root": { fontSize: "1.1rem", fontWeight: 600 } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined sx={{ color: "primary.main" }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {isCurrent && setLoaded && setDischarged && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 3, pl: 3, borderLeft: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: "text.disabled", textTransform: "uppercase" }}>Load</Typography>
              <TextField
                size="small"
                variant="standard"
                type="number"
                placeholder="Auto"
                value={loaded}
                onChange={(e) => setLoaded(e.target.value)}
                sx={{ width: 80, "& .MuiInput-root": { fontWeight: 700 } }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: "text.disabled", textTransform: "uppercase" }}>Disc</Typography>
              <TextField
                size="small"
                variant="standard"
                type="number"
                placeholder="Auto"
                value={discharged}
                onChange={(e) => setDischarged(e.target.value)}
                sx={{ width: 80, "& .MuiInput-root": { fontWeight: 700 } }}
              />
            </Box>
          </Box>
        )}

        <Button
          variant="text"
          onClick={onAnalyze}
          disabled={loading || !vesselId}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.875rem",
            color: "primary.main",
            ml: "auto",
            "&:hover": { bgcolor: "action.hover" }
          }}
        >
          {loading ? "Processing..." : "Run Analysis"}
        </Button>
      </Box>

    </Box>
  );
}