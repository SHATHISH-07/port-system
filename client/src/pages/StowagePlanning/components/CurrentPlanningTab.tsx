import React, { useState } from "react";
import {
  Box,
  Card,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  alpha,
  useTheme,
  TextField,
  InputAdornment,
  CircularProgress,
  Paper,
  Button,
  Select,
  MenuItem,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { api } from "../../../api/api";
import type {
  StepData,
  OptimizedData,
  VisualizationData,
} from "../../../types/stowage";
import HousekeepingTable from "./HousekeepingTable";
import { CompactRow } from "./CurrentPlanningComponents";

const cardStyles = {
  elevation: 0,
  sx: {
    borderRadius: 3,
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "background.paper",
    overflow: "hidden",
  },
};



interface CurrentPlanningTabProps {
  vesselId: string;
  yardId: string;
  globalFile: File | null;
  globalContainerText: string;
  trigger: number;
  portRotation: string[];
  onPortRotationChange: (rotation: string[]) => void;
  onOpenVisualization: (
    data: VisualizationData,
    rotation: string[],
    loading: boolean,
  ) => void;
  onVisualizationLoadingChange: (loading: boolean) => void;
  onVisualizationDataChange: (data: VisualizationData) => void;
  recomputeTrigger?: number;
  visualizationRefreshTrigger?: number;
  visualizationOpen?: boolean;
  onCloseVisualization?: () => void;
  discoveredServices?: string[];
  onServiceChange?: (newService: string) => void;
}

export default function CurrentPlanningTab({
  vesselId,
  yardId,
  globalFile,
  globalContainerText,
  trigger,
  portRotation,
  onPortRotationChange,
  onOpenVisualization,
  onVisualizationLoadingChange,
  onVisualizationDataChange,
  recomputeTrigger = 0,
  visualizationRefreshTrigger = 0,
  visualizationOpen = false,
  discoveredServices = [],
  onServiceChange,
}: CurrentPlanningTabProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizedData, setOptimizedData] = useState<OptimizedData | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [filterText, setFilterText] = useState("");
  const [loadingVisualization, setLoadingVisualization] = useState(false);

  const executeOptimization = async (overrideRotation?: string[]) => {
    if (!vesselId || (!globalFile && !globalContainerText?.trim())) return null;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("vesselId", vesselId);
      if (yardId) formData.append("yardId", yardId);
      if (globalFile) formData.append("file", globalFile);
      if (globalContainerText?.trim())
        formData.append("containerIds", globalContainerText.trim());
      const rotationToUse = overrideRotation || portRotation;
      if (rotationToUse.length > 0)
        formData.append("portRotation", rotationToUse.join(","));

      const response = await api.post("/stowage/current/planning", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setOptimizedData(response.data);
      if (!overrideRotation && response.data.dischargeSequence) {
        onPortRotationChange(
          response.data.dischargeSequence.map((s: { port: string }) => s.port),
        );
      }
      return response.data;
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to optimize plan.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchAndOpenVisualization = async (rotationOverride?: string[], optDataOverride?: OptimizedData) => {
    const dataToUse = optDataOverride || optimizedData;
    if (!vesselId || !dataToUse) return;
    setLoadingVisualization(true);
    onVisualizationLoadingChange(true);

    try {
      const rotationToUse =
        rotationOverride ||
        (portRotation.length > 0
          ? portRotation
          : dataToUse.dischargeSequence.map(
            (seq: { port: string }) => seq.port,
          ));

      const formData = new FormData();
      if (globalFile) formData.append("file", globalFile);
      formData.append("vesselId", vesselId);
      if (yardId) formData.append("yardId", yardId);
      if (globalContainerText)
        formData.append("containerIds", globalContainerText);
      formData.append("portRotation", rotationToUse.join(","));

      const response = await api.post("/stowage/visualization", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onVisualizationDataChange(response.data);
      // Open the visualization overlay in the parent — passes data + current rotation
      onOpenVisualization(response.data, rotationToUse, false);
    } catch (err) {
      console.error("Failed to fetch visualization", err);
    } finally {
      setLoadingVisualization(false);
      onVisualizationLoadingChange(false);
    }
  };

  React.useEffect(() => {
    if (trigger > 0) {
      setTimeout(() => executeOptimization(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  React.useEffect(() => {
    if (recomputeTrigger > 0 && portRotation.length > 0) {
      // Delay the heavy API calls and React re-renders to allow the Drag-and-Drop
      // animation in the UI to finish smoothly. This creates a true "optimistic" feel.
      const timer = setTimeout(() => {
        executeOptimization(portRotation);
        fetchAndOpenVisualization(portRotation);
      }, 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recomputeTrigger]);

  React.useEffect(() => {
    if (visualizationRefreshTrigger > 0) {
      const run = async () => {
        if (visualizationOpen) {
          setLoadingVisualization(true);
          onVisualizationLoadingChange(true);
        }
        const newData = await executeOptimization([]);
        if (newData && newData.dischargeSequence) {
          const nextRotation = newData.dischargeSequence.map((s: { port: string }) => s.port);
          onPortRotationChange(nextRotation);
          if (visualizationOpen) {
            await fetchAndOpenVisualization(nextRotation, newData);
          }
        } else if (visualizationOpen) {
          setLoadingVisualization(false);
          onVisualizationLoadingChange(false);
        }
      };
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualizationRefreshTrigger]);

  if (!optimizedData && !loading && !error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pt: { xs: 10, md: 20 },
          textAlign: "center",
          opacity: 0.8,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Ready to Optimize
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 380 }}
        >
          Enter a Vessel ID and upload a container list above, then click{" "}
          <strong>Run Optimizer</strong> to generate a stowage plan.
        </Typography>
      </Box>
    );
  }

  if (loading && !optimizedData)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress size={40} thickness={4} />
      </Box>
    );
  if (error)
    return (
      <Typography
        color="error"
        sx={{
          mt: 2,
          p: 2,
          bgcolor: alpha(theme.palette.error.main, 0.1),
          borderRadius: 2,
        }}
      >
        {error}
      </Typography>
    );

  const recs = (optimizedData?.recommendations || []).map(
    (r: StepData, i: number) => ({ ...r, stepIndex: i + 1 }),
  );
  const filteredRecs = recs.filter((r: StepData) =>
    (r.unitId || "").toLowerCase().includes(filterText.toLowerCase()),
  );
  const paginatedRecs = filteredRecs.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const deckCounts = { BELOW_DECK: 0, ABOVE_DECK: 0 };
  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const weightCounts = { LIGHT: 0, MEDIUM: 0, HEAVY: 0 };

  recs.forEach((r: StepData) => {
    if (r.recommendedDeck === "ABOVE_DECK") deckCounts.ABOVE_DECK++;
    if (r.recommendedDeck === "BELOW_DECK") deckCounts.BELOW_DECK++;
    if (riskCounts[r.reshuffleRisk as keyof typeof riskCounts] !== undefined)
      riskCounts[r.reshuffleRisk as keyof typeof riskCounts]++;
    if (
      weightCounts[r.weightCategory as keyof typeof weightCounts] !== undefined
    )
      weightCounts[r.weightCategory as keyof typeof weightCounts]++;
  });

  const deckPie = [
    {
      name: "Top",
      value: deckCounts.ABOVE_DECK,
      c: theme.palette.primary.light,
    },
    {
      name: "Below",
      value: deckCounts.BELOW_DECK,
      c: theme.palette.primary.dark,
    },
  ];
  const riskPie = [
    { name: "High", value: riskCounts.HIGH, c: theme.palette.error.main },
    { name: "Medium", value: riskCounts.MEDIUM, c: theme.palette.warning.main },
    { name: "Low", value: riskCounts.LOW, c: theme.palette.success.main },
  ];

  const equipDist = optimizedData?.equipmentClassDistribution || [];
  const equipBar = equipDist.map((e: { equipmentClass: string; count: number }) => ({
    name: e.equipmentClass || "Unknown",
    Count: e.count,
  }));

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        p: 1,
        position: "relative",
        animation: "fadeIn 0.6s ease-out forwards",
        "@keyframes fadeIn": {
          from: { opacity: 0, transform: "translateY(20px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {loading && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: alpha(theme.palette.background.default, 0.7),
            backdropFilter: "blur(4px)",
            borderRadius: 4,
          }}
        >
          <CircularProgress size={60} thickness={4} />
        </Box>
      )}

      {/* Top Center Vessel Toggler for Dashboard */}
      {discoveredServices.length > 1 && !visualizationOpen && (
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
          <Paper
            elevation={0}
            sx={{
              bgcolor: "background.paper",
              borderRadius: 8,
              p: 0.5,
              border: "1px solid",
              borderColor: theme.palette.divider,
              display: "flex",
              alignItems: "center",
              gap: 1,
              boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[1],
            }}
          >
            <Select
              value={vesselId}
              onChange={(e) => onServiceChange?.(e.target.value)}
              size="small"
              disabled={loading}
              sx={{
                borderRadius: 5,
                fontSize: "0.8rem",
                fontWeight: 700,
                height: 32,
                color: "text.secondary",
                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                "&:hover": { bgcolor: alpha(theme.palette.action.hover, 0.05) },
                "& .MuiSelect-select": { py: 0.5, px: 2, minHeight: "auto" },
              }}
            >
              {discoveredServices.map((service) => (
                <MenuItem key={service} value={service} sx={{ fontSize: "0.8rem", fontWeight: 700 }}>
                  {service}
                </MenuItem>
              ))}
            </Select>
          </Paper>
        </Box>
      )}

      {/* Hero - Single Unified Stats Card */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              border: "1px solid",
              borderColor: alpha(theme.palette.primary.main, 0.15),
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.7)} 100%)`,
              backdropFilter: "blur(20px)",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "flex-start", md: "center" },
              justifyContent: "space-between",
              gap: 4,
              boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.05)}`,
            }}
          >
            {/* Left Side: Main Total Planned */}
            <Box sx={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: { md: "30%" } }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "1.2rem", color: "text.secondary", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {vesselId}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main", mb: 0.5, display: "block", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Total Planned Moves
                </Typography>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Typography sx={{ fontWeight: 900, letterSpacing: "-0.03em", fontSize: { xs: "3.5rem", md: "4.5rem" }, lineHeight: 1, color: "text.primary" }}>
                    {recs.length}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: "text.secondary", opacity: 0.7 }}>
                    units
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 2, display: "block", color: "text.secondary", fontWeight: 500, lineHeight: 1.5 }}>
                  Based on AI optimization engine.
                </Typography>
              </Box>
            </Box>

            {/* Divider for Desktop */}
            <Box sx={{ display: { xs: "none", md: "block" }, width: "1px", height: "140px", bgcolor: alpha(theme.palette.divider, 0.8), zIndex: 1 }} />
            {/* Divider for Mobile */}
            <Box sx={{ display: { xs: "block", md: "none" }, height: "1px", width: "100%", bgcolor: alpha(theme.palette.divider, 0.8), zIndex: 1 }} />

            {/* Right Side: Sub Metrics Grid */}
            <Box sx={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: { xs: 3, md: 5 }, flex: "1 1 auto", pt: { xs: 1, md: 0 } }}>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Above Deck
                </Typography>
                <Typography sx={{ fontSize: "2rem", fontWeight: 900, color: "primary.main", mt: 0.5, lineHeight: 1 }}>
                  {deckCounts.ABOVE_DECK}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1, fontWeight: 500 }}>
                  Stowed units
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Below Deck
                </Typography>
                <Typography sx={{ fontSize: "2rem", fontWeight: 900, color: "text.primary", mt: 0.5, lineHeight: 1 }}>
                  {deckCounts.BELOW_DECK}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1, fontWeight: 500 }}>
                  Stowed units
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Heavy / Med
                </Typography>
                <Typography sx={{ fontSize: "2rem", fontWeight: 900, color: "warning.main", mt: 0.5, lineHeight: 1 }}>
                  {weightCounts.HEAVY}<span style={{ opacity: 0.5, fontSize: "1.2rem", margin: "0 2px" }}>/</span>{weightCounts.MEDIUM}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1, fontWeight: 500 }}>
                  Container breakdown
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  High Risk
                </Typography>
                <Typography sx={{ fontSize: "2rem", fontWeight: 900, color: "error.main", mt: 0.5, lineHeight: 1 }}>
                  {riskCounts.HIGH}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1, fontWeight: 500 }}>
                  Reshuffle risk
                </Typography>
              </Box>
            </Box>

            {/* Background Decoration */}
            <Box
              sx={{
                position: "absolute",
                right: { xs: "-10%", md: "0%" },
                top: { xs: "-10%", md: "50%" },
                transform: { md: "translateY(-50%)" },
                width: { xs: 200, md: 350 },
                height: { xs: 200, md: 350 },
                borderRadius: "50%",
                background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 70%)`,
                zIndex: 0,
                pointerEvents: "none",
              }}
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }} sx={{ minWidth: 0 }}>
          <Card
            {...cardStyles}
            sx={{ ...cardStyles.sx, p: 2.5, height: 300, position: "relative", minWidth: 0 }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 1 }}
            >
              DECK DISTRIBUTION
            </Typography>
            <ResponsiveContainer width="99%" height={240}>
              <PieChart>
                <Pie
                  data={deckPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={65}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={2}
                >
                  {deckPie.map((e, i) => (
                    <Cell key={i} fill={e.c} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                  itemStyle={{ color: theme.palette.text.primary }}
                />
                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    paddingTop: "10px",
                    color: theme.palette.text.secondary,
                  }}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ minWidth: 0 }}>
          <Card
            {...cardStyles}
            sx={{ ...cardStyles.sx, p: 2.5, height: 300, position: "relative", minWidth: 0 }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 1 }}
            >
              RESHUFFLE RISK
            </Typography>
            <ResponsiveContainer width="99%" height={240}>
              <PieChart>
                <Pie
                  data={riskPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={65}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={2}
                >
                  {riskPie.map((e, i) => (
                    <Cell key={i} fill={e.c} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                  itemStyle={{ color: theme.palette.text.primary }}
                />
                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    paddingTop: "10px",
                    paddingBottom: "10px",
                    color: theme.palette.text.secondary,
                  }}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }} sx={{ minWidth: 0 }}>
          <Card
            {...cardStyles}
            sx={{ ...cardStyles.sx, p: 2.5, height: 300, position: "relative", minWidth: 0 }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 1 }}
            >
              EQUIPMENT TYPES
            </Typography>
            <ResponsiveContainer width="99%" height={240}>
              <BarChart layout="vertical" data={equipBar} margin={{ top: 20, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={alpha(theme.palette.divider, 0.5)} />
                <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" fontSize={10} width={90} tickLine={false} axisLine={false} tick={{ fontWeight: 600 }} stroke={theme.palette.text.secondary} />
                <Tooltip
                  cursor={{ fill: alpha(theme.palette.primary.main, 0.05) }}
                  contentStyle={{
                    fontSize: '0.75rem',
                    borderRadius: '8px',
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    color: theme.palette.text.primary
                  }}
                />
                <Bar dataKey="Count" fill={theme.palette.info.main} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Route + Insights */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 4,
          position: "relative",
          overflow: "hidden",
          p: { xs: 3, md: 5 },
          borderRadius: 4,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.background.paper, 0.8)} 100%)`,
          border: "1px solid",
          borderColor: alpha(theme.palette.primary.main, 0.1),
          boxShadow: `inset 0 2px 20px ${alpha("#000", 0.02)}`,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: -150,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${alpha(theme.palette.info.main, 0.08)} 0%, transparent 70%)`,
            zIndex: 0,
          }}
        />

        {optimizedData?.dischargePortGrouping &&
          optimizedData.dischargePortGrouping.length > 0 && (
            <Box
              sx={{
                flex: 1,
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  mb: 3,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 900,
                      fontSize: "1.2rem",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Port of Discharge Grouping
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 600,
                      mt: 0.5,
                      display: "block",
                    }}
                  >
                    Container distribution per destination port
                  </Typography>
                </Box>
                {loading && <CircularProgress size={20} />}
              </Box>

              <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                  border: "1px solid",
                  borderColor: alpha(theme.palette.divider, 0.5),
                  bgcolor: alpha(theme.palette.background.paper, 0.5),
                  borderRadius: 2,
                  overflowX: "auto",
                }}
              >
                <Table sx={{ minWidth: 300 }}>
                  <TableHead
                    sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}
                  >
                    <TableRow>
                      <TableCell
                        sx={{
                          fontWeight: 800,
                          fontSize: "0.75rem",
                          color: "text.secondary",
                          textTransform: "uppercase",
                        }}
                      >
                        Port
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 800,
                          fontSize: "0.75rem",
                          color: "text.secondary",
                          textTransform: "uppercase",
                        }}
                      >
                        Units
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 800,
                          fontSize: "0.75rem",
                          color: "text.secondary",
                          textTransform: "uppercase",
                        }}
                      >
                        Share
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {optimizedData.dischargePortGrouping.map(
                      (group: {
                        port: string;
                        count: number;
                        percentage: number;
                      }) => (
                        <TableRow
                          key={group.port}
                          sx={{
                            "&:last-child td, &:last-child th": { border: 0 },
                          }}
                        >
                          <TableCell
                            sx={{
                              fontWeight: 700,
                              color: "text.primary",
                              letterSpacing: 0.5,
                            }}
                          >
                            {group.port}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 800,
                              color: "primary.main",
                              fontSize: "1.05rem",
                            }}
                          >
                            {group.count}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ fontWeight: 600, color: "text.secondary" }}
                          >
                            {group.percentage}%
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

        <Box
          sx={{
            display: { xs: "none", md: "block" },
            width: "1px",
            bgcolor: alpha(theme.palette.divider, 0.8),
            my: 2,
            zIndex: 1,
          }}
        />

        {optimizedData?.strategyInsights &&
          optimizedData.strategyInsights.length > 0 && (
            <Box
              sx={{
                flex: 1,
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <Box sx={{ mb: 3 }}>
                <Typography
                  sx={{
                    fontWeight: 900,
                    fontSize: "1.2rem",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Yard Strategy
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontWeight: 600,
                    mt: 0.5,
                    display: "block",
                  }}
                >
                  Algorithmic insights for container retrieval
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {optimizedData.strategyInsights.map(
                  (insight: string, idx: number) => (
                    <Box
                      key={idx}
                      sx={{
                        display: "flex",
                        gap: 2,
                        alignItems: "flex-start",
                        p: 2.5,
                        borderRadius: 3,
                        bgcolor: alpha(theme.palette.background.paper, 0.6),
                        border: "1px solid",
                        borderColor: alpha(theme.palette.info.main, 0.15),
                        backdropFilter: "blur(10px)",
                        transition: "transform 0.2s",
                        "&:hover": {
                          transform: "translateX(4px)",
                          borderColor: alpha(theme.palette.info.main, 0.3),
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: 1.5,
                          bgcolor: alpha(theme.palette.info.main, 0.1),
                          color: "info.main",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontWeight: 900,
                          fontSize: "0.8rem",
                        }}
                      >
                        {idx + 1}
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.primary",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          lineHeight: 1.6,
                        }}
                      >
                        {insight}
                      </Typography>
                    </Box>
                  ),
                )}
              </Box>
            </Box>
          )}
      </Box>

      {/* Table */}
      <Card {...cardStyles}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", md: "center" },
            gap: 2,
            p: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <Typography
            variant="overline"
            color="primary"
            sx={{ fontWeight: 800, letterSpacing: 1 }}
          >
            Load Sequence Operations
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "stretch", sm: "center" } }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => fetchAndOpenVisualization()}
              disabled={loadingVisualization || !optimizedData}
              startIcon={
                loadingVisualization ? (
                  <CircularProgress size={14} color="inherit" />
                ) : undefined
              }
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                textTransform: "none",
                px: 2,
                py: 0.75,
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}`,
              }}
            >
              {loadingVisualization ? "Loading..." : "Visualize Deck"}
            </Button>
            <TextField
              size="small"
              placeholder="Search Unit ID..."
              value={filterText}
              onChange={(e) => {
                setFilterText(e.target.value);
                setPage(0);
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="primary" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                width: 260,
                "& .MuiOutlinedInput-root": {
                  height: 36,
                  fontSize: "0.8rem",
                  bgcolor: "background.paper",
                  borderRadius: 2,
                },
              }}
            />
          </Box>
        </Box>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    bgcolor: "background.default",
                    fontWeight: 800,
                    fontSize: "0.7rem",
                    color: "text.secondary",
                    textTransform: "uppercase",
                    py: 1.5,
                    borderBottom: `2px solid ${theme.palette.divider}`,
                  },
                }}
              >
                <TableCell width={40} />
                <TableCell>Seq</TableCell>
                <TableCell>Unit ID</TableCell>
                <TableCell>Dest Port</TableCell>
                <TableCell>Weight</TableCell>
                <TableCell>Recommended Deck</TableCell>
                <TableCell>Risk</TableCell>
                <TableCell align="right">Priority</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedRecs.map((step: StepData) => (
                <CompactRow key={step.unitId} step={step} theme={theme} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[15, 30, 50]}
          component="div"
          count={filteredRecs.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          sx={{
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: alpha(theme.palette.primary.main, 0.01),
            ".MuiTablePagination-toolbar": {
              minHeight: 48,
              color: "text.primary",
            },
          }}
        />
      </Card>

      {/* Embedded Housekeeping Plan (Pre-Consolidation) */}
      <Card {...cardStyles}>
        <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "text.primary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Yard Preparation Plan
          </Typography>
        </Box>
        <Box sx={{ p: 3 }}>
          <HousekeepingTable data={optimizedData?.housekeepingPlan || null} />
        </Box>
      </Card>

    </Box>
  );
}
