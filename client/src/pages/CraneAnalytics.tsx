import { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Skeleton, Alert,
} from '@mui/material';
import { api } from '../api/api';
import type { CranePerformanceResponse } from '../types/vessel';

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
  const [data, setData] = useState<CranePerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<CranePerformanceResponse>('/analytics/crane-performance?limit=1000')
      .then(r => setData(r.data))
      .catch(() => setError('No crane move data available yet. Upload a crane moves dataset to populate this dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Box sx={{ mb: 4, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ mb: 0.5, color: 'text.primary' }}>
          Crane Analytics
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480 }}>
          Operational crane move intelligence derived from canonical crane move records.
        </Typography>
      </Box>

      {error && <Alert severity="info" sx={{ mb: 3 }}>{error}</Alert>}

      {!loading && !data && !error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No data available. The system has not recorded any crane metrics.
        </Alert>
      )}

      {data && (!data.summary || !data.crane_stats) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          The backend API may not be updated yet. Expected top-level keys are missing from the response.
        </Alert>
      )}

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

      {/* ── Section 01 · Per-Crane Productivity ── */}
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
                <TableCell align="right">Moves / Hour</TableCell>
                <TableCell align="right">Productivity Rating</TableCell>
                <TableCell align="right">Avg Cycle (m)</TableCell>
                <TableCell align="right">Restow Ratio</TableCell>
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
                  <TableRow key={s.crane_id} hover>
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
                        sx={{ 
                          fontWeight: 700, 
                          bgcolor: s.productivity_rating === 'A' ? 'success.main' : s.productivity_rating === 'B' ? 'primary.main' : s.productivity_rating === 'C' ? 'warning.main' : 'error.main',
                          color: 'white'
                        }}
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

      {/* ── Section 02 · Hourly Productivity Trend ── */}
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
            Hourly Productivity Trend
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {loading
            ? Array.from({ length: 12 }).map((_, i) => (
                <Grid size={{ xs: 6, sm: 4, md: 2 }} key={i}>
                   <Skeleton height={60} />
                </Grid>
              ))
            : (data?.hourly_productivity ?? []).slice(-12).map((h) => (
                <Grid size={{ xs: 6, sm: 4, md: 2 }} key={h.hour}>
                   <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
                     <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{h.hour}</Typography>
                     <Typography variant="h6" sx={{ fontWeight: 700 }}>{h.moves} moves</Typography>
                   </Box>
                </Grid>
              ))
          }
        </Grid>
      </Box>

      <Box sx={{ pb: 6 }} />
    </Box>
  );
}
