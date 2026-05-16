import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  useTheme,
  alpha,
  Paper,
  Stack,
  Divider,
  Drawer,
} from "@mui/material";
import {
  FullscreenRounded,
  UploadFileRounded,
  ClearRounded,
  SearchRounded,
  CloseRounded,
  MapRounded,
  ViewInArRounded,
  GridOnRounded,
  DirectionsBoatRounded,
} from "@mui/icons-material";
import { api } from "../../api/api";
import TerminalMap2D from "./components/TerminalMap2D";
import TerminalMap3D from "./components/TerminalMap3D";
import BerthRecommendation from "./components/BerthRecommendation";
import HeatmapView from "./components/HeatmapView";
import type {
  CellData,
  VesselHeatmapViewData,
  BerthAnalysis,
  ConflictEntry,
  BlockData,
  ContainerData,
} from "../../types/heatmap";

type ApiHeatmapBlock = {
  block_id: string;
  total_containers: number;
  hazmat_count: number;
  reefer_count: number;
  oog_count: number;
  density_pct?: number;
  avg_stack_height?: number;
  intensity?: number;
  concentration?: "High" | "Medium" | "Low";
  cells?: CellData[];
  containers?: ContainerData[];
};

type ApiHeatmapResponse = {
  vessel: string;
  yard_id?: string;
  visit_id?: string;
  recommended_berth?: string;
  max_block?: string;
  summary?: {
    hazardous?: number;
    reefer?: number;
    oog?: number;
    total_containers?: number;
    total_blocks?: number;
    hazmat_total?: number;
    reefer_total?: number;
    oog_total?: number;
  };
  blocks: ApiHeatmapBlock[];
  primary_berth?: BerthAnalysis;
  berth_analysis?: BerthAnalysis[];
  conflict_table?: ConflictEntry[];
  error?: string;
};

function adaptDataForMaps(newData: ApiHeatmapResponse): VesselHeatmapViewData | null {
  if (!newData || !Array.isArray(newData.blocks)) return null;

  const blocksObj: Record<string, BlockData> = {};
  const layoutObj: Record<string, { x: number; y: number }> = {};
  const sortedBlockIds = [...newData.blocks].map((b) => b.block_id).filter(Boolean).sort();

  sortedBlockIds.forEach((id, idx) => {
    layoutObj[id] = { x: idx % 3, y: Math.floor(idx / 3) };
  });

  const maxCount = Math.max(...newData.blocks.map(b => b.total_containers || 0), 1);
  let computedMaxBlockId: string | null = null;

  const totalContainersFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.total_containers || 0), 0);
  const totalBlocksFromBlocks = newData.blocks.length;
  const hazmatTotalFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.hazmat_count || 0), 0);
  const reeferTotalFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.reefer_count || 0), 0);
  const oogTotalFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.oog_count || 0), 0);

  newData.blocks.forEach((b) => {
    const count = b.total_containers || 0;
    let intensity = b.intensity;
    if (typeof intensity !== 'number' || intensity === 0) intensity = count / maxCount;
    let concentration = b.concentration;
    if (!concentration) concentration = intensity > 0.65 ? "High" : intensity > 0.3 ? "Medium" : "Low";

    blocksObj[b.block_id] = {
      count: count,
      hazardous: b.hazmat_count || 0,
      reefer: b.reefer_count || 0,
      oog: b.oog_count || 0,
      intensity: intensity,
      concentration: concentration,
      cells: b.cells || [],
    };
    if (count === maxCount && count > 0) computedMaxBlockId = b.block_id;
  });

  return {
    ...newData,
    visit_id: newData.visit_id || "",
    targetBerthId: newData.primary_berth ? newData.primary_berth.berth : "",
    computedMaxBlock: computedMaxBlockId,
    max_block: computedMaxBlockId || "",
    recommended_berth: newData.primary_berth ? newData.primary_berth.berth : newData.recommended_berth || "",
    blocks: blocksObj,
    layout: layoutObj,
    summary: {
      hazardous: newData.summary?.hazardous ?? hazmatTotalFromBlocks,
      reefer: newData.summary?.reefer ?? reeferTotalFromBlocks,
      oog: newData.summary?.oog ?? oogTotalFromBlocks,
      total_containers: newData.summary?.total_containers ?? totalContainersFromBlocks,
      total_blocks: newData.summary?.total_blocks ?? totalBlocksFromBlocks,
      hazmat_total: newData.summary?.hazmat_total ?? hazmatTotalFromBlocks,
      reefer_total: newData.summary?.reefer_total ?? reeferTotalFromBlocks,
      oog_total: newData.summary?.oog_total ?? oogTotalFromBlocks,
    },
  };
}

export default function OperationalDashboard() {
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputsOpen, setInputsOpen] = useState(true);
  const [mapView, setMapView] = useState<"HEATMAP" | "MAP2D" | "3D">("3D");
  const [overlayView, setOverlayView] = useState<"BERTH" | "NONE">("NONE");

  const [vesselInput, setVesselInput] = useState(searchParams.get("vessel") || "VS-PEB-07");
  const [yardInput, setYardInput] = useState("");
  const [containerFile, setContainerFile] = useState<File | null>(null);
  const [rawApiData, setRawApiData] = useState<ApiHeatmapResponse | null>(null);
  const [mapData, setMapData] = useState<VesselHeatmapViewData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    try {
      let unitIds: string[] | undefined;
      if (containerFile) {
        const text = await containerFile.text();
        try {
          const parsed = JSON.parse(text);
          unitIds = Array.isArray(parsed) ? parsed : undefined;
        } catch {
          alert("Invalid JSON file — expected an array of container IDs.");
          setLoading(false);
          return;
        }
      }

      const payload: Record<string, string | string[]> = {
        vessel_id: vesselInput.trim(),
      };
      if (yardInput.trim()) payload.yard_id = yardInput.trim();
      if (unitIds) payload.unit_ids = unitIds;

      const response = await api.post("/vessel/heatmap", payload, {
        headers: { "Content-Type": "application/json" },
      });

      const res: ApiHeatmapResponse = response.data;
      if (res.error) {
        alert(res.error);
      } else {
        setRawApiData(res);
        setMapData(adaptDataForMaps(res));
        setInputsOpen(false);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : "Error fetching dashboard data.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleViewToggle = (
    _: React.MouseEvent<HTMLElement> | null,
    newView: string | null,
  ) => {
    if (!newView) return;
    if (newView === "BERTH") {
      setOverlayView(newView);
    } else {
      setMapView(newView as "HEATMAP" | "MAP2D" | "3D");
      setOverlayView("NONE");
    }
  };

  const totalMoves = useMemo(() => rawApiData?.summary?.total_containers || rawApiData?.blocks?.reduce((s, b) => s + (b.total_containers || 0), 0) || 0, [rawApiData]);
  const totalBlocks = useMemo(() => rawApiData?.summary?.total_blocks ?? (Array.isArray(rawApiData?.blocks) ? rawApiData.blocks.length : 0), [rawApiData]);
  const hazmat = useMemo(() => rawApiData?.summary?.hazmat_total ?? rawApiData?.summary?.hazardous ?? 0, [rawApiData]);
  const reefer = useMemo(() => rawApiData?.summary?.reefer_total ?? rawApiData?.summary?.reefer ?? 0, [rawApiData]);
  const oog = useMemo(() => rawApiData?.summary?.oog_total ?? rawApiData?.summary?.oog ?? 0, [rawApiData]);
  const hasSpecial = hazmat > 0 || reefer > 0 || oog > 0;

  return (
    <Box
      ref={wrapperRef}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 600,
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {/* BASE LAYER: CANVAS MAPS */}
      <Box sx={{ position: "absolute", inset: 0, zIndex: 1 }}>
        {mapView === "HEATMAP" && (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <HeatmapView data={mapData} loading={loading} />
          </Box>
        )}
        {mapView === "MAP2D" && (
          <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <TerminalMap2D data={mapData} loading={loading} />
          </Box>
        )}
        {mapView === "3D" && (
          <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <TerminalMap3D
              data={mapData}
              targetBerthId={mapData?.targetBerthId || ""}
              computedMaxBlock={mapData?.computedMaxBlock || null}
              loading={loading}
            />
          </Box>
        )}
      </Box>

      {/* TOP LEFT: INPUT CONTROLS */}
      <Paper
        elevation={6}
        sx={{
          position: "absolute",
          top: 24,
          left: 24,
          zIndex: 10,
          backdropFilter: "blur(20px)",
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.8 : 0.9),
          borderRadius: 4,
          overflow: "hidden",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          width: inputsOpen ? 340 : "auto",
          border: "1px solid",
          borderColor: theme.palette.divider,
          boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
        }}
      >
        {!inputsOpen ? (
          <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }} onClick={() => setInputsOpen(true)}>
            <SearchRounded fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
              VESSEL:{" "}
              <Typography
                component="span"
                sx={{ color: "primary.main", fontWeight: 900 }}
              >
                {vesselInput || "NONE"}
              </Typography>
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="overline" sx={{ fontWeight: 900, color: "text.secondary", letterSpacing: 1.5 }}>
                Command Parameters
              </Typography>
              <IconButton size="small" onClick={() => setInputsOpen(false)} sx={{ mr: -1 }}>
                <CloseRounded fontSize="small" />
              </IconButton>
            </Box>
            <Stack spacing={2}>
              <TextField size="small" fullWidth label="Vessel ID" value={vesselInput} onChange={(e) => setVesselInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
              <TextField size="small" fullWidth label="Yard ID (Optional)" value={yardInput} onChange={(e) => setYardInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
              <Box>
                <Button fullWidth component="label" variant="outlined" startIcon={<UploadFileRounded />} sx={{ fontWeight: 700, textTransform: "none", justifyContent: "flex-start", color: 'text.primary', borderColor: 'divider' }}>
                  {containerFile ? containerFile.name : "Upload Container List"}
                  <input ref={fileInputRef} type="file" hidden accept=".txt,.csv,.json" onChange={(e) => setContainerFile(e.target.files?.[0] || null)} />
                </Button>
                {containerFile && (
                  <Button size="small" onClick={() => { setContainerFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} startIcon={<ClearRounded sx={{ fontSize: 14 }} />} sx={{ mt: 0.5 }}>
                    Clear File
                  </Button>
                )}
              </Box>
              <Button variant="contained" fullWidth onClick={load} disabled={loading} sx={{ fontWeight: 800, py: 1.5 }}>
                {loading ? "Analyzing..." : "Execute Analysis"}
              </Button>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* TOP RIGHT: KPI BAR */}
      {rawApiData && (
        <Paper
          elevation={6}
          sx={{
            position: "absolute",
            top: 24,
            right: 24,
            zIndex: 10,
            backdropFilter: "blur(20px)",
            bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.8 : 0.9),
            borderRadius: 4,
            p: 1.5,
            display: { xs: "none", lg: "flex" },
            alignItems: "center",
            gap: 3,
            border: "1px solid",
            borderColor: theme.palette.divider,
            boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase" }}>Primary Block</Typography>
            <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "error.main", fontFamily: "'Inter', monospace" }}>{mapData?.max_block || "-"}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase" }}>Target Berth</Typography>
            <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "success.main", fontFamily: "'Inter', monospace" }}>{rawApiData?.primary_berth?.berth || rawApiData?.recommended_berth || "-"}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase" }}>Total Volume</Typography>
            <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "text.primary", fontFamily: "'Inter', monospace" }}>{totalMoves.toLocaleString()} CTN</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase" }}>Blocks</Typography>
            <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "text.primary", fontFamily: "'Inter', monospace" }}>{totalBlocks}</Typography>
          </Box>

          {hasSpecial && (
            <>
              <Divider orientation="vertical" flexItem />
              <Stack direction="row" spacing={3}>
                {hazmat > 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ display: "block", color: "error.main", fontWeight: 800, textTransform: "uppercase" }}>Hazmat</Typography>
                    <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "error.main", fontFamily: "'Inter', monospace" }}>{hazmat}</Typography>
                  </Box>
                )}
                {reefer > 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ display: "block", color: "info.main", fontWeight: 800, textTransform: "uppercase" }}>Reefer</Typography>
                    <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "info.main", fontFamily: "'Inter', monospace" }}>{reefer}</Typography>
                  </Box>
                )}
                {oog > 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ display: "block", color: "warning.main", fontWeight: 800, textTransform: "uppercase" }}>OOG</Typography>
                    <Typography sx={{ fontSize: "1.1rem", fontWeight: 900, color: "warning.main", fontFamily: "'Inter', monospace" }}>{oog}</Typography>
                  </Box>
                )}
              </Stack>
            </>
          )}
        </Paper>
      )}

      {/* BOTTOM CENTER: VIEW SWITCHER */}
      <Paper
        elevation={8}
        sx={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          backdropFilter: "blur(20px)",
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.8 : 0.9),
          borderRadius: 10,
          p: 0.75,
          border: "1px solid",
          borderColor: theme.palette.divider,
          boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[10],
        }}
      >
        <ToggleButtonGroup
          value={overlayView !== "NONE" ? overlayView : mapView}
          exclusive
          onChange={handleViewToggle}
          sx={{
            "& .MuiToggleButton-root": {
              borderRadius: 6, px: { xs: 1.5, md: 2.5 }, py: 1, border: "none", fontWeight: 700, textTransform: "none", color: "text.secondary",
              "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }
            }
          }}
        >
          <ToggleButton value="HEATMAP">Block Illustrator</ToggleButton>
          <ToggleButton value="MAP2D">2D Heatmap</ToggleButton>
          <ToggleButton value="3D">3D Heatmap</ToggleButton>
          <Divider flexItem orientation="vertical" sx={{ mx: 0.5, my: 1 }} />
          <ToggleButton value="BERTH">Recommended Berth</ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      {/* BOTTOM SHEET FOR BERTH INTEL */}
      <Drawer
        anchor="bottom"
        open={overlayView !== "NONE"}
        onClose={() => setOverlayView("NONE")}
        slotProps={{
          paper: {
            sx: {
              height: "auto",
              maxHeight: "85vh",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              bgcolor: alpha(theme.palette.background.paper, 0.98),
              backdropFilter: "blur(30px)",
              borderTop: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
              width: { xs: "100%", md: "85%", lg: "70%", xl: "60%" },
              mx: "auto",
            },
          },
        }}
      >
        {/* Drag Handle / Header */}
        <Box
          sx={{
            py: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: "pointer",
            "&:hover .handle": { bgcolor: "primary.main" },
          }}
          onClick={() => setOverlayView("NONE")}
        >
          <Box
            className="handle"
            sx={{
              width: 48,
              height: 4,
              borderRadius: 2,
              bgcolor: "divider",
              mb: 1,
              transition: "background-color 0.2s",
            }}
          />
        </Box>

        <Box sx={{ p: { xs: 2, md: 4, lg: 6 }, pt: 0, height: "100%", overflowY: "auto" }}>
          {overlayView === "BERTH" && rawApiData?.berth_analysis && (
            <BerthRecommendation
              analysis={rawApiData.berth_analysis}
              conflicts={rawApiData.conflict_table || []}
              primary={rawApiData.primary_berth || null}
            />
          )}
        </Box>
      </Drawer>

      <IconButton
        onClick={() => document.fullscreenElement ? document.exitFullscreen() : wrapperRef.current?.requestFullscreen()}
        sx={{ position: "absolute", bottom: 24, right: 24, zIndex: 10, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: 3 }}
      >
        <FullscreenRounded />
      </IconButton>
    </Box>
  );
}