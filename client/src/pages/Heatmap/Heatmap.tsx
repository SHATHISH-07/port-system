import * as React from "react";
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
  Alert,
  Snackbar,
  Select,
  MenuItem,
} from "@mui/material";
import {
  FullscreenRounded,
  UploadFileOutlined,
  ClearRounded,
  SearchRounded,
  CloseRounded,
} from "@mui/icons-material";
import { api } from "../../api/api";
import TerminalMap2D from "./components/TerminalMap2D";
import TerminalMap3D from "./components/TerminalMap3D";
import BerthRecommendation from "./components/BerthRecommendation";
import BlockIllustrator from "./components/BlockIllustrator";
import ContainerPositionTable from "./components/ContainerPositionTable";
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

  const activeBlockIds = [...newData.blocks].map((b) => b.block_id).filter(Boolean);
  const emptyBlockIds: string[] = [];

  let genIdx = 1;
  while (emptyBlockIds.length < 9 - activeBlockIds.length) {
    emptyBlockIds.push(`EMPTY-${genIdx++}`);
  }

  // Position empty blocks at indices 5, 7, 8 (not in top row 0, 1, 2)
  const finalBlockIds = new Array(9).fill("");
  const emptyIndices = [5, 7, 8];
  let actCount = 0;
  let empCount = 0;

  for (let i = 0; i < 9; i++) {
    if (emptyIndices.includes(i)) {
      finalBlockIds[i] = emptyBlockIds[empCount++] || `EMPTY-${empCount}`;
    } else {
      finalBlockIds[i] = activeBlockIds[actCount++] || emptyBlockIds[empCount++] || `EMPTY-${empCount}`;
    }
  }

  finalBlockIds.forEach((id, idx) => {
    layoutObj[id] = { x: idx % 3, y: Math.floor(idx / 3) };
  });

  const maxCount = Math.max(...newData.blocks.map(b => b.total_containers || 0), 1);
  let computedMaxBlockId: string | null = null;

  const totalContainersFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.total_containers || 0), 0);
  const totalBlocksFromBlocks = newData.blocks.length;
  const hazmatTotalFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.hazmat_count || 0), 0);
  const reeferTotalFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.reefer_count || 0), 0);
  const oogTotalFromBlocks = newData.blocks.reduce((sum, b) => sum + (b.oog_count || 0), 0);

  finalBlockIds.forEach((bId) => {
    const b = newData.blocks.find(block => block.block_id === bId);
    if (b) {
      const count = b.total_containers || 0;
      let intensity = b.intensity;
      if (typeof intensity !== 'number' || intensity === 0) intensity = count / maxCount;
      let concentration = b.concentration;
      if (!concentration) concentration = intensity > 0.65 ? "High" : intensity > 0.3 ? "Medium" : "Low";

      blocksObj[bId] = {
        count: count,
        hazardous: b.hazmat_count || 0,
        reefer: b.reefer_count || 0,
        oog: b.oog_count || 0,
        intensity: intensity,
        concentration: concentration,
        cells: b.cells || [],
        containers: b.containers || [],
      };
      if (count === maxCount && count > 0) computedMaxBlockId = bId;
    } else {
      blocksObj[bId] = {
        count: 0,
        hazardous: 0,
        reefer: 0,
        oog: 0,
        intensity: 0,
        concentration: "Low",
        cells: [],
        containers: [],
      };
    }
  });

  // Deterministic calculation of closest physical berth to the highest density block
  let targetBerthId = "R1";
  const BERTH_COORDS = [
    { id: "T1", x: 260, y: 60 },
    { id: "T2", x: 600, y: 60 },
    { id: "B1", x: 260, y: 760 },
    { id: "B2", x: 600, y: 760 },
    { id: "R1", x: 1010, y: 280 },
    { id: "R2", x: 1010, y: 580 },
  ];
  const highestBlockId = computedMaxBlockId || newData.max_block || "";
  if (highestBlockId && layoutObj[highestBlockId]) {
    const pos = layoutObj[highestBlockId];
    const maxBlockX = 80 + pos.x * 200 + 80;
    const maxBlockY = 190 + pos.y * 160 + 60;
    let minDistance = Infinity;
    BERTH_COORDS.forEach((berth) => {
      const dist = Math.hypot(berth.x - maxBlockX, berth.y - maxBlockY);
      if (dist < minDistance) {
        minDistance = dist;
        targetBerthId = berth.id;
      }
    });
  }

  return {
    ...newData,
    visit_id: newData.visit_id || "",
    targetBerthId: targetBerthId,
    computedMaxBlock: computedMaxBlockId,
    max_block: computedMaxBlockId || "",
    recommended_berth: targetBerthId,
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

export default function Heatmap() {
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [vesselInput, setVesselInput] = React.useState(searchParams.get("vesselId") || "");
  const [yardInput, setYardInput] = React.useState(searchParams.get("yardId") || "");
  const [containerFile, setContainerFile] = React.useState<File | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [rawApiData, setRawApiData] = React.useState<ApiHeatmapResponse | null>(null);
  const [mapData, setMapData] = React.useState<VesselHeatmapViewData | null>(null);

  const [mapView, setMapView] = React.useState<"HEATMAP" | "MAP2D" | "3D" | "CONTAINERS">("3D");
  const [overlayView, setOverlayView] = React.useState<"NONE" | "BERTH">("NONE");
  const [inputsOpen, setInputsOpen] = React.useState(true);

  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: "success" | "info" | "warning" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!vesselInput.trim()) {
      setToast({
        open: true,
        message: "Please enter a Vessel ID",
        severity: "warning",
      });
      return;
    }

    if (!containerFile) {
      setToast({
        open: true,
        message: "A container list file is required to execute analysis.",
        severity: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      let unitIds: string[] | undefined;
      const text = await containerFile.text();
      try {
        const parsed = JSON.parse(text);
        unitIds = Array.isArray(parsed) ? parsed : undefined;
      } catch {
        setToast({
          open: true,
          message: "Invalid JSON file — expected an array of container IDs.",
          severity: "error",
        });
        setLoading(false);
        return;
      }

      const payload: Record<string, string | string[]> = {
        vessel_id: vesselInput.trim(),
      };
      if (yardInput.trim()) payload.yard_id = yardInput.trim();
      if (unitIds) payload.unit_ids = unitIds;

      const response = await api.post("/vessel/heatmap", payload, {
        headers: { "Content-Type": "application/json" },
      });

      const data = response.data;
      if (data.error) {
        setToast({
          open: true,
          message: data.error,
          severity: "error",
        });
        setRawApiData(null);
        setMapData(null);
      } else {
        setRawApiData(data);
        const adapted = adaptDataForMaps(data);
        setMapData(adapted);
        setToast({
          open: true,
          message: `Successfully loaded yard analysis for ${vesselInput.trim()}`,
          severity: "success",
        });
        setInputsOpen(false);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || err.message || "Failed to load heatmap data";
      setToast({
        open: true,
        message: msg,
        severity: "error",
      });
      setRawApiData(null);
      setMapData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleViewToggle = (
    _e: React.MouseEvent<HTMLElement>,
    next: "HEATMAP" | "MAP2D" | "3D" | "CONTAINERS" | "BERTH" | null
  ) => {
    if (!next) return;
    if (next === "BERTH") {
      setOverlayView("BERTH");
    } else {
      setOverlayView("NONE");
      setMapView(next);
    }
  };

  const totalMoves = mapData?.summary?.total_containers || 0;
  const totalBlocks = mapData?.summary?.total_blocks || 0;
  const hazmat = mapData?.summary?.hazardous || 0;
  const reefer = mapData?.summary?.reefer || 0;
  const oog = mapData?.summary?.oog || 0;
  const hasSpecial = hazmat > 0 || reefer > 0 || oog > 0;

  return (
    <Box
      ref={wrapperRef}
      sx={{
        width: { xs: "calc(100% - 16px)", md: "calc(100% - 32px)" },
        height: { xs: "calc(100% - 16px)", md: "calc(100% - 32px)" },
        m: { xs: 1, md: 2 },
        borderRadius: 2,
        position: "relative",
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
            <BlockIllustrator data={mapData} targetBerthId={mapData?.targetBerthId || ""} loading={loading} />
          </Box>
        )}
        {mapView === "MAP2D" && (
          <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <TerminalMap2D data={mapData} targetBerthId={mapData?.targetBerthId || ""} loading={loading} />
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
        {mapView === "CONTAINERS" && (
          <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <ContainerPositionTable data={mapData} />
          </Box>
        )}
      </Box>

      {/* TOP LEFT: INPUT CONTROLS */}
      <Paper
        elevation={6}
        sx={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          backdropFilter: "none",
          bgcolor: "background.paper",
          borderRadius: 1,
          overflow: "hidden",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          width: inputsOpen ? { xs: 200, md: 260 } : "auto",
          border: "1px solid",
          borderColor: theme.palette.divider,
          boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
        }}
      >
        {!inputsOpen ? (
          <Box sx={{ px: { xs: 1, md: 1.5 }, py: { xs: 0.6, md: 1 }, display: "flex", alignItems: "center", gap: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }} onClick={() => setInputsOpen(true)}>
            <SearchRounded sx={{ fontSize: { xs: 16, md: 20 }, color: "primary.main" }} />
            <Typography variant="body2" sx={{ fontSize: { xs: "0.65rem", md: "0.75rem" }, fontWeight: 800, letterSpacing: 0.5 }}>
              VESSEL:{" "}
              <Typography
                component="span"
                sx={{ fontSize: { xs: "0.65rem", md: "0.75rem" }, color: "primary.main", fontWeight: 900 }}
              >
                {vesselInput || "NONE"}
              </Typography>
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: { xs: 1, md: 1.8 } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: { xs: 0.8, md: 1.5 } }}>
              <Typography variant="subtitle2" sx={{ fontSize: { xs: "0.7rem", md: "0.875rem" }, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Heatmap Analysis
              </Typography>
              <IconButton size="small" onClick={() => setInputsOpen(false)} sx={{ mr: -0.5 }}>
                <CloseRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
            <Stack spacing={{ xs: 0.6, md: 1.2 }}>
              <TextField size="small" fullWidth label="Vessel ID" value={vesselInput} onChange={(e) => setVesselInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, height: { xs: 30, md: 36 } } }} slotProps={{ htmlInput: { style: { fontSize: '0.8rem' } }, inputLabel: { style: { fontSize: '0.8rem' } } }} />
              <TextField size="small" fullWidth label="Yard ID (Optional)" value={yardInput} onChange={(e) => setYardInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, height: { xs: 30, md: 36 } } }} slotProps={{ htmlInput: { style: { fontSize: '0.8rem' } }, inputLabel: { style: { fontSize: '0.8rem' } } }} />
              <Box>
                <Button fullWidth component="label" variant="outlined" startIcon={<UploadFileOutlined sx={{ fontSize: { xs: 14, md: 16 } }} />} sx={{ borderRadius: 2, fontSize: { xs: '0.65rem', md: '0.75rem' }, py: { xs: 0.2, md: 0.6 }, fontWeight: 500, textTransform: "none", justifyContent: "flex-start", color: 'text.primary', borderColor: 'divider' }}>
                  <Typography noWrap sx={{ fontSize: { xs: '0.65rem', md: '0.75rem' }, maxWidth: { xs: 140, md: 180 } }}>
                    {containerFile ? containerFile.name : "Upload Container List"}
                  </Typography>
                  <input ref={fileInputRef} type="file" hidden accept=".txt,.csv,.json" onChange={(e) => setContainerFile(e.target.files?.[0] || null)} />
                </Button>
                {containerFile && (
                  <Button size="small" onClick={() => { setContainerFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} startIcon={<ClearRounded sx={{ fontSize: 12 }} />} sx={{ mt: 0.25, py: 0, fontSize: '0.65rem' }}>
                    Clear File
                  </Button>
                )}
              </Box>
              <Button variant="contained" fullWidth onClick={load} disabled={loading} sx={{ borderRadius: 2, fontWeight: 800, py: { xs: 0.4, md: 1 }, fontSize: { xs: '0.65rem', md: '0.8rem' } }}>
                {loading ? "Analyzing..." : "Analyze"}
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
            top: 16,
            right: 16,
            zIndex: 10,
            backdropFilter: "none",
            bgcolor: "background.paper",
            borderRadius: 3,
            px: 1.5,
            py: 0.8,
            display: { xs: "none", lg: "flex" },
            alignItems: "center",
            gap: 2,
            border: "1px solid",
            borderColor: theme.palette.divider,
            boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
          }}
        >
          <Box>
            <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>Primary Block</Typography>
            <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "error.main", fontFamily: "'Inter', monospace" }}>{mapData?.max_block || "-"}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>Target Berth Near</Typography>
            <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "success.main", fontFamily: "'Inter', monospace" }}>{rawApiData?.primary_berth?.berth || rawApiData?.recommended_berth || "-"}</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>Total Volume</Typography>
            <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "text.primary", fontFamily: "'Inter', monospace" }}>{totalMoves.toLocaleString()} CTN</Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>Blocks</Typography>
            <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "text.primary", fontFamily: "'Inter', monospace" }}>{totalBlocks}</Typography>
          </Box>

          {hasSpecial && (
            <>
              <Divider orientation="vertical" flexItem />
              <Stack direction="row" spacing={2}>
                {hazmat > 0 && (
                  <Box>
                    <Typography sx={{ display: "block", color: "error.main", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>Hazmat</Typography>
                    <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "error.main", fontFamily: "'Inter', monospace" }}>{hazmat}</Typography>
                  </Box>
                )}
                {reefer > 0 && (
                  <Box>
                    <Typography sx={{ display: "block", color: "info.main", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>Reefer</Typography>
                    <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "info.main", fontFamily: "'Inter', monospace" }}>{reefer}</Typography>
                  </Box>
                )}
                {oog > 0 && (
                  <Box>
                    <Typography sx={{ display: "block", color: "warning.main", fontWeight: 800, textTransform: "uppercase", fontSize: "0.58rem" }}>OOG</Typography>
                    <Typography sx={{ fontSize: "0.9rem", fontWeight: 900, color: "warning.main", fontFamily: "'Inter', monospace" }}>{oog}</Typography>
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
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          backdropFilter: "none",
          bgcolor: "background.paper",
          borderRadius: 8,
          p: 0.4,
          border: "1px solid",
          borderColor: theme.palette.divider,
          boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[10],
          maxWidth: "calc(100% - 32px)",
          overflowX: "auto",
          "&::-webkit-scrollbar": { display: "none" },
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        <Box sx={{ display: { xs: "none", lg: "block" } }}>
          <ToggleButtonGroup
          value={overlayView !== "NONE" ? overlayView : mapView}
          exclusive
          onChange={handleViewToggle}
          sx={{
            display: "flex",
            flexWrap: "nowrap",
            "& .MuiToggleButton-root": {
              whiteSpace: "nowrap",
              borderRadius: 5, px: { xs: 1.2, md: 1.8 }, py: 0.55, border: "none", fontWeight: 700, textTransform: "none", color: "text.secondary", fontSize: "0.75rem",
              "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }
            }
          }}
        >
          <ToggleButton value="HEATMAP">Block Illustrator</ToggleButton>
          <ToggleButton value="MAP2D">2D Heatmap</ToggleButton>
          <ToggleButton value="3D">3D Heatmap</ToggleButton>
          <ToggleButton value="CONTAINERS">Container Positions</ToggleButton>
          <Divider flexItem orientation="vertical" sx={{ mx: 0.5, my: 0.6 }} />
          <ToggleButton value="BERTH">Recommended Berth</ToggleButton>
        </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: { xs: "block", lg: "none" } }}>
          <Select
            value={overlayView !== "NONE" ? overlayView : mapView}
            onChange={(e) => handleViewToggle(e as any, e.target.value as any)}
            size="small"
            sx={{
              minWidth: 140,
              fontSize: "0.65rem",
              fontWeight: 700,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "& .MuiSelect-select": { py: 0.8, px: 1.5, minHeight: "auto" },
            }}
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    borderRadius: 2,
                    mt: -1, // Pop up instead of down
                    boxShadow: theme.shadows[8],
                  }
                }
              },
              anchorOrigin: {
                vertical: 'top',
                horizontal: 'center',
              },
              transformOrigin: {
                vertical: 'bottom',
                horizontal: 'center',
              },
            } as any}
          >
            <MenuItem value="HEATMAP" sx={{ fontSize: "0.65rem", fontWeight: 600, minHeight: "auto", py: 0.8 }}>Block Illustrator</MenuItem>
            <MenuItem value="MAP2D" sx={{ fontSize: "0.65rem", fontWeight: 600, minHeight: "auto", py: 0.8 }}>2D Heatmap</MenuItem>
            <MenuItem value="3D" sx={{ fontSize: "0.65rem", fontWeight: 600, minHeight: "auto", py: 0.8 }}>3D Heatmap</MenuItem>
            <MenuItem value="CONTAINERS" sx={{ fontSize: "0.65rem", fontWeight: 600, minHeight: "auto", py: 0.8 }}>Container Positions</MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem value="BERTH" sx={{ fontSize: "0.65rem", fontWeight: 600, minHeight: "auto", py: 0.8 }}>Recommended Berth</MenuItem>
          </Select>
        </Box>
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
          {overlayView === "BERTH" && rawApiData && (
            <Box sx={{ display: { xs: "block", lg: "none" }, mb: 3, p: 2, borderRadius: 3, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: theme.shadows[2] }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: "uppercase", color: "text.secondary", mb: 1.5, fontSize: "0.75rem" }}>Analysis Summary</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <Box>
                  <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.6rem" }}>Primary Block</Typography>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "error.main", fontFamily: "'Inter', monospace" }}>{mapData?.max_block || "-"}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.6rem" }}>Target Berth</Typography>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "success.main", fontFamily: "'Inter', monospace" }}>{rawApiData?.primary_berth?.berth || rawApiData?.recommended_berth || "-"}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.6rem" }}>Total Volume</Typography>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary", fontFamily: "'Inter', monospace" }}>{totalMoves.toLocaleString()} CTN</Typography>
                </Box>
                <Box>
                  <Typography sx={{ display: "block", color: "text.secondary", fontWeight: 800, textTransform: "uppercase", fontSize: "0.6rem" }}>Total Blocks</Typography>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary", fontFamily: "'Inter', monospace" }}>{totalBlocks}</Typography>
                </Box>
                {hazmat > 0 && (
                  <Box>
                    <Typography sx={{ display: "block", color: "error.main", fontWeight: 800, textTransform: "uppercase", fontSize: "0.6rem" }}>Hazmat</Typography>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "error.main", fontFamily: "'Inter', monospace" }}>{hazmat}</Typography>
                  </Box>
                )}
                {reefer > 0 && (
                  <Box>
                    <Typography sx={{ display: "block", color: "info.main", fontWeight: 800, textTransform: "uppercase", fontSize: "0.6rem" }}>Reefer</Typography>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "info.main", fontFamily: "'Inter', monospace" }}>{reefer}</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}
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
        sx={{ position: "absolute", top: { xs: 16, lg: "auto" }, bottom: { xs: "auto", lg: 56 }, right: 16, zIndex: 10, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", boxShadow: 3, p: 0.6, width: 28, height: 28 }}
        size="small"
      >
        <FullscreenRounded fontSize="small" />
      </IconButton>

      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}