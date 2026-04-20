import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress
} from "@mui/material";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";

interface Props {
  vesselId: string;
  setVesselId: (val: string) => void;

  loaded: string;
  setLoaded: (val: string) => void;

  discharged: string;
  setDischarged: (val: string) => void;

  onAnalyze: () => void;
  loading: boolean;
  data: any;
}

const AnalysisHeader = ({
  vesselId,
  setVesselId,
  loaded,
  setLoaded,
  discharged,
  setDischarged,
  onAnalyze,
  loading,
  data
}: Props) => {

  const hasValidData = data && (data.vessel || data.mode);

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onAnalyze();
    }
  };

  return (
    <Box sx={{ mb: 4, textAlign: "center" }}>
      {/* TITLE */}
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: "#111827" }}>
        Vessel Dashboard
      </Typography>

      <Typography sx={{ color: "#6b7280", mb: 4 }}>
        Analyze vessel performance or simulate stay time using load & discharge inputs.
      </Typography>

      {/* INPUTS */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          maxWidth: 800,
          mx: "auto",
          flexWrap: "wrap",
          justifyContent: "center"
        }}
      >
        <TextField
          placeholder="Vessel ID (optional)"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
          onKeyDown={handleEnter}
          sx={{ bgcolor: "#fff", borderRadius: 1, minWidth: 200 }}
        />

        <TextField
          label="Loaded"
          value={loaded}
          onChange={(e) => setLoaded(e.target.value)}
          onKeyDown={handleEnter}
          sx={{ bgcolor: "#fff", borderRadius: 1, minWidth: 140 }}
        />

        <TextField
          label="Discharged"
          value={discharged}
          onChange={(e) => setDischarged(e.target.value)}
          onKeyDown={handleEnter}
          sx={{ bgcolor: "#fff", borderRadius: 1, minWidth: 140 }}
        />

        <Button
          variant="contained"
          onClick={onAnalyze}
          disableElevation
          sx={{
            bgcolor: "#0f172a",
            textTransform: "none",
            fontWeight: 600,
            px: 4,
            borderRadius: 2,
            minWidth: 120,
            "&:hover": { bgcolor: "#334155" }
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : "Analyze"}
        </Button>
      </Box>

      {/* EMPTY STATE */}
      {!hasValidData && !loading && (
        <Box
          sx={{
            mt: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            color: "#6b7280"
          }}
        >
          <DirectionsBoatIcon sx={{ fontSize: 48, color: "#9ca3af" }} />

          <Typography sx={{ fontSize: "1rem" }}>
            Enter a vessel ID or load/discharge values to begin analysis.
          </Typography>

          <Typography sx={{ fontSize: "0.95rem", color: "#9ca3af" }}>
            • Vessel only → Full analytics  
            • Load/Discharge → Stay time prediction  
            • Both → Optimized prediction
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default AnalysisHeader;