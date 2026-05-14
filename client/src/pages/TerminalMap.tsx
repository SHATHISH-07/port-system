import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Button, TextField, ToggleButtonGroup, ToggleButton, IconButton, useTheme, alpha } from "@mui/material";
import { WarningAmberRounded, SearchRounded, FullscreenRounded, FullscreenExitRounded } from "@mui/icons-material";
import { api } from "../api/api";
import TerminalMap2D from "./TerminalMap2D";
import TerminalMap3D from "./TerminalMap3D";

const KPI = ({ label, value, valueColor, isMono = false }: any) => (
  <Box sx={{ display: "flex", flexDirection: "column", minWidth: 100 }}>
    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</Typography>
    <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: valueColor, fontFamily: isMono ? "'Roboto Mono', monospace" : "inherit" }}>{value}</Typography>
  </Box>
);

export default function TerminalMap() {
  const [searchParams] = useSearchParams();
  const [vesselInput, setVesselInput] = useState(searchParams.get("vessel") || "BB_101");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  const load = async () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    try {
      const res = await api.get("/vessel/heatmap", { params: { vesselId: vesselInput.trim() } });
      setData(res.data);
    } catch (err) {
      alert("Error fetching heatmap data.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Compute stats from the JSON response
  const totalMoves = data ? Object.values(data.blocks || {}).reduce((sum: number, b: any) => sum + b.count, 0) : 0;
  const hasSpecial = data?.summary?.hazardous > 0 || data?.summary?.reefer > 0;

  return (
    <Box ref={wrapperRef} sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
      <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Box>
            <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 800 }}>Terminal Intelligence</Typography>
            <Typography variant="h4" sx={{ fontWeight: 900 }}>Heatmap & Asset Mapping</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <ToggleButtonGroup value={viewMode} exclusive size="small" onChange={(_, m) => m && setViewMode(m)}>
              <ToggleButton value="2D" sx={{ px: 3 }}>2D View</ToggleButton>
              <ToggleButton value="3D" sx={{ px: 3 }}>3D Twin</ToggleButton>
            </ToggleButtonGroup>
            <IconButton onClick={() => document.fullscreenElement ? document.exitFullscreen() : wrapperRef.current?.requestFullscreen()} sx={{ border: "1px solid", borderColor: "divider" }}>
              {isFullscreen ? <FullscreenExitRounded /> : <FullscreenRounded />}
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 4 }}>
          <TextField
            size="small"
            variant="standard"
            value={vesselInput}
            onChange={(e) => setVesselInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Enter Vessel ID..."
            InputProps={{ startAdornment: <SearchRounded sx={{ mr: 1, color: "primary.main" }} /> }}
            sx={{ width: 220 }}
          />
          <Button variant="contained" onClick={load} disabled={loading} sx={{ fontWeight: 700 }}>{loading ? "Analyzing..." : "Update Map"}</Button>

          {data && (
            <Box sx={{ display: "flex", gap: 4, borderLeft: "1px solid", borderColor: "divider", pl: 4 }}>
              <KPI label="Primary Block" value={data.max_block} valueColor="error.main" isMono />
              <KPI label="Optimal Berth" value={data.recommended_berth} valueColor="success.main" isMono />
              <KPI label="Total Volume" value={`${totalMoves} CTN`} isMono />
              {hasSpecial && (
                <Box sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), px: 1.5, py: 0.5, borderRadius: 1, display: "flex", alignItems: "center", gap: 1 }}>
                  <WarningAmberRounded color="error" sx={{ fontSize: 18 }} />
                  <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>SPECIAL CARGO</Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {viewMode === "2D" ? <TerminalMap2D data={data} loading={loading} /> : <TerminalMap3D data={data} />}
      </Box>
    </Box>
  );
}