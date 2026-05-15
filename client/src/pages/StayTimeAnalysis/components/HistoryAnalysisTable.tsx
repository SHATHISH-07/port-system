import { useMemo, useState } from 'react';
import {
  Card,
  Box,
  Typography,
  Grid,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
  alpha,
  useTheme,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import TimelineIcon from '@mui/icons-material/Timeline';

type SortKey =
  | 'visitId'
  | 'startTime'
  | 'stayHours'
  | 'totalUnits'
  | 'restowCount'
  | 'loaded'
  | 'discharged'
  | 'assignedCranes';

function formatNumber(value?: number, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTopPort(visit: any) {
  const entries = Object.entries(visit?.port_of_discharge_top5 || {});
  if (!entries.length) return '-';
  const [port, count] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return `${port} (${count})`;
}

function getFreightLabel(visit: any) {
  const entries = Object.entries(visit?.freight_kind_breakdown || {});
  if (!entries.length) return '-';
  return entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([k, v]) => `${k} ${v}`)
    .join(' • ');
}

function sortRows(rows: any[], orderBy: SortKey, order: 'asc' | 'desc') {
  const direction = order === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = a[orderBy];
    const bv = b[orderBy];

    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av || '').localeCompare(String(bv || '')) * direction;
    }

    return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
  });
}

export default function HistoryAnalysisTable({
  actualVisits,
  assignments,
  avgStay,
  predictedStay,
  vesselService,
}: {
  actualVisits: Record<string, any>;
  assignments: any[];
  avgStay: number;
  predictedStay?: number;
  vesselService?: string;
}) {
  const theme = useTheme();
  const [orderBy, setOrderBy] = useState<SortKey>('stayHours');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const assignmentMap = new Map<string, any>();
    (assignments || []).forEach((assignment: any) => {
      if (assignment?.visit_id) assignmentMap.set(assignment.visit_id, assignment);
    });

    const visitRows = Object.entries(actualVisits || {}).map(([visitId, visit]: [string, any]) => {
      const assignment = assignmentMap.get(visitId);

      return {
        visitId,
        startTime: visit?.start_time || assignment?.start_time || '',
        endTime: visit?.end_time || assignment?.end_time || '',
        stayHours: Number(visit?.stay_hours ?? assignment?.stay_hours ?? 0),
        loaded: Number(visit?.loaded_containers ?? assignment?.loaded ?? 0),
        discharged: Number(visit?.discharged_containers ?? assignment?.discharged ?? 0),
        totalUnits: Number(visit?.total_units ?? assignment?.total_units ?? 0),
        restowCount: Number(visit?.restow_count ?? assignment?.restow_count ?? 0),
        assignedCranes: Number(visit?.assigned_cranes ?? assignment?.crane_count ?? 0),
        topPort: getTopPort(visit),
        freightMix: getFreightLabel(visit),
      };
    });

    return sortRows(visitRows, orderBy, order);
  }, [actualVisits, assignments, orderBy, order]);

  const totalVisits = rows.length;
  const averageStay =
    totalVisits > 0 ? rows.reduce((sum, row) => sum + Number(row.stayHours || 0), 0) / totalVisits : 0;
  const totalUnits = rows.reduce((sum, row) => sum + Number(row.totalUnits || 0), 0);
  const longestStay = rows.reduce((max, row) => Math.max(max, Number(row.stayHours || 0)), 0);
  const highestRestows = rows.reduce((max, row) => Math.max(max, Number(row.restowCount || 0)), 0);

  const handleSort = (key: SortKey) => {
    if (orderBy === key) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
      return;
    }
    setOrderBy(key);
    setOrder(key === 'visitId' || key === 'startTime' ? 'asc' : 'desc');
  };

  const renderSort = (key: SortKey, label: string) => (
    <TableSortLabel
      active={orderBy === key}
      direction={orderBy === key ? order : 'asc'}
      onClick={() => handleSort(key)}
      sx={{
        fontWeight: 800,
        color: 'text.primary',
        '&.Mui-active': {
          color: 'primary.main',
        },
        '& .MuiTableSortLabel-icon': {
          color: 'inherit !important',
        },
      }}
    >
      {label}
    </TableSortLabel>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        bgcolor: 'background.paper',
        width: '100%',
        overflow: 'hidden',
        borderColor: alpha(theme.palette.divider, 0.9),
        boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
      }}
    >
      <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          History Analysis
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sorted historical vessel visits with the key turnaround metrics
        </Typography>
      </Box>

      <Box sx={{ p: 3, width: '100%', overflowX: 'auto' }}>
        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.18),
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <TimelineIcon fontSize="small" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Visits
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                    {totalVisits}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: alpha(theme.palette.success.main, 0.18),
                bgcolor: alpha(theme.palette.success.main, 0.04),
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <AccessTimeIcon fontSize="small" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Avg Stay
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                    {formatNumber(averageStay)}h
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: alpha(theme.palette.warning.main, 0.18),
                bgcolor: alpha(theme.palette.warning.main, 0.05),
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <LocalShippingIcon fontSize="small" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Longest Stay
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                    {formatNumber(longestStay)}h
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: alpha(theme.palette.info.main, 0.18),
                bgcolor: alpha(theme.palette.info.main, 0.04),
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Inventory2Icon fontSize="small" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Total Units
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                    {formatNumber(totalUnits, 0)}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Chip
            label={`Vessel Service: ${vesselService || '-'}`}
            variant="outlined"
            sx={{ fontWeight: 700, bgcolor: 'background.paper' }}
          />
          <Chip
            label={`Predicted Avg Stay: ${formatNumber(predictedStay)}h`}
            variant="outlined"
            sx={{ fontWeight: 700, bgcolor: 'background.paper' }}
          />
          <Chip
            label={`Avg Stay: ${formatNumber(avgStay)}h`}
            variant="outlined"
            sx={{ fontWeight: 700, bgcolor: 'background.paper' }}
          />
          <Chip
            label={`Highest Restows: ${formatNumber(highestRestows, 0)}`}
            variant="outlined"
            sx={{ fontWeight: 700, bgcolor: 'background.paper' }}
          />
        </Box>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{
            borderRadius: 3,
            width: '100%',
            maxWidth: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            bgcolor: 'background.paper',
            borderColor: alpha(theme.palette.divider, 0.9),
            '&::-webkit-scrollbar': {
              height: 10,
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
              borderRadius: 999,
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.text.primary, 0.18),
              borderRadius: 999,
            },
          }}
        >
          <Table
            size="small"
            stickyHeader
            sx={{
              minWidth: 1320,
              tableLayout: 'auto',
              '& .MuiTableCell-root': {
                borderBottomColor: alpha(theme.palette.divider, 0.8),
              },
              '& .MuiTableCell-head': {
                fontWeight: 800,
                color: 'text.primary',
                bgcolor:
                  theme.palette.mode === 'light'
                    ? alpha(theme.palette.grey[100], 0.96)
                    : alpha(theme.palette.background.default, 0.92),
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 150 }}>{renderSort('visitId', 'Visit ID')}</TableCell>
                <TableCell sx={{ minWidth: 190 }}>{renderSort('startTime', 'Start')}</TableCell>
                <TableCell sx={{ minWidth: 190 }}>End</TableCell>
                <TableCell align="right" sx={{ minWidth: 110 }}>
                  {renderSort('stayHours', 'Stay (h)')}
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 110 }}>
                  {renderSort('loaded', 'Loaded')}
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 120 }}>
                  {renderSort('discharged', 'Discharged')}
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 100 }}>
                  {renderSort('totalUnits', 'Units')}
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 110 }}>
                  {renderSort('restowCount', 'Restows')}
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 120 }}>
                  {renderSort('assignedCranes', 'Cranes')}
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((row, index) => (
                <TableRow
                  key={row.visitId}
                  hover
                  sx={{
                    bgcolor:
                      index % 2 === 0
                        ? theme.palette.mode === 'light'
                          ? alpha(theme.palette.grey[50], 0.9)
                          : alpha(theme.palette.action.hover, 0.18)
                        : 'transparent',
                    '&:hover': {
                      bgcolor:
                        theme.palette.mode === 'light'
                          ? alpha(theme.palette.primary.main, 0.05)
                          : alpha(theme.palette.action.hover, 0.28),
                    },
                  }}
                >
                  <TableCell sx={{ fontWeight: 800 }}>{row.visitId}</TableCell>
                  <TableCell>{formatDateTime(row.startTime)}</TableCell>
                  <TableCell>{formatDateTime(row.endTime)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>
                    {formatNumber(row.stayHours)}
                  </TableCell>
                  <TableCell align="right">{formatNumber(row.loaded, 0)}</TableCell>
                  <TableCell align="right">{formatNumber(row.discharged, 0)}</TableCell>
                  <TableCell align="right">{formatNumber(row.totalUnits, 0)}</TableCell>
                  <TableCell align="right">{formatNumber(row.restowCount, 0)}</TableCell>
                  <TableCell align="right">{formatNumber(row.assignedCranes, 0)}</TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11}>
                    <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                      No history visits were returned for this vessel.
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Card>
  );
}