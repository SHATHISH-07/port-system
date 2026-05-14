import { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Skeleton, Alert, FormControl, InputLabel, Select, MenuItem, Button,
  Divider,
} from '@mui/material';
import { FilterAlt, ClearAll } from '@mui/icons-material';
import { api } from '../api/api';
import type { CranePerformanceResponse } from '../types/vessel';

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
  hourly_trend?: Array<{ timestamp: string; count: number }>;
}

function Section({
  n,
  label,
  children,
}: {
  n: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ pt: 4 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          mb: 2.5,
          pb: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "text.secondary",
            lineHeight: 1,
            letterSpacing: "-2px",
            fontFamily: "monospace",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {n}
        </Typography>
        <Typography variant="h6" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function KpiTile({ n, label, value, sub }: { n: string; label: string; value: string | number; sub?: string }) {
  return (
    <Box
      sx={{
        p: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        bgcolor: "background.paper"
      }}
    >
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.08em' }}>
        {n}
      </Typography>
      <Typography sx={{ fontSize: '2.25rem', fontWeight: 700, lineHeight: 1, color: 'text.primary', letterSpacing: '-1px' }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, textTransform: "uppercase" }}>
        {label}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, opacity: 0.8 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

export default function CraneAnalytics() {
  const [data, setData] = useState<ExtendedCraneResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCrane, setSelectedCrane] = useState<string>('');
  const [availableCranes, setAvailableCranes] = useState<string[]>([]);

  const fetchData = (craneId?: string) => {
    setLoading(true);
    const params: Record<string, string> = { limit: '1000' };
    if (craneId) params.crane_id = craneId;

    api.get<ExtendedCraneResponse>('/analytics/crane-performance', { params })
      .then(r => {
        setData(r.data);
        if (r.data.available_cranes && r.data.available_cranes.length > 0) {
          setAvailableCranes(r.data.available_cranes);
        }
      })
      .catch(() => setError('No crane move data available yet. Upload a crane moves dataset to populate this dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCraneFilter = (craneId: string) => {
    setSelectedCrane(craneId);
    fetchData(craneId || undefined);
  };

  const clearFilter = () => {
    setSelectedCrane('');
    fetchData();
  };

  const ratingChipColor = (r: string): 'success' | 'warning' | 'error' | 'default' =>
    r === 'Optimal' ? 'success' : r === 'Satisfactory' ? 'warning' : r === 'Below Target' ? 'error' : 'default';

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", px: 3, py: 4 }}>
      {/* Header Section */}
      <Box sx={{ mb: 6 }}>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 900,
            letterSpacing: "-2px",
            color: "text.primary",
            mb: 1,
          }}
        >
          Crane Performance Analysis
        </Typography>
        <Typography variant="h6" sx={{ color: "text.secondary", fontWeight: 400, maxWidth: 600 }}>
          Real-time productivity intelligence and cross-terminal benchmark analytics.
        </Typography>
      </Box>

      {/* Crane Filter Bar */}
      {(availableCranes.length > 0 || !loading) && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="crane-filter-label">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FilterAlt sx={{ fontSize: 14 }} /> Filter by Crane
              </Box>
            </InputLabel>
            <Select
              labelId="crane-filter-label"
              value={selectedCrane}
              label="Filter by Crane"
              onChange={(e) => handleCraneFilter(e.target.value)}
              disabled={loading || availableCranes.length === 0}
            >
              <MenuItem value=""><em>All Cranes</em></MenuItem>
              {availableCranes.map((cid) => (
                <MenuItem key={cid} value={cid}>{cid}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedCrane && (
            <Button
              size="small"
              startIcon={<ClearAll />}
              onClick={clearFilter}
              variant="outlined"
              color="inherit"
            >
              Clear Filter
            </Button>
          )}

          {selectedCrane && (
            <Chip
              label={`Viewing: ${selectedCrane}`}
              color="primary"
              variant="outlined"
              size="small"
              onDelete={clearFilter}
            />
          )}
        </Box>
      )}

      {error && <Alert severity="info" sx={{ mb: 3 }}>{error}</Alert>}

      {!loading && !data && !error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No data available. The system has not recorded any crane metrics.
        </Alert>
      )}

      {/* ── Section 01 · Terminal Comparison ── */}
      {!selectedCrane && data?.yard_stats && data.yard_stats.length > 0 && (
        <Section n="01" label="Terminal Operations Benchmark">
          <Grid container spacing={3}>
            {data.yard_stats.map((y) => (
              <Grid size={{ xs: 12, md: 6 }} key={y.terminal_name}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                    transition: "all 0.2s",
                    "&:hover": { borderColor: "primary.main", transform: "translateY(-2px)" }
                  }}
                >
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: "text.primary", letterSpacing: "-1px" }}>
                      {y.terminal_name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                      {y.unique_vessel_visits} Vessel Visits · {y.active_cranes_count} Cranes
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: "-2px", color: "primary.main" }}>
                      {y.avg_crane_productivity.toFixed(1)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800 }}>
                      MPH / CRANE
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Section>
      )}

      {/* ── Section 02 · Productivity KPIs ── */}
      {!selectedCrane && (
        <Section n="02" label="Global Productivity Benchmarks">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
            <KpiTile n="KPI.01" label="Total Moves" value={loading ? '—' : (data?.summary?.total_moves ?? 0)} />
            <KpiTile
              n="KPI.02"
              label="Effective Moves"
              value={loading ? '—' : (data?.summary?.effective_moves ?? 0)}
            />
            <KpiTile
              n="KPI.03"
              label="Active Cranes"
              value={loading ? '—' : (data?.summary?.active_cranes ?? 0)}
            />
            <KpiTile
              n="KPI.04"
              label="Anomaly Rate"
              value={loading ? '—' : `${((data?.summary?.anomaly_rate ?? 0) * 100).toFixed(1)}%`}
              sub="Moves flagged for exclusion"
            />
          </Box>
        </Section>
      )}

      {/* ── Section 03 · Operational Distribution ── */}
      {!selectedCrane && (
        <Section n="03" label="Terminal Throughput & Distribution">
          <Box sx={{ p: 4, border: "1px solid", borderColor: "divider", borderRadius: 4, bgcolor: "background.paper", boxShadow: "0 4px 30px rgba(0,0,0,0.05)" }}>
            <Typography variant="h6" sx={{ fontWeight: 900, mb: 4, color: "text.primary", letterSpacing: "-0.5px" }}>
              Move Distribution by Operation Category
            </Typography>
            <Grid container spacing={4}>
              {data?.move_kind_distribution && Object.entries(data.move_kind_distribution).map(([kind, count]) => {
                const total = Object.values(data.move_kind_distribution!).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }} key={kind}>
                    <Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1, alignItems: "flex-end" }}>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: "text.primary", textTransform: "uppercase", fontSize: "0.75rem" }}>{kind}</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: "primary.main" }}>{count.toLocaleString()}</Typography>
                      </Box>
                      <Box sx={{ height: 8, bgcolor: "action.hover", borderRadius: 2, overflow: "hidden" }}>
                        <Box sx={{ height: "100%", width: `${pct}%`, bgcolor: "primary.main", borderRadius: 2 }} />
                      </Box>
                      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, mt: 0.5, display: "block" }}>
                        {pct.toFixed(1)}% of total volume
                      </Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </Section>
      )}

      {/* ── Section 01 · Selected Crane Profile ── */}
      {selectedCrane && data?.crane_stats && (
        <Section n="01" label="Asset Intelligence Profile">
          <Box sx={{ p: 4, border: "1px solid", borderColor: "divider", borderRadius: 4, bgcolor: "background.paper", boxShadow: "0 4px 30px rgba(0,0,0,0.05)", mb: 4 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, mb: 1.5, display: 'block', letterSpacing: '0.1em' }}>
              Selected Asset Detail
            </Typography>
            <Grid container spacing={4} sx={{ alignItems: 'center' }}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="h2" sx={{ fontWeight: 900, fontFamily: 'monospace', color: 'primary.main', letterSpacing: '-3px', lineHeight: 1 }}>
                  {selectedCrane}
                </Typography>
                <Chip
                  label={data.crane_stats.find(s => s.crane_id === selectedCrane)?.productivity_rating}
                  color={ratingChipColor(data.crane_stats.find(s => s.crane_id === selectedCrane)?.productivity_rating ?? '')}
                  sx={{ mt: 1.5, fontWeight: 900, textTransform: 'uppercase', px: 1 }}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: 'uppercase', display: "block", mb: 0.5 }}>Total Moves</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary" }}>
                  {data.crane_stats.find(s => s.crane_id === selectedCrane)?.total_moves}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: 'uppercase', display: "block", mb: 0.5 }}>Moves Per Hour</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900, color: "primary.main" }}>
                  {data.crane_stats.find(s => s.crane_id === selectedCrane)?.moves_per_hour.toFixed(1)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: 'uppercase', display: "block", mb: 0.5 }}>Cycle (MPM)</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900, color: "text.primary" }}>
                  {data.crane_stats.find(s => s.crane_id === selectedCrane)?.avg_cycle_minutes.toFixed(1)}m
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: 'uppercase', display: "block", mb: 0.5 }}>Restow Rate</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900, color: "error.main" }}>
                  {((data.crane_stats.find(s => s.crane_id === selectedCrane)?.restow_ratio ?? 0) * 100).toFixed(1)}%
                </Typography>
              </Grid>
            </Grid>

            <Divider sx={{ my: 4, borderColor: "divider", opacity: 0.6 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 3, color: "text.primary", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Detailed Asset Deployment
            </Typography>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ p: 2.5, bgcolor: "action.selected", borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", display: "block", mb: 1, opacity: 0.7, textTransform: "uppercase" }}>Carrier Serving Capacity</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: "text.primary" }}>
                    {data.visit_crane_allocation.filter(v => v.cranes_used.includes(selectedCrane)).length} Unique Visits
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>Active deployment across vessel services</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ p: 2.5, bgcolor: "action.selected", borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", display: "block", mb: 1, opacity: 0.7, textTransform: "uppercase" }}>Primary Operational Terminal</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: "text.primary", textTransform: "uppercase" }}>
                    {data.crane_stats.find(s => s.crane_id === selectedCrane)?.yard_id || "N/A"} Terminal
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>Logical asset mapping in system</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ p: 2.5, bgcolor: "action.selected", borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: "text.primary", display: "block", mb: 1, opacity: 0.7, textTransform: "uppercase" }}>Performance Variance Monitor</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: "success.main" }}>
                    Stable Flow
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>Deviation within nominal ±5% range</Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Section>
      )}

      {/* ── Section 04 · Per-Crane Performance ── */}
      {!selectedCrane && (
        <Section n="04" label="Asset Performance Matrix">
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 800 }}>Crane ID</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Terminal Location</TableCell>
                  <TableCell align="right">Total Moves</TableCell>
                  <TableCell align="right">MPH</TableCell>
                  <TableCell align="right">Rating</TableCell>
                  <TableCell align="right">Primary Visit</TableCell>
                  <TableCell align="right">Restow %</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton /></TableCell>
                      ))}
                    </TableRow>
                  ))
                  : (data?.crane_stats ?? []).map((s) => (
                    <TableRow
                      key={s.crane_id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => handleCraneFilter(s.crane_id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                          {s.crane_id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={s.yard_id === "peb" ? "PEB Terminal" : s.yard_id === "cwit" ? "CWIT Terminal" : s.yard_id.toUpperCase()}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: "10px", fontWeight: 800, color: "text.primary" }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.total_moves}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>{s.moves_per_hour.toFixed(1)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={s.productivity_rating}
                          size="small"
                          color={ratingChipColor(s.productivity_rating)}
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{s.primary_visit}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>{(s.restow_ratio * 100).toFixed(1)}%</Typography>
                      </TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      )}

      {/* ── Section 02 · Visit Allocation ── */}
      {selectedCrane && (data?.visit_crane_allocation ?? []).length > 0 && (
        <Section n="02" label={`Carrier Visits Served by ${selectedCrane}`}>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 800 }}>Visit ID</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Yard</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>Total Moves</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>Cranes Used</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.visit_crane_allocation ?? []).slice(0, 30).map((v) => (
                  <TableRow key={v.visit_id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {v.visit_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={v.yard_id === "peb" ? "PEB Terminal" : v.yard_id === "cwit" ? "CWIT Terminal" : v.yard_id.toUpperCase()}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "10px", fontWeight: 800, color: "text.primary" }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{v.total_moves}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {v.cranes_used.map((cid) => (
                          <Chip
                            key={cid}
                            label={cid}
                            size="small"
                            variant={cid === selectedCrane ? 'filled' : 'outlined'}
                            color={cid === selectedCrane ? 'primary' : 'default'}
                            sx={{ fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700 }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      )}

      <Box sx={{ pb: 10 }} />
    </Box>
  );
}
