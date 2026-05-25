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
  Collapse,
  IconButton,
  alpha,
  useTheme,
  TextField,
  InputAdornment,
  CircularProgress,
  Paper,
  Button,
  type Theme,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
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
import MetricCard from "../../StayTimeAnalysis/components/MetricCard";
import type {
  StepData,
  OptimizedData,
  VisualizationData,
} from "../../../types/stowage";

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

const StatusChip = ({ label, theme }: { label: string; theme: Theme }) => {
  let color = theme.palette.success.main;
  if (label === "HIGH" || label === "HEAVY") color = theme.palette.error.main;
  if (label === "MEDIUM") color = theme.palette.warning.main;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: alpha(color, 0.15),
        color,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        fontSize: "0.65rem",
        fontWeight: 800,
        letterSpacing: 0.5,
        border: `1px solid ${alpha(color, 0.2)}`,
      }}
    >
      {label}
    </Box>
  );
};

function CompactRow({ step, theme }: { step: StepData; theme: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        sx={{
          "& > *": {
            borderBottom: "1px solid",
            borderColor: alpha(theme.palette.divider, 0.5),
            py: 0.75,
          },
          transition: "background-color 0.2s ease",
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05) },
        }}
      >
        <TableCell padding="checkbox">
          <IconButton
            size="small"
            onClick={() => setOpen(!open)}
            sx={{ color: open ? "primary.main" : "text.secondary" }}
          >
            {open ? (
              <KeyboardArrowUpIcon fontSize="small" />
            ) : (
              <KeyboardArrowDownIcon fontSize="small" />
            )}
          </IconButton>
        </TableCell>
        <TableCell
          sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary" }}
        >
          {String(step.stepIndex).padStart(2, "0")}
        </TableCell>
        <TableCell
          sx={{
            fontFamily: "monospace",
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "primary.main",
          }}
        >
          {step.unitId}
        </TableCell>
        <TableCell
          sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.primary" }}
        >
          {step.portOfDischarge}
        </TableCell>
        <TableCell>
          <StatusChip label={step.weightCategory || ""} theme={theme} />
        </TableCell>
        <TableCell
          sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.primary" }}
        >
          {step.recommendedDeck}{" "}
          <Typography
            component="span"
            variant="caption"
            sx={{ fontWeight: 800, color: "text.secondary", ml: 0.5 }}
          >
            {step.recommendedBay && step.recommendedRow ? (
              `B${step.recommendedBay} R${step.recommendedRow} T${step.recommendedTier}`
            ) : (
              `T${step.recommendedTier}`
            )}
          </Typography>
        </TableCell>
        <TableCell>
          <StatusChip label={step.reshuffleRisk || ""} theme={theme} />
        </TableCell>
        <TableCell
          align="right"
          sx={{ fontSize: "0.75rem", fontWeight: 800, color: "text.primary" }}
        >
          {step.loadingPriority}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell
          style={{ paddingBottom: 0, paddingTop: 0, border: "none" }}
          colSpan={8}
        >
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box
              sx={{
                m: 1,
                mb: 2,
                p: 2,
                bgcolor: "background.paper",
                boxShadow: theme.shadows[2],
                borderLeft: `3px solid ${theme.palette.primary.main}`,
                borderRadius: 2,
              }}
            >
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    Reasoning
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: "0.8rem", color: "text.secondary" }}
                  >
                    {step.recommendedReason}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    Yard Origin
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "text.primary",
                    }}
                  >
                    Block {step.currentYardBlock}{" "}
                    <span
                      style={{
                        color: theme.palette.text.disabled,
                        margin: "0 4px",
                      }}
                    >
                      |
                    </span>{" "}
                    {step.currentSlotPosition}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    Outbound
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "text.primary",
                    }}
                  >
                    {step.actualOutboundCarrierVisitId || "TBD"}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

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
  visualizationOpen?: boolean;
  onCloseVisualization?: () => void;
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
    if (!vesselId || (!globalFile && !globalContainerText?.trim())) return;
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
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to optimize plan.",
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchAndOpenVisualization = async (rotationOverride?: string[]) => {
    if (!vesselId || !optimizedData) return;
    setLoadingVisualization(true);
    onVisualizationLoadingChange(true);

    try {
      const rotationToUse =
        rotationOverride ||
        (portRotation.length > 0
          ? portRotation
          : optimizedData.dischargeSequence.map(
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
      setTimeout(() => {
        executeOptimization(portRotation);
        fetchAndOpenVisualization(portRotation);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recomputeTrigger]);

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
  const weightBar = [
    { name: "Heavy", Count: weightCounts.HEAVY, c: theme.palette.error.main },
    {
      name: "Medium",
      Count: weightCounts.MEDIUM,
      c: theme.palette.warning.main,
    },
    { name: "Light", Count: weightCounts.LIGHT, c: theme.palette.success.main },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        p: 1,
        animation: "fadeIn 0.6s ease-out forwards",
        "@keyframes fadeIn": {
          from: { opacity: 0, transform: "translateY(20px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {/* Hero */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "1px solid",
              borderColor: alpha(theme.palette.primary.main, 0.15),
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.5)} 100%)`,
              backdropFilter: "blur(10px)",
              position: "relative",
              overflow: "hidden",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                height: "100%",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ mb: 2 }}>
                <Typography
                  sx={{
                    fontWeight: 900,
                    fontSize: "1.5rem",
                    color: "text.primary",
                  }}
                >
                  {vesselId}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 800,
                    color: "primary.main",
                    mb: 0.5,
                    display: "block",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Total Planned Moves
                </Typography>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Typography
                    sx={{
                      fontWeight: 900,
                      letterSpacing: "-0.03em",
                      fontSize: { xs: "2.5rem", md: "3.5rem" },
                      lineHeight: 1,
                    }}
                  >
                    {recs.length}
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: "text.secondary",
                      opacity: 0.5,
                    }}
                  >
                    units
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    mt: 1,
                    display: "block",
                    color: "text.secondary",
                    fontWeight: 500,
                  }}
                >
                  Based on AI optimization engine.
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                position: "absolute",
                right: -30,
                bottom: -30,
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
                zIndex: 0,
              }}
            />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <Grid container spacing={2} sx={{ height: "100%" }}>
            <Grid size={{ xs: 6 }}>
              <MetricCard
                title="Above Deck"
                value={deckCounts.ABOVE_DECK}
                subtitle="Stowed units"
                accent="primary"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <MetricCard
                title="Below Deck"
                value={deckCounts.BELOW_DECK}
                subtitle="Stowed units"
                accent="default"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <MetricCard
                title="Heavy / Medium"
                value={`${weightCounts.HEAVY} / ${weightCounts.MEDIUM}`}
                subtitle="Container breakdown"
                accent="warning"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <MetricCard
                title="High Risk"
                value={riskCounts.HIGH}
                subtitle="Reshuffle risk"
                accent="error"
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            {...cardStyles}
            sx={{ ...cardStyles.sx, p: 2.5, height: 260, position: "relative" }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 1 }}
            >
              DECK DISTRIBUTION
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
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
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            {...cardStyles}
            sx={{ ...cardStyles.sx, p: 2.5, height: 260, position: "relative" }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 1 }}
            >
              RESHUFFLE RISK
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
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
                    color: theme.palette.text.secondary,
                  }}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            {...cardStyles}
            sx={{ ...cardStyles.sx, p: 2.5, height: 260, position: "relative" }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 800, letterSpacing: 1 }}
            >
              WEIGHT BANDS
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart
                data={weightBar}
                margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={alpha(theme.palette.divider, 0.5)}
                />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontWeight: 600 }}
                  stroke={theme.palette.text.secondary}
                />
                <YAxis
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  stroke={theme.palette.text.secondary}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                  cursor={{ fill: alpha(theme.palette.text.primary, 0.03) }}
                />
                <Bar dataKey="Count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {weightBar.map((e, i) => (
                    <Cell key={i} fill={e.c} />
                  ))}
                </Bar>
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
                }}
              >
                <Table>
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
            justifyContent: "space-between",
            alignItems: "center",
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
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
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
        <TableContainer>
          <Table size="small">
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
    </Box>
  );
}
