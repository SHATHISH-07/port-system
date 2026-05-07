import { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Skeleton, Alert, Select, MenuItem, FormControl,
  Divider,
} from '@mui/material';
import { api } from '../api/api';

const MOVE_COLOR: Record<string, string> = {
  LOAD: '#4ade80',
  DISCHARGE: '#60a5fa',
  SHIFT: '#facc15',
  RESTOW: '#f97316',
};

interface CraneMove {
  id: string;
  crane_id: string | null;
  unit_id: string | null;
  carrier_visit: string | null;
  move_kind: string | null;
  from_position: string | null;
  to_position: string | null;
  time_completed: string | null;
  line_op: string | null;
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
      <Typography
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: 'text.disabled',
          letterSpacing: '0.08em',
        }}
      >
        {n}
      </Typography>
      <Typography
        sx={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: 'text.primary', letterSpacing: '-1px' }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.disabled">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

export default function CraneAnalytics() {
  const [moves, setMoves] = useState<CraneMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCrane, setFilterCrane] = useState('');
  const [filterKind, setFilterKind] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get<{ moves: CraneMove[] }>('/analytics/crane-performance?limit=1000')
      .then(r => setMoves(r.data.moves || []))
      .catch(() =>
        setError('No crane move data available yet. Upload a crane moves dataset to populate this dashboard.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const cranes = [...new Set(moves.map(m => m.crane_id).filter((c): c is string => c !== null))];
  const kinds = [...new Set(moves.map(m => m.move_kind).filter((k): k is string => k !== null))];

  const filtered = moves.filter(m => {
    if (filterCrane && m.crane_id !== filterCrane) return false;
    if (filterKind && m.move_kind !== filterKind) return false;
    return true;
  });

  const totalMoves = filtered.length;
  const loadMoves = filtered.filter(m => m.move_kind?.toUpperCase().includes('LOAD')).length;
  const dischargeMoves = filtered.filter(m => m.move_kind?.toUpperCase().includes('DISCHARGE')).length;

  const craneSummary: Record<string, { total: number; load: number; discharge: number }> = {};
  filtered.forEach(m => {
    const c = m.crane_id ?? 'Unknown';
    if (!craneSummary[c]) craneSummary[c] = { total: 0, load: 0, discharge: 0 };
    craneSummary[c].total++;
    if (m.move_kind?.toUpperCase().includes('LOAD')) craneSummary[c].load++;
    if (m.move_kind?.toUpperCase().includes('DISCHARGE')) craneSummary[c].discharge++;
  });

  const kindDist: Record<string, number> = {};
  filtered.forEach(m => {
    const k = m.move_kind ?? 'Unknown';
    kindDist[k] = (kindDist[k] || 0) + 1;
  });

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box sx={{ mb: 4, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ mb: 0.5, color: 'text.primary' }}>
          Crane Analytics
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480 }}>
          Operational crane move intelligence derived from canonical crane move records.
        </Typography>
      </Box>

      {error && <Alert severity="info" sx={{ mb: 3 }}>{error}</Alert>}

      {/* ── Filters ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select
            value={filterCrane}
            onChange={(e: any) => setFilterCrane(e.target.value as string)}
            displayEmpty
          >
            <MenuItem value=""><em>All Cranes</em></MenuItem>
            {cranes.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select
            value={filterKind}
            onChange={(e: any) => setFilterKind(e.target.value as string)}
            displayEmpty
          >
            <MenuItem value=""><em>All Move Types</em></MenuItem>
            {kinds.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* ── KPI Tiles ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 4 }}>
        <KpiTile n="01" label="Total Moves" value={loading ? '—' : totalMoves} />
        <KpiTile
          n="02"
          label="Load Moves"
          value={loading ? '—' : loadMoves}
          sub={totalMoves ? `${((loadMoves / totalMoves) * 100).toFixed(0)}% of total` : undefined}
        />
        <KpiTile
          n="03"
          label="Discharge Moves"
          value={loading ? '—' : dischargeMoves}
          sub={totalMoves ? `${((dischargeMoves / totalMoves) * 100).toFixed(0)}% of total` : undefined}
        />
        <KpiTile
          n="04"
          label="Active Cranes"
          value={loading ? '—' : cranes.length}
        />
      </Box>

      {/* ── Section 01 · Move Type Breakdown + Per-Crane Productivity ── */}
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
            Move Distribution
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Move kind breakdown */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                By Type
              </Typography>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={32} sx={{ mb: 1 }} />)
                : Object.entries(kindDist).sort((a, b) => b[1] - a[1]).map(([kind, count]) => (
                  <Box key={kind} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: MOVE_COLOR[kind.toUpperCase()] ?? '#94a3b8', flexShrink: 0 }} />
                      <Typography variant="body2" fontWeight={500}>{kind}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={700} fontFamily="monospace">{count}</Typography>
                      <Typography variant="caption" color="text.disabled">
                        {totalMoves > 0 ? `${((count / totalMoves) * 100).toFixed(0)}%` : '0%'}
                      </Typography>
                    </Box>
                  </Box>
                ))
              }
            </Box>
          </Grid>

          <Grid size={{ xs: 0, md: 0.1 }}>
            <Divider orientation="vertical" flexItem sx={{ height: '100%' }} />
          </Grid>

          {/* Per-crane productivity */}
          <Grid size={{ xs: 12, md: 7.9 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
              Per-Crane Productivity
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Crane ID</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Load</TableCell>
                    <TableCell align="right">Discharge</TableCell>
                    <TableCell align="right">Share</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}><Skeleton /></TableCell>
                        ))}
                      </TableRow>
                    ))
                    : Object.entries(craneSummary).sort((a, b) => b[1].total - a[1].total).map(([crane, s]) => (
                      <TableRow key={crane} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            {crane}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.total}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">{s.load}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">{s.discharge}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={totalMoves > 0 ? `${((s.total / totalMoves) * 100).toFixed(1)}%` : '0%'}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  }
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>

      {/* ── Section 02 · Recent Crane Moves ── */}
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
            Recent Crane Moves
          </Typography>
        </Box>

        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Crane</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Move Kind</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell>Carrier Visit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
                : filtered.slice(0, 100).map(m => (
                  <TableRow key={m.id} hover>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {m.time_completed ? new Date(m.time_completed).toLocaleString() : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
                        {m.crane_id ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: 11 }}>
                        {m.unit_id ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={m.move_kind ?? '—'}
                        size="small"
                        sx={{
                          bgcolor: MOVE_COLOR[(m.move_kind ?? '').toUpperCase()] ?? 'transparent',
                          color: '#111',
                          fontWeight: 700,
                          border: 'none',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{m.from_position ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{m.to_position ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{m.carrier_visit ?? '—'}</Typography>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box sx={{ pb: 6 }} />
    </Box>
  );
}
