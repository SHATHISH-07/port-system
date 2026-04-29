import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Chip,
  InputAdornment,
  Card,
  CardContent,
} from "@mui/material";
import {
  SearchRounded,
  LocalShippingRounded,
  AutoGraphRounded,
  DirectionsBoat,
} from "@mui/icons-material";
import { TextField } from "@mui/material";

const StyledTextField = TextField as any;

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
  data: any;
}

export default function AnalysisHeader({
  mode = "current",
  vesselId, setVesselId,
  loaded, setLoaded,
  discharged, setDischarged,
  onAnalyze,
  loading, data
}: Props) {

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onAnalyze();
  };

  const hasData = data && (data.vessel || data.mode);

  return (
    <Card sx={{ mb: 4, mt: 3 }}>
      <CardContent sx={{ p: 3 }}>

        {/* HEADER */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
          <Box>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "#e8eaed", mb: 0.5, letterSpacing: "-0.2px" }}>
              {mode === "history" ? "Vessel History Analysis" : "Live Vessel Execution"}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "#9aa0a6" }}>
              {mode === "history"
                ? "Query past vessel records to review performance metrics."
                : "Evaluate predictive models and adjust operational parameters."
              }
            </Typography>
          </Box>

          <Chip
            label={data ? "Completed" : "Ready"}
            size="small"
            sx={{
              bgcolor: data ? "rgba(129,201,149,0.1)" : "rgba(138,180,248,0.1)",
              color: data ? "#81c995" : "#8ab4f8",
              border: `1px solid ${data ? "rgba(129,201,149,0.2)" : "rgba(138,180,248,0.2)"}`,
            }}
          />
        </Box>

        {/* INPUTS */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>

          <StyledTextField
            variant="outlined"
            placeholder="Vessel ID"
            value={vesselId}
            onChange={(e: any) => setVesselId(e.target.value)}
            onKeyDown={handleEnter}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded sx={{ fontSize: 16 }} />
                </InputAdornment>
              ),
            }}
          />

          {mode === "current" && setLoaded && setDischarged && (
            <>
              <StyledTextField
                variant="outlined"
                label="Loaded"
                value={loaded || ""}
                onChange={(e: any) => setLoaded(e.target.value)}
                type="number"
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LocalShippingRounded sx={{ fontSize: 14 }} />
                    </InputAdornment>
                  ),
                }}
              />
              <StyledTextField
                variant="outlined"
                label="Discharged"
                value={discharged || ""}
                onChange={(e: any) => setDischarged(e.target.value)}
                type="number"
                size="small"
              />
            </>
          )}

          <Button
            variant="contained"
            onClick={onAnalyze}
            disabled={loading || !vesselId.trim()}
            startIcon={loading ? undefined : <AutoGraphRounded />}
          >
            {loading ? <CircularProgress size={16} /> : "Run Analysis"}
          </Button>
        </Box>

        {!hasData && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <DirectionsBoat sx={{ fontSize: 40, color: "#5f6368" }} />
            <Typography sx={{ color: "#9aa0a6", mt: 1 }}>
              Enter a Vessel ID and click Run Analysis
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}