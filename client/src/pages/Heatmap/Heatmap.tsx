// cspell:disable
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
import { buildTerminalGeometry } from "./utils/terminalGeometry";
import type {
  CellData,
  VesselHeatmapViewData,
  BerthAnalysis,
  ConflictEntry,
  BlockData,
  ContainerData,
  TerminalLayout,
} from "../../types/heatmap";

// ─── API types ───────────────────────────────────────────────────────────────

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
  layout?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  shapes?: { type: string; name: string; points: { x: number; y: number }[] }[];
  berths?: Record<string, { x: number; y: number }[]>;
  error?: string;
};

// ─── adaptDataForMaps ────────────────────────────────────────────────────────
/**
 * Converts raw API response + parsed XML terminalLayout into the
 * VesselHeatmapViewData the map components consume.
 *
 * Block layout, berth geometry, and recommended berth are all derived
 * purely from the XML terminal layout.  The API response only supplies
 * container counts, hazmat/reefer/oog flags and analysis metadata.
 */
function adaptDataForMaps(
  newData: ApiHeatmapResponse,
  terminalLayout?: TerminalLayout | null,
): VesselHeatmapViewData | null {
  if (!newData || !Array.isArray(newData.blocks)) return null;

  // ── Build geometry from XML ──────────────────────────────────────────────
  const geo = buildTerminalGeometry(terminalLayout ?? null);

  // ── Container count map (blockId → count) ───────────────────────────────
  const blockCounts: Record<string, number> = {};
  newData.blocks.forEach((b) => {
    blockCounts[b.block_id] = b.total_containers || 0;
  });

  // ── Recommended berth (pure geometry: closest berth to densest block) ────
  const targetBerthId = geo.recommendedBerth(blockCounts) ?? "B1";

  // ── Build layout object ──────────────────────────────────────────────────
  //
  //  Priority:
  //   1. XML block geometry  (normalised x/y/w/h from polygon bbox)
  //   2. API-supplied layout (already has normalised w/h)
  //   3. Simple grid fallback
  //
  let layoutObj: Record<
    string,
    { x: number; y: number; w?: number; h?: number }
  > = {};

  if (geo.blocks.length > 0) {
    // Build from XML: use every block that has a matching entry in the API
    // response OR is present in the XML (so the yard always renders fully).
    const allBlockIds = new Set([
      ...newData.blocks.map((b) => b.block_id),
      ...geo.blocks.map((b) => b.id),
    ]);

    allBlockIds.forEach((id) => {
      const xmlBlock = geo.blocks.find((b) => b.id === id);
      if (xmlBlock) {
        layoutObj[id] = {
          x: xmlBlock.cx,
          y: xmlBlock.cy,
          w: xmlBlock.w,
          h: xmlBlock.h,
        };
      } else if (newData.layout?.[id]) {
        layoutObj[id] = newData.layout[id];
      } else {
        // Ghost block not in XML — place off-screen so it doesn't render oddly
        layoutObj[id] = { x: -1, y: -1, w: 0.05, h: 0.025 };
      }
    });
  } else if (newData.layout && Object.keys(newData.layout).length > 0) {
    layoutObj = { ...newData.layout };
  } else {
    // Pure grid fallback
    newData.blocks.forEach((b, idx) => {
      layoutObj[b.block_id] = { x: idx % 3, y: Math.floor(idx / 3) };
    });
  }

  // ── Build berths for map components ──────────────────────────────────────
  //
  //  If XML has berth polygons, use those (keyed by berth id → polygon points).
  //  Otherwise fall back to whatever the API provided.
  //
  let berthsForMaps: Record<string, { x: number; y: number }[]> = {};

  if (geo.berths.length > 0) {
    geo.berths.forEach((berth) => {
      berthsForMaps[berth.id] = berth.polygon.map((p) => ({ x: p.x, y: p.y }));
    });
  } else if (newData.berths && Object.keys(newData.berths).length > 0) {
    berthsForMaps = newData.berths as Record<
      string,
      { x: number; y: number }[]
    >;
  }

  // ── Build shapes for map background ──────────────────────────────────────
  let shapes: {
    type: string;
    name: string;
    points: { x: number; y: number }[];
  }[] = [];

  if (terminalLayout) {
    // Yard boundary
    if (terminalLayout.yard_polygon?.length) {
      shapes.push({
        type: "boundary",
        name: "yard",
        points: (terminalLayout.yard_polygon as [number, number][]).map(
          ([x, y]) => ({ x, y: 1 - y }),
        ),
      });
    }
    // Block outlines
    Object.values(terminalLayout.blocks ?? {}).forEach((b) => {
      if (b.polygon?.length) {
        shapes.push({
          type: "block",
          name: b.name,
          points: (b.polygon as [number, number][]).map(([x, y]) => ({
            x,
            y: 1 - y,
          })),
        });
      }
    });
  } else if (newData.shapes?.length) {
    shapes = newData.shapes;
  }

  // ── Concentration assignment ──────────────────────────────────────────────
  const maxCount = Math.max(
    ...newData.blocks.map((b) => b.total_containers || 0),
    1,
  );

  const validBlocks = [...newData.blocks]
    .filter((b) => (b.total_containers || 0) > 0)
    .sort((a, b) => (b.total_containers || 0) - (a.total_containers || 0));

  const blockConcentrationMap: Record<string, "High" | "Medium" | "Low"> = {};

  const assign = (idx: number, count: number): "High" | "Medium" | "Low" => {
    if (idx === 0) return "High";

    // If the container count is 20% or less of the max block count, it's Low (Green)
    // Otherwise it's Medium (Orange)
    const ratio = count / maxCount;
    if (ratio <= 0.2) return "Low";

    return "Medium";
  };
  validBlocks.forEach((b, idx) => {
    blockConcentrationMap[b.block_id] = assign(idx, b.total_containers || 0);
  });

  // ── Build blocks object ───────────────────────────────────────────────────
  const blocksObj: Record<string, BlockData> = {};
  let computedMaxBlockId: string | null = null;

  Object.keys(layoutObj).forEach((bId) => {
    const b = newData.blocks.find((block) => block.block_id === bId);
    if (b) {
      const count = b.total_containers || 0;
      let intensity = b.intensity;
      if (typeof intensity !== "number" || intensity === 0) {
        intensity = count / maxCount;
      }
      const concentration =
        b.concentration ?? blockConcentrationMap[bId] ?? "Low";

      blocksObj[bId] = {
        count,
        hazardous: b.hazmat_count || 0,
        reefer: b.reefer_count || 0,
        oog: b.oog_count || 0,
        intensity,
        concentration,
        cells: b.cells || [],
        containers: b.containers || [],
      };

      if (count === maxCount && count > 0) computedMaxBlockId = bId;
    } else {
      // Block exists in XML layout but has no container data
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

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalContainersFromBlocks = newData.blocks.reduce(
    (s, b) => s + (b.total_containers || 0),
    0,
  );
  const hazmatTotal = newData.blocks.reduce(
    (s, b) => s + (b.hazmat_count || 0),
    0,
  );
  const reeferTotal = newData.blocks.reduce(
    (s, b) => s + (b.reefer_count || 0),
    0,
  );
  const oogTotal = newData.blocks.reduce((s, b) => s + (b.oog_count || 0), 0);

  return {
    ...newData,
    visit_id: newData.visit_id || "",
    targetBerthId,
    computedMaxBlock: computedMaxBlockId,
    blocks: blocksObj,
    layout: layoutObj,
    summary: {
      hazardous: newData.summary?.hazardous ?? hazmatTotal,
      reefer: newData.summary?.reefer ?? reeferTotal,
      oog: newData.summary?.oog ?? oogTotal,
      total_containers:
        newData.summary?.total_containers ?? totalContainersFromBlocks,
      total_blocks: newData.summary?.total_blocks ?? newData.blocks.length,
      hazmat_total: newData.summary?.hazmat_total ?? hazmatTotal,
      reefer_total: newData.summary?.reefer_total ?? reeferTotal,
      oog_total: newData.summary?.oog_total ?? oogTotal,
    },
    shapes,
    berths: berthsForMaps,
    terminalLayout,
    terminalGeo: geo as unknown as Record<string, unknown>,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Heatmap() {
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [yardInput, setYardInput] = React.useState(
    searchParams.get("yardId") || "",
  );
  const [vesselInput, setVesselInput] = React.useState(
    searchParams.get("vesselId") || "",
  );
  const [containerFile, setContainerFile] = React.useState<File | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [rawApiData, setRawApiData] = React.useState<ApiHeatmapResponse | null>(
    null,
  );
  const [terminalLayout, setTerminalLayout] =
    React.useState<TerminalLayout | null>(null);


  // Re-derive map data whenever raw API data or XML layout changes
  const mapData = React.useMemo(() => {
    if (!rawApiData) return null;
    return adaptDataForMaps(rawApiData, terminalLayout);
  }, [rawApiData, terminalLayout]);

  // Fetch terminal layout from XML on mount
  React.useEffect(() => {
    api
      .get("/terminal-layout")
      .then((res) => {
        if (res.data?.status === "success") {
          setTerminalLayout(res.data.data);
        }
      })
      .catch((err) => console.error("Failed to load terminal layout", err));
  }, []);

  // Re-derive map data whenever raw API data or XML layout changes is handled by useMemo above.

  const [mapView, setMapView] = React.useState<
    "HEATMAP" | "MAP2D" | "3D" | "CONTAINERS"
  >("3D");
  const [overlayView, setOverlayView] = React.useState<"NONE" | "BERTH">(
    "NONE",
  );
  const [inputsOpen, setInputsOpen] = React.useState(true);

  const [toast, setToast] = React.useState<{
    open: boolean;
    message: string;
    severity: "success" | "info" | "warning" | "error";
  }>({ open: false, message: "", severity: "success" });

  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const fetchHeatmap = async (unitIds: string[], vesselId?: string) => {
    try {
      const payload: Record<string, string | string[]> = {};
      if (yardInput.trim()) payload.yard_id = yardInput.trim();
      payload.unit_ids = unitIds;
      if (vesselId) payload.vessel_id = vesselId;

      const response = await api.post("/vessel/heatmap", payload, {
        headers: { "Content-Type": "application/json" },
      });

      const data = response.data;
      if (data.error) {
        setToast({ open: true, message: data.error, severity: "error" });
        setRawApiData(null);
      } else {
        setRawApiData(data);
        setToast({
          open: true,
          message: `Successfully loaded yard analysis`,
          severity: "success",
        });
        setInputsOpen(false);
      }
    } catch (err: unknown) {
      console.error(err);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to load heatmap data";
      setToast({ open: true, message: errorMsg, severity: "error" });
      setRawApiData(null);
    }
  };

  const load = async () => {
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
      let unitIds: string[] = [];
      const text = await containerFile.text();
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          unitIds = parsed;
        } else {
          throw new Error("Not an array");
        }
      } catch {
        setToast({
          open: true,
          message: "Invalid JSON file — expected an array of container IDs.",
          severity: "error",
        });
        setLoading(false);
        return;
      }


      // Because active yard containers no longer have an outbound service assigned,
      // we do not attempt to discover them. We directly use the user-provided vessel input.
      await fetchHeatmap(unitIds, vesselInput.trim() || undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleViewToggle = (
    _e: React.MouseEvent<HTMLElement>,
    next: "HEATMAP" | "MAP2D" | "3D" | "CONTAINERS" | "BERTH" | null,
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
            <BlockIllustrator
              data={mapData}
              targetBerthId={mapData?.targetBerthId || ""}
              loading={loading}
            />
          </Box>
        )}
        {mapView === "MAP2D" && (
          <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <TerminalMap2D
              data={mapData}
              terminalLayout={terminalLayout}
              targetBerthId={mapData?.targetBerthId || ""}
              loading={loading}
            />
          </Box>
        )}
        {mapView === "3D" && (
          <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <TerminalMap3D
              data={mapData}
              terminalLayout={terminalLayout}
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
          bgcolor: "background.paper",
          borderRadius: 1,
          overflow: "hidden",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          width: inputsOpen ? { xs: 200, md: 260 } : "auto",
          border: "1px solid",
          borderColor: theme.palette.divider,
          boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
          display:
            mapView === "CONTAINERS" ? { xs: "none", md: "block" } : "block",
        }}
      >
        {!inputsOpen ? (
          <Box
            sx={{
              px: { xs: 1, md: 1.5 },
              py: { xs: 0.6, md: 1 },
              display: "flex",
              alignItems: "center",
              gap: 1,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
            onClick={() => setInputsOpen(true)}
          >
            <SearchRounded
              sx={{ fontSize: { xs: 16, md: 20 }, color: "primary.main" }}
            />
            <Typography
              variant="body2"
              sx={{
                fontSize: { xs: "0.65rem", md: "0.75rem" },
                fontWeight: 800,
                letterSpacing: 0.5,
              }}
            >
              Heatmap Input
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: { xs: 1, md: 1.8 } }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: { xs: 0.8, md: 1.5 },
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontSize: { xs: "0.7rem", md: "0.875rem" },
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Heatmap Analysis
              </Typography>
              <IconButton
                size="small"
                onClick={() => setInputsOpen(false)}
                sx={{ mr: -0.5 }}
              >
                <CloseRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
            <Stack spacing={{ xs: 0.6, md: 1.2 }}>
              <TextField
                size="small"
                fullWidth
                label="Yard ID"
                value={yardInput}
                onChange={(e) => setYardInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    height: { xs: 30, md: 36 },
                  },
                }}
                slotProps={{
                  htmlInput: { style: { fontSize: "0.8rem" } },
                  inputLabel: { style: { fontSize: "0.8rem" } },
                }}
              />
              <TextField
                size="small"
                fullWidth
                label="Vessel ID / Visit ID"
                value={vesselInput}
                onChange={(e) => setVesselInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    height: { xs: 30, md: 36 },
                  },
                }}
                slotProps={{
                  htmlInput: { style: { fontSize: "0.8rem" } },
                  inputLabel: { style: { fontSize: "0.8rem" } },
                }}
              />
              <Box>
                <Button
                  fullWidth
                  component="label"
                  variant="outlined"
                  startIcon={
                    <UploadFileOutlined sx={{ fontSize: { xs: 14, md: 16 } }} />
                  }
                  sx={{
                    borderRadius: 2,
                    fontSize: { xs: "0.65rem", md: "0.75rem" },
                    py: { xs: 0.2, md: 0.6 },
                    fontWeight: 500,
                    textTransform: "none",
                    justifyContent: "flex-start",
                    color: "text.primary",
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    noWrap
                    sx={{
                      fontSize: { xs: "0.65rem", md: "0.75rem" },
                      maxWidth: { xs: 140, md: 180 },
                    }}
                  >
                    {containerFile
                      ? containerFile.name
                      : "Upload Container List"}
                  </Typography>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept=".txt,.csv,.json"
                    onChange={(e) =>
                      setContainerFile(e.target.files?.[0] || null)
                    }
                  />
                </Button>
                {containerFile && (
                  <Button
                    size="small"
                    onClick={() => {
                      setContainerFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    startIcon={<ClearRounded sx={{ fontSize: 12 }} />}
                    sx={{ mt: 0.25, py: 0, fontSize: "0.65rem" }}
                  >
                    Clear File
                  </Button>
                )}
              </Box>
              <Button
                variant="contained"
                fullWidth
                onClick={load}
                disabled={loading}
                sx={{
                  borderRadius: 2,
                  fontWeight: 800,
                  py: { xs: 0.4, md: 1 },
                  fontSize: { xs: "0.65rem", md: "0.8rem" },
                }}
              >
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
            bgcolor: "background.paper",
            borderRadius: 3,
            px: 1.5,
            py: 0.8,
            display: { xs: "none", lg: "flex" },
            alignItems: "center",
            gap: 2,
            border: "1px solid",
            borderColor: theme.palette.divider,
            boxShadow:
              theme.palette.mode === "dark" ? "none" : theme.shadows[4],
          }}
        >
          <Box>
            <Typography
              sx={{
                display: "block",
                color: "text.secondary",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: "0.58rem",
              }}
            >
              Primary Block
            </Typography>
            <Typography
              sx={{
                fontSize: "0.9rem",
                fontWeight: 900,
                color: "error.main",
                fontFamily: "'Inter', monospace",
              }}
            >
              {mapData?.computedMaxBlock || mapData?.max_block || "-"}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography
              sx={{
                display: "block",
                color: "text.secondary",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: "0.58rem",
              }}
            >
              Target Berth
            </Typography>
            <Typography
              sx={{
                fontSize: "0.9rem",
                fontWeight: 900,
                color: "success.main",
                fontFamily: "'Inter', monospace",
              }}
            >
              {mapData?.targetBerthId || "-"}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography
              sx={{
                display: "block",
                color: "text.secondary",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: "0.58rem",
              }}
            >
              Total Volume
            </Typography>
            <Typography
              sx={{
                fontSize: "0.9rem",
                fontWeight: 900,
                color: "text.primary",
                fontFamily: "'Inter', monospace",
              }}
            >
              {totalMoves.toLocaleString()} CTN
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box>
            <Typography
              sx={{
                display: "block",
                color: "text.secondary",
                fontWeight: 800,
                textTransform: "uppercase",
                fontSize: "0.58rem",
              }}
            >
              Blocks
            </Typography>
            <Typography
              sx={{
                fontSize: "0.9rem",
                fontWeight: 900,
                color: "text.primary",
                fontFamily: "'Inter', monospace",
              }}
            >
              {totalBlocks}
            </Typography>
          </Box>
          {hasSpecial && (
            <>
              <Divider orientation="vertical" flexItem />
              <Stack direction="row" spacing={2}>
                {hazmat > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        display: "block",
                        color: "error.main",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        fontSize: "0.58rem",
                      }}
                    >
                      Hazmat
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: 900,
                        color: "error.main",
                        fontFamily: "'Inter', monospace",
                      }}
                    >
                      {hazmat}
                    </Typography>
                  </Box>
                )}
                {reefer > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        display: "block",
                        color: "info.main",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        fontSize: "0.58rem",
                      }}
                    >
                      Reefer
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: 900,
                        color: "info.main",
                        fontFamily: "'Inter', monospace",
                      }}
                    >
                      {reefer}
                    </Typography>
                  </Box>
                )}
                {oog > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        display: "block",
                        color: "warning.main",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        fontSize: "0.58rem",
                      }}
                    >
                      OOG
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: 900,
                        color: "warning.main",
                        fontFamily: "'Inter', monospace",
                      }}
                    >
                      {oog}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </>
          )}
        </Paper>
      )}

      {/* BOTTOM CENTER: VIEW SWITCHER */}
      <Paper
        elevation={0}
        sx={{
          position: "absolute",
          bottom: { xs: 4, lg: 16 },
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          bgcolor: "background.paper",
          borderRadius: 8,
          p: 0.4,
          border: "1px solid",
          borderColor: theme.palette.divider,
          boxShadow: "none",
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
                borderRadius: 5,
                px: { xs: 1.2, md: 1.8 },
                py: 0.55,
                border: "none",
                fontWeight: 700,
                textTransform: "none",
                color: "text.secondary",
                fontSize: "0.75rem",
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.dark" },
                },
              },
            }}
          >
            <ToggleButton value="HEATMAP">Block Illustrator</ToggleButton>
            <ToggleButton value="MAP2D">2D Heatmap</ToggleButton>
            <ToggleButton value="3D">3D Heatmap</ToggleButton>
            <ToggleButton value="CONTAINERS">Container Positions</ToggleButton>
            <Divider
              flexItem
              orientation="vertical"
              sx={{ mx: 0.5, my: 0.6 }}
            />
            <ToggleButton value="BERTH">Recommended Berth</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: { xs: "block", lg: "none" } }}>
          <Select
            value={overlayView !== "NONE" ? overlayView : mapView}
            onChange={(e) =>
              handleViewToggle(
                e as unknown as React.MouseEvent<HTMLElement>,
                e.target.value as
                  | "HEATMAP"
                  | "MAP2D"
                  | "3D"
                  | "CONTAINERS"
                  | "BERTH",
              )
            }
            size="small"
            sx={{
              minWidth: 140,
              fontSize: "0.65rem",
              fontWeight: 700,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "& .MuiSelect-select": { py: 0.8, px: 1.5, minHeight: "auto" },
            }}
            MenuProps={{
              container: () => document.fullscreenElement || document.body,
              slotProps: {
                paper: {
                  sx: {
                    borderRadius: 2,
                    mt: -1,
                    boxShadow: "none",
                    border: "1px solid",
                    borderColor: "divider",
                  },
                },
              },
              anchorOrigin: { vertical: "top", horizontal: "center" },
              transformOrigin: { vertical: "bottom", horizontal: "center" },
            }}
          >
            <MenuItem
              value="HEATMAP"
              sx={{
                fontSize: "0.65rem",
                fontWeight: 600,
                minHeight: "auto",
                py: 0.8,
              }}
            >
              Block Illustrator
            </MenuItem>
            <MenuItem
              value="MAP2D"
              sx={{
                fontSize: "0.65rem",
                fontWeight: 600,
                minHeight: "auto",
                py: 0.8,
              }}
            >
              2D Heatmap
            </MenuItem>
            <MenuItem
              value="3D"
              sx={{
                fontSize: "0.65rem",
                fontWeight: 600,
                minHeight: "auto",
                py: 0.8,
              }}
            >
              3D Heatmap
            </MenuItem>
            <MenuItem
              value="CONTAINERS"
              sx={{
                fontSize: "0.65rem",
                fontWeight: 600,
                minHeight: "auto",
                py: 0.8,
              }}
            >
              Container Positions
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <MenuItem
              value="BERTH"
              sx={{
                fontSize: "0.65rem",
                fontWeight: 600,
                minHeight: "auto",
                py: 0.8,
              }}
            >
              Recommended Berth
            </MenuItem>
          </Select>
        </Box>
      </Paper>

      {/* BOTTOM SHEET FOR BERTH INTEL */}
      <Drawer
        anchor="bottom"
        open={overlayView !== "NONE"}
        onClose={() => setOverlayView("NONE")}
        ModalProps={{
          container: () => document.fullscreenElement || document.body,
        }}
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

        <Box
          sx={{
            p: { xs: 2, md: 4, lg: 6 },
            pt: 0,
            height: "100%",
            overflowY: "auto",
          }}
        >
          {overlayView === "BERTH" && rawApiData && (
            <Box
              sx={{
                display: { xs: "block", lg: "none" },
                mb: 3,
                p: 2,
                borderRadius: 3,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: theme.shadows[2],
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 800,
                  textTransform: "uppercase",
                  color: "text.secondary",
                  mb: 1.5,
                  fontSize: "0.75rem",
                }}
              >
                Analysis Summary
              </Typography>
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}
              >
                <Box>
                  <Typography
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      fontSize: "0.6rem",
                    }}
                  >
                    Primary Block
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 900,
                      color: "error.main",
                      fontFamily: "'Inter', monospace",
                    }}
                  >
                    {mapData?.computedMaxBlock || mapData?.max_block || "-"}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      fontSize: "0.6rem",
                    }}
                  >
                    Target Berth
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 900,
                      color: "success.main",
                      fontFamily: "'Inter', monospace",
                    }}
                  >
                    {mapData?.targetBerthId || "-"}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      fontSize: "0.6rem",
                    }}
                  >
                    Total Volume
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 900,
                      color: "text.primary",
                      fontFamily: "'Inter', monospace",
                    }}
                  >
                    {totalMoves.toLocaleString()} CTN
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      display: "block",
                      color: "text.secondary",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      fontSize: "0.6rem",
                    }}
                  >
                    Total Blocks
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "1rem",
                      fontWeight: 900,
                      color: "text.primary",
                      fontFamily: "'Inter', monospace",
                    }}
                  >
                    {totalBlocks}
                  </Typography>
                </Box>
                {hazmat > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        display: "block",
                        color: "error.main",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        fontSize: "0.6rem",
                      }}
                    >
                      Hazmat
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "1rem",
                        fontWeight: 900,
                        color: "error.main",
                        fontFamily: "'Inter', monospace",
                      }}
                    >
                      {hazmat}
                    </Typography>
                  </Box>
                )}
                {reefer > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        display: "block",
                        color: "info.main",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        fontSize: "0.6rem",
                      }}
                    >
                      Reefer
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "1rem",
                        fontWeight: 900,
                        color: "info.main",
                        fontFamily: "'Inter', monospace",
                      }}
                    >
                      {reefer}
                    </Typography>
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
        onClick={() =>
          document.fullscreenElement
            ? document.exitFullscreen()
            : wrapperRef.current?.requestFullscreen()
        }
        sx={{
          position: "absolute",
          top: { xs: 16, lg: "auto" },
          bottom: { xs: "auto", lg: 56 },
          right: 16,
          zIndex: 10,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: 3,
          p: 0.6,
          width: 28,
          height: 28,
        }}
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
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
