import {
  Box, Typography, Button, CircularProgress,
  InputAdornment, TextField, useTheme,
} from "@mui/material";
import { SearchOutlined } from "@mui/icons-material";
import { type VesselAnalysisData } from "../../types/vessel";

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
  data: VesselAnalysisData | null;
}

export default function AnalysisHeader({
  mode = "current",
  vesselId, setVesselId,
  loaded, setLoaded,
  discharged, setDischarged,
  onAnalyze,
  loading, data,
}: Props) {
  const theme = useTheme();
  const isCurrent = mode === "current";

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onAnalyze();
  };

  return (
    <Box
      sx={{
        mb: 4,
        pb: 3,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 3,
          flexWrap: "wrap",
        }}
      >
        {/* LEFT: Title */}
        <Box>
          <Typography variant="h5" sx={{ mb: 0.5, color: "text.primary" }}>
            {isCurrent ? "Current Vessel Analysis" : "Vessel History Analysis"}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 380 }}>
            {isCurrent
              ? "Live operational analysis — berth assignment, yard heatmap, and execution plan."
              : "Historical performance review — visit records, stay times, and berth rankings."
            }
          </Typography>

        </Box>

        {/* RIGHT: Controls */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            alignItems: "flex-end",
            flex: "1 1 auto",
            justifyContent: "flex-end",
          }}
        >
          {/* Vessel ID */}
          <Box>
            <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 600, color: "text.secondary" }}>
              Vessel ID
            </Typography>
            <TextField
              size="small"
              variant="outlined"
              placeholder="e.g. VESSEL_001"
              value={vesselId}
              onChange={(e) => setVesselId(e.target.value)}
              onKeyDown={handleEnter}
              sx={{ width: 220 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined sx={{ fontSize: 16, color: "text.disabled" }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          {isCurrent && setLoaded && setDischarged && (
            <>
              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 600, color: "text.secondary" }}>
                  Loaded
                </Typography>
                <TextField
                  size="small"
                  variant="outlined"
                  placeholder="0"
                  value={loaded || ""}
                  onChange={(e) => setLoaded(e.target.value)}
                  type="number"
                  sx={{ width: 100 }}
                />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 600, color: "text.secondary" }}>
                  Discharged
                </Typography>
                <TextField
                  size="small"
                  variant="outlined"
                  placeholder="0"
                  value={discharged || ""}
                  onChange={(e) => setDischarged(e.target.value)}
                  type="number"
                  sx={{ width: 100 }}
                />
              </Box>
            </>
          )}

          <Button
            variant="contained"
            onClick={onAnalyze}
            disabled={loading || !vesselId.trim()}
            sx={{ height: 40, px: 3, minWidth: 130 }}
          >
            {loading ? <CircularProgress size={14} color="inherit" /> : "Run Analysis"}
          </Button>
        </Box>
      </Box>

      {/* Empty state */}
      {!data && !loading && (
        <Box
          sx={{
            mt: 2.5,
            py: 2,
            px: 3,
            bgcolor: theme.palette.mode === "dark"
              ? "rgba(255,255,255,0.03)"
              : "rgba(0,0,0,0.02)",
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Enter a vessel ID and click{" "}
            <Box component="span" sx={{ color: "primary.main", fontWeight: 600 }}>Run Analysis</Box>{" "}
            to begin.
          </Typography>
        </Box>
      )}
    </Box>
  );
}