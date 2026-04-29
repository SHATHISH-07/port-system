import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Chip,
  InputAdornment
} from "@mui/material";
import {
  SearchRounded,
  DirectionsBoat,
  AutoGraphRounded,
  LocalShippingRounded,
  UploadFileRounded
} from "@mui/icons-material";
import { useState } from "react";

interface Props {
  vesselId: string; setVesselId: (v: string) => void;
  loaded: string; setLoaded: (v: string) => void;
  discharged: string; setDischarged: (v: string) => void;

  onAnalyze: () => void;
  onUpload: (file: File) => void;

  loading: boolean;
  uploaded: boolean;
  data: any;
}

export default function AnalysisHeader({
  vesselId, setVesselId,
  loaded, setLoaded,
  discharged, setDischarged,
  onAnalyze, onUpload,
  loading, uploaded, data
}: Props) {

  const [file, setFile] = useState<File | null>(null);

  const handleUpload = () => {
    if (!file) return;
    onUpload(file);
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onAnalyze();
  };

  const hasData = data && (data.vessel || data.mode);

  return (
    <Box>

      {/* 🔥 HEADER CARD */}
      <Box
        sx={{
          bgcolor: "#292a2d",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          p: 3,
          mb: hasData ? 3 : 0,
        }}
      >
        <Typography sx={{ fontSize: "0.6875rem", color: "#9aa0a6", mb: 2 }}>
          Dataset & Query
        </Typography>

        {/* 🔥 FILE UPLOAD */}
        <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileRounded />}
          >
            Choose CSV
            <input
              type="file"
              hidden
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Button>

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!file}
          >
            Upload
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

        {/* 🔥 INPUTS */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>

          <TextField
            placeholder="Vessel ID"
            value={vesselId}
            onChange={e => setVesselId(e.target.value)}
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

          <TextField
            label="Loaded"
            value={loaded}
            onChange={e => setLoaded(e.target.value)}
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

          <TextField
            label="Discharged"
            value={discharged}
            onChange={e => setDischarged(e.target.value)}
            type="number"
            size="small"
          />

          <Button
            variant="contained"
            onClick={onAnalyze}
            disabled={loading || !uploaded}
            startIcon={loading ? undefined : <AutoGraphRounded />}
          >
            {loading ? <CircularProgress size={16} /> : "Run Analysis"}
          </Button>
        </Box>
      </Box>

      {!hasData && (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <DirectionsBoat sx={{ fontSize: 40, color: "#5f6368" }} />
          <Typography sx={{ color: "#9aa0a6" }}>
            Upload dataset and run analysis
          </Typography>
        </Box>
      )}
    </Box>
  );
}