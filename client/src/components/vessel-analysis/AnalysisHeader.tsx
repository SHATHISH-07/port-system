import {
  Box,
  Typography,
  Button,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
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

const inputSx = (width: number | string) => ({
  width,
  "& .MuiOutlinedInput-root": {
    bgcolor: "#35363a",
    borderRadius: 1,
    fontSize: "0.8125rem",
    "& fieldset": { borderColor: "rgba(255,255,255,0.12)" },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.25)" },
    "&.Mui-focused fieldset": { borderColor: "#8ab4f8", borderWidth: "1px" },
    color: "#e8eaed",
  },
});

export default function AnalysisHeader({
  mode = "current",
  vesselId, setVesselId,
  loaded, setLoaded,
  discharged, setDischarged,
  onAnalyze,
  loading, data,
}: Props) {
  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onAnalyze();
  };
  const isCurrent = mode === "current";

  return (
    <Box sx={{ mt: 3, mb: 5, pb: 3, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      {/* Two-column: title left, controls right */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {/* LEFT: Title */}
        <Box sx={{ flex: "0 0 auto" }}>
          <Typography
            sx={{
              fontSize: "1.375rem",
              fontWeight: 600,
              color: "#e8eaed",
              letterSpacing: "-0.4px",
              lineHeight: 1.2,
              mb: 0.75,
            }}
          >
            {isCurrent ? "Current Vessel Analysis" : "Vessel History Analysis"}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "#9aa0a6", maxWidth: 340 }}>
            {isCurrent
              ? "Live operational analysis — berth assignment, yard heatmap, and execution plan."
              : "Historical performance review — visit records, stay times, and berth rankings."
            }
          </Typography>
          {data && (
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, mt: 1.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#81c995" }} />
              <Typography sx={{ fontSize: "0.75rem", color: "#81c995", fontWeight: 500 }}>
                Analysis complete
              </Typography>
            </Box>
          )}
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
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6", mb: 0.5 }}>
              Vessel ID
            </Typography>
            <StyledTextField
              size="small"
              variant="outlined"
              placeholder="e.g. VESSEL_001"
              value={vesselId}
              onChange={(e: any) => setVesselId(e.target.value)}
              onKeyDown={handleEnter}
              sx={inputSx(210)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Typography sx={{ fontSize: "0.625rem", color: "#6b7280", fontFamily: "monospace", fontWeight: 700 }}>
                      ID
                    </Typography>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          {isCurrent && setLoaded && setDischarged && (
            <>
              <Box>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6", mb: 0.5 }}>
                  Loaded
                </Typography>
                <StyledTextField
                  size="small"
                  variant="outlined"
                  placeholder="0"
                  value={loaded || ""}
                  onChange={(e: any) => setLoaded(e.target.value)}
                  type="number"
                  sx={inputSx(100)}
                />
              </Box>
              <Box>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "#9aa0a6", mb: 0.5 }}>
                  Discharged
                </Typography>
                <StyledTextField
                  size="small"
                  variant="outlined"
                  placeholder="0"
                  value={discharged || ""}
                  onChange={(e: any) => setDischarged(e.target.value)}
                  type="number"
                  sx={inputSx(100)}
                />
              </Box>
            </>
          )}

          <Button
            variant="contained"
            onClick={onAnalyze}
            disabled={loading || !vesselId.trim()}
            disableElevation
            sx={{
              height: 38,
              px: 2.5,
              fontWeight: 600,
              fontSize: "0.8125rem",
              bgcolor: "#8ab4f8",
              color: "#0d1117",
              borderRadius: 1,
              textTransform: "none",
              letterSpacing: 0,
              minWidth: 120,
              flexShrink: 0,
              "&:hover": { bgcolor: "#a8c5fb" },
              "&.Mui-disabled": {
                bgcolor: "rgba(138,180,248,0.15)",
                color: "rgba(232,234,237,0.25)",
              },
            }}
          >
            {loading ? <CircularProgress size={13} sx={{ color: "#0d1117" }} /> : "Run Analysis"}
          </Button>
        </Box>
      </Box>

      {/* Empty state */}
      {!data && !loading && (
        <Box
          sx={{
            mt: 3,
            py: 2.5,
            px: 3,
            bgcolor: "#292a2d",
            borderRadius: 1,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Typography sx={{ fontSize: "0.8125rem", color: "#9aa0a6" }}>
            Enter a vessel ID and click{" "}
            <Box component="span" sx={{ color: "#8ab4f8", fontWeight: 600 }}>Run Analysis</Box>{" "}
            to begin.
          </Typography>
        </Box>
      )}
    </Box>
  );
}