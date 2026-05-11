import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Divider,
  Button,
  TextField,
  InputAdornment,
  useTheme,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  WarningAmberRounded,
  SearchRounded,
  Map as MapIcon,
  ThreeDRotation,
  FullscreenRounded,
  FullscreenExitRounded,
} from "@mui/icons-material";
import { api } from "../api/api";
import type { VesselHeatmapResponse } from "../types/vessel";

import TerminalMap2D from "./TerminalMap2D";
import TerminalMap3D from "./TerminalMap3D";

// ─── Constants ────────────────────────────────────────────────────────────────
const BLK_W = 160, BLK_H = 120, BLK_GAP_X = 40, BLK_GAP_Y = 40;
const BLK_START_X = 80, BLK_START_Y = 190;

const BERTHS = [
  { id: "T1", x: 260, y: 60 },
  { id: "T2", x: 600, y: 60 },
  { id: "B1", x: 260, y: 760 },
  { id: "B2", x: 600, y: 760 },
  { id: "R1", x: 1010, y: 280 },
  { id: "R2", x: 1010, y: 580 },
];

// ─── KPI Chip ─────────────────────────────────────────────────────────────────
const KPI = ({ label, value, valueColor, isMono = false }: {
  label: string; value: string | number; valueColor?: string; isMono?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0, flexShrink: 0 }}>
      <Typography
        sx={{
          fontSize: "0.65rem", color: theme.palette.text.secondary, fontWeight: 700,
          letterSpacing: "0.5px", textTransform: "uppercase"
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: "0.95rem", fontWeight: 600, color: valueColor || theme.palette.text.primary,
          fontFamily: isMono ? "'Roboto Mono', monospace" : "'Inter', sans-serif",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};

// ─── Root Component ───────────────────────────────────────────────────────────
export default function TerminalMap() {
  const [searchParams] = useSearchParams();
  const [vesselInput, setVesselInput] = useState(searchParams.get("vessel") || "AA102");
  const [data, setData] = useState<VesselHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const mode = theme.palette.mode;

  let targetBerthId = "R1";
  let totalMoves = 0;
  let computedMaxBlock: string | null = null;
  let maxBlockData: { count: number; concentration: string } | undefined;

  if (data) {
    let maxCount = -1;
    Object.entries(data.blocks || {}).forEach(([id, b]: [string, any]) => {
      totalMoves += b.count;
      if (b.count > maxCount) {
        maxCount = b.count;
        computedMaxBlock = id;
        maxBlockData = b;
      }
    });

    const highestId = computedMaxBlock || data.max_block;
    if (highestId && data.layout?.[highestId]) {
      const pos = data.layout[highestId];
      const mX = BLK_START_X + pos.x * (BLK_W + BLK_GAP_X) + BLK_W / 2;
      const mY = BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y) + BLK_H / 2;
      let minD = Infinity;
      BERTHS.forEach((b) => {
        const d = Math.hypot(b.x - mX, b.y - mY);
        if (d < minD) {
          minD = d;
          targetBerthId = b.id;
        }
      });
    }
  }

  const load = async () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("vessel_id", vesselInput.trim());
      const res = await api.post<VesselHeatmapResponse>("/vessel/heatmap", form);
      setData(res.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "";
      alert(
        detail.includes("No dataset")
          ? "No current data found. Upload via POST /upload/current."
          : err?.response?.data?.error || "Error loading heatmap."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      wrapperRef.current?.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  return (
    <Box
      ref={wrapperRef}
      sx={{
        width: "100%", height: isFullscreen ? "100vh" : "100vh",
        bgcolor: "background.default", color: "text.primary",
        display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          bgcolor: mode === "dark" ? "#161b24" : "#f1f5f9",
          borderBottom: "1px solid", borderColor: mode === "dark" ? "#1e2433" : "#cbd5e1",
          display: "flex", alignItems: "center", px: 3, py: 1.5, gap: 2, flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            variant="outlined" placeholder="Vessel ID" value={vesselInput}
            onChange={(e) => setVesselInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(); } }}
            size="small"
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 16 }} /></InputAdornment>,
              },
            }}
            sx={{ width: 140, "& .MuiOutlinedInput-root": { bgcolor: mode === "dark" ? "#0b0e14" : "#ffffff" } }}
          />
          <Button
            onClick={load} disabled={loading || !vesselInput.trim()} disableElevation variant="contained"
            sx={{
              bgcolor: mode === "dark" ? "#38bdf8" : "#0284c7", color: mode === "dark" ? "#0f1219" : "#ffffff",
              fontSize: "0.75rem", fontWeight: 700, px: 2.5, py: "7px", textTransform: "none",
              "&:hover": { bgcolor: mode === "dark" ? "#0ea5e9" : "#0369a1" },
            }}
          >
            {loading ? "Computing..." : "Show Heatmap"}
          </Button>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: mode === "dark" ? "#272e3d" : "#cbd5e1", my: 0.5 }} />

        <ToggleButtonGroup
          value={viewMode} exclusive size="small"
          onChange={(_, newMode) => { if (newMode) setViewMode(newMode); }}
        >
          <ToggleButton value="2D" sx={{ px: 1.5 }}><MapIcon fontSize="small" sx={{ mr: 0.5 }} /> 2D</ToggleButton>
          <ToggleButton value="3D" sx={{ px: 1.5 }}><ThreeDRotation fontSize="small" sx={{ mr: 0.5 }} /> 3D</ToggleButton>
        </ToggleButtonGroup>

        {data && (
          <>
            <Divider orientation="vertical" flexItem sx={{ borderColor: mode === "dark" ? "#272e3d" : "#cbd5e1", my: 0.5 }} />
            <Box sx={{ display: "flex", gap: 4, alignItems: "center", flex: 1, overflowX: "auto" }}>
              <KPI label="Vessel Name" value={data.vessel} />
              <KPI label="Visit ID" value={data.visit_id || "—"} isMono />
              <KPI label="Total Volume" value={`${totalMoves} CTN`} isMono valueColor={theme.palette.info.main} />
              <KPI label="Optimal Berth" value={targetBerthId} isMono valueColor={theme.palette.success.main} />
              <KPI label="Primary Block" value={computedMaxBlock || data.max_block || "—"} isMono valueColor={theme.palette.error.main} />

              <Box sx={{ flex: 1 }} />

              {(data.summary?.hazardous > 0 || data.summary?.reefer > 0) && (
                <Box sx={{
                  px: 2, py: 1, bgcolor: alpha(theme.palette.error.main, 0.1), border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                  borderRadius: 1, display: "flex", gap: 1.5, alignItems: "center", whiteSpace: "nowrap"
                }}>
                  <WarningAmberRounded sx={{ fontSize: 18, color: "error.main" }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "error.main", fontWeight: 600 }}>Special Cargo (Haz/Ref)</Typography>
                </Box>
              )}
            </Box>
          </>
        )}

        <IconButton onClick={toggleFullscreen} sx={{ ml: "auto", color: "text.secondary" }}>
          {isFullscreen ? <FullscreenExitRounded /> : <FullscreenRounded />}
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        {viewMode === "2D" ? (
          <TerminalMap2D data={data} targetBerthId={targetBerthId} computedMaxBlock={computedMaxBlock} loading={loading} />
        ) : (
          <TerminalMap3D data={data} targetBerthId={targetBerthId} computedMaxBlock={computedMaxBlock} maxBlockData={maxBlockData} />
        )}
      </Box>
    </Box>
  );
}