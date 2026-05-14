import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Button, TextField, ToggleButtonGroup, ToggleButton, IconButton, useTheme, alpha } from "@mui/material";
import { WarningAmberRounded, FullscreenRounded, DashboardRounded } from "@mui/icons-material";
import { api } from "../../api/api";
import TerminalMap2D from "../TerminalMap2D";
import TerminalMap3D from "../TerminalMap3D";
import BerthRecommendation from "../../components/Dashboard/BerthRecommendation";
import LiveYardStats from "../../components/Dashboard/LiveYardStats";
import HeatmapView from "../../components/Dashboard/HeatmapView";

const KPI = ({ label, value, valueColor, isMono = false }: any) => (
  <Box sx={{ display: "flex", flexDirection: "column", minWidth: 100 }}>
    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</Typography>
    <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: valueColor, fontFamily: isMono ? "'Inter', monospace" : "inherit" }}>{value}</Typography>
  </Box>
);

// Helper to convert the new array-based backend payload into the legacy format expected by the 2D/3D maps
function adaptDataForMaps(newData: any) {
  if (!newData || !newData.blocks) return null;

  const blocksObj: Record<string, any> = {};
  const layoutObj: Record<string, { x: number, y: number }> = {};

  // Sort blocks alphabetically to ensure stable grid positions
  const sortedBlockIds = [...newData.blocks].map(b => b.block_id).sort();

  sortedBlockIds.forEach((id, idx) => {
    layoutObj[id] = { x: idx % 3, y: Math.floor(idx / 3) };
  });

  let maxBlockId = null;
  let maxCount = -1;

  newData.blocks.forEach((b: any) => {
    blocksObj[b.block_id] = {
      count: b.total_containers,
      hazardous: b.hazmat_count,
      reefer: b.reefer_count,
      oog: b.oog_count,
      intensity: b.intensity || 0,
      concentration: b.concentration || "Low",
    };
    if (b.total_containers > maxCount) {
      maxCount = b.total_containers;
      maxBlockId = b.block_id;
    }
  });

  return {
    ...newData,
    targetBerthId: newData.primary_berth ? newData.primary_berth.berth : "",
    computedMaxBlock: maxBlockId,
    max_block: maxBlockId,
    recommended_berth: newData.primary_berth ? newData.primary_berth.berth : "",
    blocks: blocksObj,
    layout: layoutObj,
    summary: {
      ...newData.summary,
      hazardous: newData.summary.hazmat_total,
      reefer: newData.summary.reefer_total,
    }
  };
}

export default function OperationalDashboard() {
  const [searchParams] = useSearchParams();
  const [vesselInput, setVesselInput] = useState(searchParams.get("vessel") || "VS-CWIT-09");
  const [yardInput, setYardInput] = useState("");
  const [containerInput, setContainerInput] = useState("");
  const [rawApiData, setRawApiData] = useState<any>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"HEATMAP" | "MAP2D" | "3D" | "BERTH" | "STATS">("HEATMAP");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  const load = async () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    try {
      const payload: any = { vessel_id: vesselInput.trim() };
      if (yardInput.trim()) payload.yard_id = yardInput.trim();
      if (containerInput.trim()) payload.unit_ids = containerInput.split(',').map(s => s.trim()).filter(Boolean);

      const response = await api.post("/vessel/heatmap", payload);
      const res = response.data;
      if (res.error) {
        alert(res.error);
      } else {
        setRawApiData(res);
        setMapData(adaptDataForMaps(res));
      }
    } catch (err) {
      console.error(err);
      alert("Error fetching dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalMoves = rawApiData?.summary?.total_containers || 0;
  const hasSpecial = rawApiData?.summary?.hazmat_total > 0 || rawApiData?.summary?.reefer_total > 0;

  return (
    <Box ref={wrapperRef} sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
      <Box className="glass-panel" sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider", zIndex: 10 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Box>
            <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 800 }}>Command Center</Typography>
            <Typography variant="h4" className="font-outfit" sx={{ fontWeight: 900 }}>Operational Dashboard</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <ToggleButtonGroup value={viewMode} exclusive size="small" onChange={(_, m) => m && setViewMode(m)}>
              <ToggleButton value="HEATMAP" sx={{ px: 2, fontWeight: 600 }}>Heatmap</ToggleButton>
              <ToggleButton value="MAP2D" sx={{ px: 2, fontWeight: 600 }}>2D Map</ToggleButton>
              <ToggleButton value="3D" sx={{ px: 2, fontWeight: 600 }}>3D Twin</ToggleButton>
              <ToggleButton value="BERTH" sx={{ px: 2, fontWeight: 600 }}>Berth Intel</ToggleButton>
              <ToggleButton value="STATS" sx={{ px: 2, fontWeight: 600 }}><DashboardRounded sx={{ mr: 1, fontSize: 18 }} /> Analytics</ToggleButton>
            </ToggleButtonGroup>
            <IconButton onClick={() => document.fullscreenElement ? document.exitFullscreen() : wrapperRef.current?.requestFullscreen()} sx={{ border: "1px solid", borderColor: "divider" }}>
              <FullscreenRounded />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            variant="outlined"
            value={vesselInput}
            onChange={(e) => setVesselInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Vessel ID..."
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            variant="outlined"
            value={yardInput}
            onChange={(e) => setYardInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Yard ID (Optional)"
            sx={{ width: 160 }}
          />
          <TextField
            size="small"
            variant="outlined"
            value={containerInput}
            onChange={(e) => setContainerInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Container IDs (comma separated)"
            sx={{ width: 240 }}
          />
          <Button variant="contained" onClick={load} disabled={loading} sx={{ fontWeight: 700 }}>
            {loading ? "Analyzing..." : "Update Dashboard"}
          </Button>

          {rawApiData && (
            <Box sx={{ display: "flex", gap: 4, borderLeft: "1px solid", borderColor: "divider", pl: 4 }}>
              <KPI label="Primary Block" value={mapData?.max_block || "-"} valueColor="error.main" isMono />
              <KPI label="Optimal Berth" value={rawApiData?.primary_berth?.berth || "-"} valueColor="success.main" isMono />
              <KPI label="Total Volume" value={`${totalMoves} CTN`} isMono />
              {hasSpecial && (
                <Box className="animate-pulse-subtle" sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), px: 1.5, py: 0.5, borderRadius: 1, display: "flex", alignItems: "center", gap: 1 }}>
                  <WarningAmberRounded color="error" sx={{ fontSize: 18 }} />
                  <Typography variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>SPECIAL CARGO</Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
        {/* Main Viewing Area */}
        <Box sx={{ flex: 1, position: "relative", transition: "all 0.3s ease", overflowY: "auto" }}>
          {viewMode === "HEATMAP" && <HeatmapView data={mapData} />}
          {viewMode === "MAP2D" && <TerminalMap2D data={mapData} loading={loading} />}
          {viewMode === "3D" && <TerminalMap3D data={mapData} targetBerthId={mapData?.targetBerthId} computedMaxBlock={mapData?.computedMaxBlock} />}
          {viewMode === "STATS" && rawApiData && (
            <Box sx={{ p: 4, height: "100%", overflowY: "auto" }}>
              <LiveYardStats summary={rawApiData.summary} />
            </Box>
          )}
          {viewMode === "BERTH" && rawApiData && rawApiData.berth_analysis && (
            <Box sx={{ p: 4, height: "100%", overflowY: "auto", display: "flex", justifyContent: "center" }}>
              <Box sx={{ width: "100%", maxWidth: 600 }}>
                <BerthRecommendation
                  analysis={rawApiData.berth_analysis}
                  conflicts={rawApiData.conflict_table}
                  primary={rawApiData.primary_berth}
                />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
