import {
  Box,
  Typography,
  TextField,
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
  DirectionsBoat
} from "@mui/icons-material";
import { useState } from "react";

const StyledTextField = TextField as any;

interface Props {
  mode?: "history" | "current";
  vesselId: string; setVesselId: (v: string) => void;
  loaded?: string; setLoaded?: (v: string) => void;
  discharged?: string; setDischarged?: (v: string) => void;

  onAnalyze: () => void;
  onUpload: (file: File) => void;

  loading: boolean;
  uploaded: boolean;
  data: any;
}

export default function AnalysisHeader({
  mode = "current",
  vesselId, setVesselId,
  loaded, setLoaded,
  discharged, setDischarged,
  onAnalyze, onUpload,
  loading, uploaded, data
}: Props) {

  const [fileName, setFileName] = useState<string | null>(null);

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onAnalyze();
  };

  const hasData = data && (data.vessel || data.mode);

  return (
    <Card sx={{ mb: 4, mt: 3 }}>
      <CardContent sx={{ p: 3 }}>

        {/* 🔥 HEADER & BADGES */}
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
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button
              component="label"
              variant="outlined"
              size="small"
              sx={{
                color: "#e8eaed",
                borderColor: "rgba(255,255,255,0.12)",
                textTransform: "none",
                "&:hover": { borderColor: "rgba(255,255,255,0.22)", bgcolor: "rgba(255,255,255,0.04)" }
              }}
            >
              {uploaded ? (fileName || "Dataset Ready") : "Choose CSV"}
              <input type="file" hidden accept=".csv" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFileName(f.name);
                  onUpload(f);
                }
              }} />
            </Button>

            <Chip
              label={uploaded ? "Dataset Ready" : "Not Uploaded"}
              size="small"
              sx={{
                bgcolor: uploaded ? "rgba(129,201,149,0.1)" : "rgba(242,139,130,0.1)",
                color: uploaded ? "#81c995" : "#f28b82",
                border: `1px solid ${uploaded ? "rgba(129,201,149,0.2)" : "rgba(242,139,130,0.2)"}`
              }}
            />
          </Box>
        </Box>

          {/* 🔥 INPUTS */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>

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
              disabled={loading || !uploaded}
              startIcon={loading ? undefined : <AutoGraphRounded />}
            >
              {loading ? <CircularProgress size={16} /> : "Run Analysis"}
            </Button>
          </Box>

        {!hasData && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <DirectionsBoat sx={{ fontSize: 40, color: "#5f6368" }} />
            <Typography sx={{ color: "#9aa0a6" }}>
              Upload dataset and run analysis
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}