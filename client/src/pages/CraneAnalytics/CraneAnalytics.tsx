import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Skeleton,
  Alert,
  useTheme,
  alpha,
  TablePagination,
} from "@mui/material";
import { api } from "../../api/api";
import type { CranePerformanceResponse } from "../../types/vessel";
import CraneFilterForm from "./components/CraneFilterForm";

interface ExtendedCraneResponse extends CranePerformanceResponse {
  available_cranes?: string[];
  selected_crane?: string | null;
  yard_stats?: Array<{
    terminal_name: string;
    total_system_moves: number;
    active_cranes_count: number;
    unique_vessel_visits: number;
    gross_terminal_mph: number;
    avg_crane_productivity: number;
  }>;
  move_kind_distribution?: Record<string, number>;
}

// ── Reusable Components ────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
      <Box
        sx={{
          width: 3,
          height: 18,
          borderRadius: 4,
          bgcolor: theme.palette.primary.main,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "text.secondary",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  accent = "primary",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: "primary" | "success" | "warning" | "error";
}) {
  const theme = useTheme();
  const color = theme.palette[accent].main;

  return (
    <Box
      sx={{
        p: "22px 24px",
        borderRadius: 3,
        bgcolor: alpha(theme.palette.background.paper, 0.4),
        border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
        backdropFilter: "blur(10px)",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: alpha(color, 0.3),
          transform: "translateY(-2px)",
          boxShadow: `0 8px 20px ${alpha(color, 0.08)}`,
        },
      }}
    >
      <Typography
        sx={{
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          mb: 1.5,
          display: "block",
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: "2rem",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "text.primary",
          lineHeight: 1,
          mb: subtitle ? 1 : 0,
        }}
      >
        {value}
      </Typography>
      {subtitle && (
        <Typography
          sx={{
            fontSize: "0.7rem",
            fontWeight: 600,
            color: alpha(color, 0.8),
            mt: 0.75,
          }}
        >
          {subtitle}
        </Typography>
      )}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 3,
          bgcolor: alpha(color, 0.1),
          "&::after": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "38%",
            bgcolor: color,
            borderRadius: 2,
          },
        }}
      />
    </Box>
  );
}

function RatingChip({ rating }: { rating: string }) {
  const theme = useTheme();
  const map: Record<string, { color: string; bg: string }> = {
    Optimal: {
      color: theme.palette.success.main,
      bg: alpha(theme.palette.success.main, 0.1),
    },
    Satisfactory: {
      color: theme.palette.warning.main,
      bg: alpha(theme.palette.warning.main, 0.1),
    },
    "Below Target": {
      color: theme.palette.error.main,
      bg: alpha(theme.palette.error.main, 0.1),
    },
  };
  const style = map[rating] ?? {
    color: theme.palette.text.secondary,
    bg: alpha(theme.palette.divider, 0.1),
  };

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        borderRadius: "6px",
        bgcolor: style.bg,
        border: `1px solid ${alpha(style.color, 0.2)}`,
      }}
    >
      <Box
        sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: style.color }}
      />
      <Typography
        sx={{
          fontSize: "0.62rem",
          fontWeight: 700,
          color: style.color,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {rating}
      </Typography>
    </Box>
  );
}

function TerminalBadge({ id }: { id: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "inline-flex",
        px: 1.25,
        py: 0.4,
        borderRadius: "6px",
        border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
        bgcolor: alpha(theme.palette.background.paper, 0.4),
      }}
    >
      <Typography
        sx={{
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "text.secondary",
          letterSpacing: "0.1em",
          fontFamily: "monospace",
        }}
      >
        {id.toUpperCase()}
      </Typography>
    </Box>
  );
}

const thCellSx = (theme: ReturnType<typeof useTheme>) => ({
  fontWeight: 700,
  fontSize: "0.65rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "text.secondary",
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
  py: 1.75,
  px: 2.5,
  bgcolor: "transparent",
  whiteSpace: "nowrap" as const,
});

const tdCellSx = (theme: ReturnType<typeof useTheme>) => ({
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.06)}`,
  py: 1.5,
  px: 2.5,
});

// ── Main Component ─────────────────────────────────────────────────────────

export default function CraneAnalytics() {
  const theme = useTheme();
  const [data, setData] = useState<ExtendedCraneResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [craneId, setCraneId] = useState<string>("");
  const [days, setDays] = useState<string>("30");
  const [availableCranes, setAvailableCranes] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const rowsPerPage = 10;

  const fetchData = useCallback(
    (id?: string, windowDays?: string) => {
      setLoading(true);
      setPage(0);
      const params: Record<string, string> = { limit: "1000" };
      if (id) params.craneId = id;
      if (windowDays) params.days = windowDays;

      api
        .get<ExtendedCraneResponse>("/crane/crane-performance", { params })
        .then((r) => {
          setData(r.data);
          if (r.data.available_cranes)
            setAvailableCranes(r.data.available_cranes);
        })
        .catch(() =>
          setError(
            "Operational data unreachable. Verify terminal connectivity.",
          ),
        )
        .finally(() => setLoading(false));
    },
    [days],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClear = () => {
    setCraneId("");
    fetchData("", days);
  };

  const selectedStat =
    craneId && data?.crane_stats
      ? data.crane_stats.find((s) => s.crane_id === craneId)
      : null;

  const visitRows = data?.visit_crane_allocation ?? [];
  const statRows = data?.crane_stats ?? [];
  const activeRows = craneId ? visitRows : statRows;
  const paginatedRows = activeRows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Filter Bar ── */}
      <Box
        sx={{
          px: { xs: 3, md: 5 },
          py: 3,
          bgcolor: "background.default",
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <CraneFilterForm
          craneId={craneId}
          onCraneChange={(val) => {
            setCraneId(val);
            fetchData(val, days);
          }}
          availableCranes={availableCranes}
          days={days}
          onDaysChange={setDays}
          onClear={handleClear}
          loading={loading}
        />
      </Box>

      {/* ── Error ── */}
      {error && (
        <Box sx={{ px: { xs: 3, md: 5 }, pt: 2 }}>
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setError(null)}
            sx={{
              borderRadius: 2,
              bgcolor: theme.palette.error.main,
              boxShadow: `0 4px 16px ${alpha(theme.palette.error.main, 0.2)}`,
            }}
          >
            {error}
          </Alert>
        </Box>
      )}

      {/* ── Content ── */}
      <Box sx={{ p: { xs: 3, md: 5 }, flex: 1 }}>
        {/* Loading skeletons */}
        {loading && (
          <Grid container spacing={2.5} sx={{ mb: 4 }}>
            {[...Array(4)].map((_, i) => (
              <Grid item xs={12} sm={6} lg={3} key={i}>
                <Skeleton
                  variant="rectangular"
                  height={110}
                  sx={{
                    borderRadius: 3,
                    bgcolor: alpha(theme.palette.divider, 0.08),
                  }}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Empty state */}
        {!data && !loading && (
          <Box
            sx={{
              height: "55vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 1,
              }}
            >
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  border: `2px solid ${alpha(theme.palette.text.primary, 0.15)}`,
                  borderRadius: 1,
                }}
              />
            </Box>
            <Typography
              sx={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "text.secondary",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              No Data Selected
            </Typography>
            <Typography
              sx={{
                fontSize: "0.82rem",
                color: "text.disabled",
                maxWidth: 340,
                lineHeight: 1.7,
              }}
            >
              Select a crane ID or run analytics to view terminal performance
              data.
            </Typography>
          </Box>
        )}

        {data && !loading && (
          <Box>
            {/* ── Global KPIs ── */}
            {!craneId && (
              <Box sx={{ mb: 5 }}>
                <SectionLabel label="Global Performance" />
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6} lg={3}>
                    <MetricCard
                      title="Total System Moves"
                      value={(data.summary?.total_moves ?? 0).toLocaleString()}
                      subtitle="Raw terminal throughput"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} lg={3}>
                    <MetricCard
                      title="Effective Moves"
                      value={(
                        data.summary?.effective_moves ?? 0
                      ).toLocaleString()}
                      subtitle="Valid operational cycles"
                      accent="success"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} lg={3}>
                    <MetricCard
                      title="Active Assets"
                      value={data.summary?.active_cranes ?? 0}
                      subtitle="Cranes deployed in window"
                      accent="warning"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} lg={3}>
                    <MetricCard
                      title="Anomaly Rate"
                      value={`${(
                        (data.summary?.anomaly_rate ?? 0) * 100
                      ).toFixed(1)}%`}
                      subtitle="Flagged for review"
                      accent="error"
                    />
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* ── Asset Deep Dive ── */}
            {craneId && selectedStat && (
              <Box sx={{ mb: 5 }}>
                <SectionLabel label={`Asset — ${craneId}`} />
                <Box
                  sx={{
                    p: "24px 28px",
                    borderRadius: 3,
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    bgcolor: alpha(theme.palette.background.paper, 0.4),
                    backdropFilter: "blur(10px)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontSize: "1.6rem",
                        fontWeight: 800,
                        letterSpacing: "-0.02em",
                        mb: 1,
                      }}
                    >
                      {craneId}
                    </Typography>
                    <RatingChip rating={selectedStat.productivity_rating} />
                  </Box>

                  <Box
                    sx={{
                      width: 1,
                      height: 52,
                      bgcolor: alpha(theme.palette.divider, 0.12),
                      display: { xs: "none", md: "block" },
                    }}
                  />

                  {[
                    {
                      label: "Productivity",
                      value: selectedStat.moves_per_hour.toFixed(1),
                      unit: "MPH",
                      color: theme.palette.primary.main,
                    },
                    {
                      label: "Avg Cycle",
                      value: selectedStat.avg_cycle_minutes.toFixed(1),
                      unit: "MIN",
                      color: theme.palette.text.secondary,
                    },
                    {
                      label: "Restow",
                      value: `${(
                        (selectedStat.restow_ratio ?? 0) * 100
                      ).toFixed(1)}%`,
                      unit: "",
                      color: theme.palette.error.main,
                    },
                    {
                      label: "Visits Active",
                      value: `${
                        data.visit_crane_allocation.filter((v) =>
                          v.cranes_used.includes(craneId),
                        ).length
                      }`,
                      unit: "",
                      color: theme.palette.success.main,
                    },
                  ].map((s) => (
                    <Box key={s.label}>
                      <Typography
                        sx={{
                          fontSize: "0.62rem",
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          color: "text.secondary",
                          textTransform: "uppercase",
                          mb: 0.75,
                        }}
                      >
                        {s.label}
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 0.5,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "1.4rem",
                            fontWeight: 800,
                            color: "text.primary",
                            lineHeight: 1,
                          }}
                        >
                          {s.value}
                        </Typography>
                        {s.unit && (
                          <Typography
                            sx={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: s.color,
                            }}
                          >
                            {s.unit}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* ── Terminal Efficiency ── */}
            {!craneId && data.yard_stats && data.yard_stats.length > 0 && (
              <Box sx={{ mb: 5 }}>
                <SectionLabel label="Terminal Efficiency" />
                <Grid container spacing={2.5}>
                  {data.yard_stats.map((y) => (
                    <Grid item xs={12} md={6} key={y.terminal_name}>
                      <Box
                        sx={{
                          p: "20px 24px",
                          borderRadius: 3,
                          border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.1,
                          )}`,
                          bgcolor: alpha(theme.palette.background.paper, 0.4),
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s ease",
                          "&:hover": {
                            borderColor: alpha(theme.palette.primary.main, 0.2),
                            transform: "translateY(-2px)",
                            boxShadow: `0 6px 16px ${alpha(
                              theme.palette.primary.main,
                              0.06,
                            )}`,
                          },
                        }}
                      >
                        <Box>
                          <Typography
                            sx={{ fontSize: "1rem", fontWeight: 700, mb: 0.75 }}
                          >
                            {y.terminal_name}
                          </Typography>
                          <Box sx={{ display: "flex", gap: 2 }}>
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "text.secondary",
                              }}
                            >
                              {y.active_cranes_count} assets
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "text.secondary",
                              }}
                            >
                              {y.unique_vessel_visits} visits
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography
                            sx={{
                              fontSize: "1.8rem",
                              fontWeight: 800,
                              color: "primary.main",
                              letterSpacing: "-0.02em",
                              lineHeight: 1,
                            }}
                          >
                            {y.avg_crane_productivity.toFixed(1)}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: "0.62rem",
                              fontWeight: 700,
                              color: "text.secondary",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                            }}
                          >
                            avg mph
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {/* ── Data Table ── */}
            <Box sx={{ mb: 4 }}>
              <SectionLabel
                label={craneId ? "Visit History" : "Asset Overview"}
              />
              <Box
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  overflow: "hidden",
                  bgcolor: alpha(theme.palette.background.paper, 0.4),
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow
                      sx={{
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                      }}
                    >
                      {craneId ? (
                        <>
                          <TableCell sx={thCellSx(theme)}>Visit ID</TableCell>
                          <TableCell sx={thCellSx(theme)}>Terminal</TableCell>
                          <TableCell align="right" sx={thCellSx(theme)}>
                            Moves
                          </TableCell>
                          <TableCell sx={thCellSx(theme)}>
                            Cranes Used
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell sx={thCellSx(theme)}>Asset ID</TableCell>
                          <TableCell sx={thCellSx(theme)}>Terminal</TableCell>
                          <TableCell align="right" sx={thCellSx(theme)}>
                            Total Moves
                          </TableCell>
                          <TableCell align="right" sx={thCellSx(theme)}>
                            MPH
                          </TableCell>
                          <TableCell align="right" sx={thCellSx(theme)}>
                            Rating
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {craneId
                      ? (paginatedRows as typeof visitRows).map((v) => (
                          <TableRow
                            key={v.visit_id}
                            hover
                            sx={{
                              "&:last-child td": { border: 0 },
                              "&:hover": {
                                bgcolor: alpha(
                                  theme.palette.primary.main,
                                  0.03,
                                ),
                              },
                            }}
                          >
                            <TableCell
                              sx={{
                                ...tdCellSx(theme),
                                fontFamily: "monospace",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                              }}
                            >
                              {v.visit_id}
                            </TableCell>
                            <TableCell sx={tdCellSx(theme)}>
                              <TerminalBadge id={v.yard_id} />
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                ...tdCellSx(theme),
                                fontWeight: 700,
                                fontSize: "0.82rem",
                              }}
                            >
                              {v.total_moves.toLocaleString()}
                            </TableCell>
                            <TableCell sx={tdCellSx(theme)}>
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 0.75,
                                  flexWrap: "wrap",
                                }}
                              >
                                {v.cranes_used.map((cid) => (
                                  <Box
                                    key={cid}
                                    sx={{
                                      display: "inline-flex",
                                      px: 1.25,
                                      py: 0.35,
                                      borderRadius: "6px",
                                      border: `1px solid ${
                                        cid === craneId
                                          ? alpha(
                                              theme.palette.primary.main,
                                              0.4,
                                            )
                                          : alpha(theme.palette.divider, 0.15)
                                      }`,
                                      bgcolor:
                                        cid === craneId
                                          ? alpha(
                                              theme.palette.primary.main,
                                              0.08,
                                            )
                                          : "transparent",
                                    }}
                                  >
                                    <Typography
                                      sx={{
                                        fontFamily: "monospace",
                                        fontSize: "0.62rem",
                                        fontWeight: 700,
                                        color:
                                          cid === craneId
                                            ? "primary.main"
                                            : "text.secondary",
                                        letterSpacing: "0.06em",
                                      }}
                                    >
                                      {cid}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))
                      : (paginatedRows as typeof statRows).map((s) => (
                          <TableRow
                            key={s.crane_id}
                            hover
                            onClick={() => {
                              setCraneId(s.crane_id);
                              fetchData(s.crane_id, days);
                            }}
                            sx={{
                              cursor: "pointer",
                              "&:last-child td": { border: 0 },
                              "&:hover": {
                                bgcolor: alpha(
                                  theme.palette.primary.main,
                                  0.03,
                                ),
                              },
                            }}
                          >
                            <TableCell
                              sx={{
                                ...tdCellSx(theme),
                                fontFamily: "monospace",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                              }}
                            >
                              {s.crane_id}
                            </TableCell>
                            <TableCell sx={tdCellSx(theme)}>
                              <TerminalBadge id={s.yard_id} />
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                ...tdCellSx(theme),
                                fontWeight: 700,
                                fontSize: "0.82rem",
                              }}
                            >
                              {s.total_moves.toLocaleString()}
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                ...tdCellSx(theme),
                                fontWeight: 700,
                                fontSize: "0.82rem",
                                color: "primary.main",
                              }}
                            >
                              {s.moves_per_hour.toFixed(1)}
                            </TableCell>
                            <TableCell align="right" sx={tdCellSx(theme)}>
                              <RatingChip rating={s.productivity_rating} />
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <TablePagination
                  component="div"
                  count={activeRows.length}
                  page={page}
                  onPageChange={(_, newPage) => setPage(newPage)}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[10]}
                  sx={{
                    borderTop: `1px solid ${alpha(
                      theme.palette.divider,
                      0.08,
                    )}`,
                    color: "text.secondary",
                    ".MuiTablePagination-toolbar": {
                      minHeight: 48,
                      px: 2.5,
                    },
                    ".MuiTablePagination-displayedRows": {
                      fontSize: "0.75rem",
                    },
                    ".MuiTablePagination-actions button": {
                      color: "text.secondary",
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
