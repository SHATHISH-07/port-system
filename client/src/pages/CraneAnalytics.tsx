import { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Skeleton, Alert, FormControl, InputLabel, Select, MenuItem, Button,
} from '@mui/material';
import { FilterAlt, ClearAll } from '@mui/icons-material';
import { api } from '../api/api';
import type { CranePerformanceResponse } from '../types/vessel';

interface ExtendedCraneResponse extends CranePerformanceResponse {
  available_cranes?: string[];
  selected_crane?: string | null;
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
      }}
    >
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', fontWeight: 700, color: 'text.disabled', letterSpacing: '0.08em' }}>
        {n}
      </Typography>
      <Typography sx={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: 'text.primary', letterSpacing: '-1px' }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
        {label}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
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
    r === 'Optimal' ? 'success' : r === 'Acceptable' ? 'warning' : r === 'Suboptimal' ? 'error' : 'default';

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ mb: 0.5, color: 'text.primary' }}>
          Crane Analytics
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480 }}>
          Operational crane move intelligence derived from canonical crane move records.
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

      {/* KPI row - Hide when a specific crane is selected for better focus */}
      {!selectedCrane && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 4 }}>
          <KpiTile n="01" label="Total Moves" value={loading ? '—' : (data?.summary?.total_moves ?? 0)} />
          <KpiTile
            n="02"
            label="Effective Moves"
            value={loading ? '—' : (data?.summary?.effective_moves ?? 0)}
          />
          <KpiTile
            n="03"
            label="Active Cranes"
            value={loading ? '—' : (data?.summary?.active_cranes ?? 0)}
          />
          <KpiTile
            n="04"
            label="Unique Visits Served"
            value={loading ? '—' : (data?.summary?.unique_visits_served ?? 0)}
          />
        </Box>
      )}

      {/* ── Selected Crane Detail Card ── */}
      {selectedCrane && data?.crane_stats?.find(s => s.crane_id === selectedCrane) && (
        <Box sx={{ mb: 4, p: 3, border: '1px solid', borderColor: 'primary.main', borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, mb: 1, display: 'block' }}>
            Selected Crane Profile
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                {selectedCrane}
              </Typography>
              <Chip 
                label={data.crane_stats.find(s => s.crane_id === selectedCrane)?.productivity_rating} 
                color={ratingChipColor(data.crane_stats.find(s => s.crane_id === selectedCrane)?.productivity_rating ?? '')}
                sx={{ mt: 1, fontWeight: 700 }}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" color="text.secondary">Total Moves</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {data.crane_stats.find(s => s.crane_id === selectedCrane)?.total_moves}
              </Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" color="text.secondary">Moves Per Hour (MPH)</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {data.crane_stats.find(s => s.crane_id === selectedCrane)?.moves_per_hour.toFixed(1)}
              </Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" color="text.secondary">Minutes Per Move (MPM)</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {data.crane_stats.find(s => s.crane_id === selectedCrane)?.avg_cycle_minutes.toFixed(1)}m
              </Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" color="text.secondary">Time / Move (HPM)</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {(1 / (data.crane_stats.find(s => s.crane_id === selectedCrane)?.moves_per_hour || 1)).toFixed(4)}h
              </Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="caption" color="text.secondary">Restow Ratio</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {((data.crane_stats.find(s => s.crane_id === selectedCrane)?.restow_ratio ?? 0) * 100).toFixed(1)}%
              </Typography>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── Section 01 · Per-Crane Productivity ── */}
      {!selectedCrane && (
        <Box sx={{ pt: 3 }}>
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 2.5, mb: 2.5,
              pb: 2, borderBottom: '1px solid', borderColor: 'divider',
            }}
          >
            <Typography
              sx={{
                fontSize: '1.5rem', fontWeight: 800, color: 'text.secondary',
                lineHeight: 1, letterSpacing: '-2px', fontFamily: 'monospace', userSelect: 'none',
              }}
            >
              01
            </Typography>
            <Typography variant="h6" sx={{ color: 'text.secondary' }}>
              Per-Crane Productivity
            </Typography>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Crane ID</TableCell>
                  <TableCell align="right">Total Moves</TableCell>
                  <TableCell align="right">MPH (Moves/Hr)</TableCell>
                  <TableCell align="right">MPM (Mins/Move)</TableCell>
                  <TableCell align="right">HPM (Hrs/Move)</TableCell>
                  <TableCell align="right">Rating</TableCell>
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
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>{s.avg_cycle_minutes.toFixed(1)}</Typography>
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
        </Box>
      )}

      {/* ── Section 02 · Visit Allocation (per-crane) ── */}
      {selectedCrane && (data?.visit_crane_allocation ?? []).length > 0 && (
        <Box sx={{ pt: 4 }}>
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 2.5, mb: 2.5,
              pb: 2, borderBottom: '1px solid', borderColor: 'divider',
            }}
          >
            <Typography
              sx={{
                fontSize: '1.5rem', fontWeight: 800, color: 'text.secondary',
                lineHeight: 1, letterSpacing: '-2px', fontFamily: 'monospace', userSelect: 'none',
              }}
            >
              02
            </Typography>
            <Typography variant="h6" sx={{ color: 'text.secondary' }}>
              Visits Served by {selectedCrane}
            </Typography>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Visit ID</TableCell>
                  <TableCell align="right">Total Moves</TableCell>
                  <TableCell>Cranes Used</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.visit_crane_allocation ?? []).slice(0, 30).map((v) => (
                  <TableRow key={v.visit_id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {v.visit_id}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{v.total_moves}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {v.cranes_used.map((cid) => (
                          <Chip
                            key={cid}
                            label={cid}
                            size="small"
                            variant={cid === selectedCrane ? 'filled' : 'outlined'}
                            color={cid === selectedCrane ? 'primary' : 'default'}
                            sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Hourly productivity removed as per user request */}

      <Box sx={{ pb: 6 }} />
    </Box>
  );
}
