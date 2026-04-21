import { Box, Typography, TextField, Button, CircularProgress, Chip, InputAdornment } from "@mui/material";
import { SearchRounded, DirectionsBoat, AutoGraphRounded, LocalShippingRounded } from "@mui/icons-material";

interface Props {
  vesselId: string;  setVesselId: (v: string) => void;
  loaded: string;    setLoaded:   (v: string) => void;
  discharged: string; setDischarged: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  data: any;
}

const HINTS = [
  { label: "Vessel ID → full analytics",          color: "#8ab4f8",  bg: "rgba(138,180,248,0.1)", border: "rgba(138,180,248,0.2)" },
  { label: "Load / Discharge → stay prediction",  color: "#d7aefb",  bg: "rgba(215,174,251,0.1)", border: "rgba(215,174,251,0.2)" },
  { label: "Both → optimized prediction",         color: "#81c995",  bg: "rgba(129,201,149,0.1)", border: "rgba(129,201,149,0.2)" },
];

export default function AnalysisHeader({
  vesselId, setVesselId, loaded, setLoaded,
  discharged, setDischarged, onAnalyze, loading, data,
}: Props) {
  const hasData = data && (data.vessel || data.mode);
  const handleEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") onAnalyze(); };

  return (
    <Box>
      {/* ── QUERY CARD ─────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: "#292a2d",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          p: 3,
          mb: hasData ? 3 : 0,
          boxShadow: "0 1px 2px rgba(0,0,0,.3), 0 2px 6px rgba(0,0,0,.15)",
        }}
      >
        {/* Section label */}
        <Typography
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 500,
            color: "#9aa0a6",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            mb: 2,
          }}
        >
          Query parameters
        </Typography>

        {/* Inputs row */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-end" }}>
          <TextField
            placeholder="Vessel ID (e.g. AA7)"
            value={vesselId}
            onChange={e => setVesselId(e.target.value)}
            onKeyDown={handleEnter}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded sx={{ fontSize: 16, color: "#5f6368" }} />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 220, "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
          />
          <TextField
            label="Loaded"
            placeholder="0"
            value={loaded}
            onChange={e => setLoaded(e.target.value)}
            onKeyDown={handleEnter}
            size="small"
            type="number"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LocalShippingRounded sx={{ fontSize: 14, color: "#5f6368" }} />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
          />
          <TextField
            label="Discharged"
            placeholder="0"
            value={discharged}
            onChange={e => setDischarged(e.target.value)}
            onKeyDown={handleEnter}
            size="small"
            type="number"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LocalShippingRounded sx={{ fontSize: 14, color: "#5f6368" }} />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
          />

          <Button
            variant="contained"
            onClick={onAnalyze}
            disabled={loading}
            startIcon={loading ? undefined : <AutoGraphRounded sx={{ fontSize: 16 }} />}
            sx={{ height: 37, px: 3, borderRadius: 1, minWidth: 140 }}
          >
            {loading ? <CircularProgress size={16} color="inherit" /> : "Run Analysis"}
          </Button>
        </Box>

        {/* Hint chips */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
          {HINTS.map(h => (
            <Chip
              key={h.label}
              label={h.label}
              size="small"
              sx={{ bgcolor: h.bg, color: h.color, border: `1px solid ${h.border}`, fontSize: "0.6875rem" }}
            />
          ))}
        </Box>
      </Box>

      {/* ── EMPTY STATE ─────────────────────────────────────── */}
      {!hasData && !loading && (
        <Box
          sx={{
            mt: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            py: 10,
            borderRadius: 2,
            border: "1px dashed rgba(255,255,255,0.1)",
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "#292a2d",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DirectionsBoat sx={{ fontSize: 30, color: "#5f6368" }} />
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 500, color: "#9aa0a6", mb: 0.5 }}>
              No vessel data loaded
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "#5f6368" }}>
              Enter a Vessel ID or load/discharge values above to begin
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}