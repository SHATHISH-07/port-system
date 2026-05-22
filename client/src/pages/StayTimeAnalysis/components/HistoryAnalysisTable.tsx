import { useMemo, useState } from 'react';
import {
  Card,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  useTheme,
} from '@mui/material';

type SortKey = 'visitId' | 'startTime' | 'stayHours' | 'totalUnits' | 'restowCount' | 'loaded' | 'discharged' | 'assignedCranes' | 'craneMph' | 'craneMpm';

function formatNumber(value?: number, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sortRows(rows: any[], orderBy: SortKey, order: 'asc' | 'desc') {
  const direction = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[orderBy];
    const bv = b[orderBy];
    if (typeof av === 'string' || typeof bv === 'string') return String(av || '').localeCompare(String(bv || '')) * direction;
    return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
  });
}

export default function HistoryAnalysisTable({ actualVisits, assignments }: { actualVisits: Record<string, any>; assignments: any[]; }) {
  const theme = useTheme();
  const [orderBy, setOrderBy] = useState<SortKey>('stayHours');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const assignmentMap = new Map<string, any>();
    (assignments || []).forEach((a: any) => { if (a?.visit_id) assignmentMap.set(a.visit_id, a); });

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
        cranesAssignedList: visit?.cranes_assigned ?? [],
        craneMph: Number(visit?.crane_mph ?? assignment?.crane_mphc ?? 0),
        craneMpm: Number(visit?.crane_mpm ?? 0),
      };
    });
    return sortRows(visitRows, orderBy, order);
  }, [actualVisits, assignments, orderBy, order]);

  const handleSort = (key: SortKey) => {
    if (orderBy === key) { setOrder(order === 'asc' ? 'desc' : 'asc'); return; }
    setOrderBy(key);
    setOrder(key === 'visitId' || key === 'startTime' ? 'asc' : 'desc');
  };

  const renderSort = (key: SortKey, label: string) => (
    <TableSortLabel
      active={orderBy === key}
      direction={orderBy === key ? order : 'asc'}
      onClick={() => handleSort(key)}
      IconComponent={() => null} // Strict removal of sort icons
      sx={{ fontWeight: 700, '&.Mui-active': { color: 'text.primary' } }}
    >
      {label} {orderBy === key ? (order === 'asc' ? '↑' : '↓') : ''}
    </TableSortLabel>
  );

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.5, bgcolor: 'background.paper', width: '100%', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          History Ledger
        </Typography>
      </Box>

      <TableContainer sx={{ maxHeight: 400, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { py: 1, px: 2, borderBottom: `1px solid ${theme.palette.divider}` } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'background.default' }}>{renderSort('visitId', 'Visit ID')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.default' }}>{renderSort('startTime', 'Start')}</TableCell>
              <TableCell sx={{ bgcolor: 'background.default' }}>End</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('stayHours', 'Stay (h)')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('loaded', 'Loaded')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('discharged', 'Discharged')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('totalUnits', 'Units')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('restowCount', 'Restows')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('assignedCranes', 'Cranes')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>{renderSort('craneMph', 'MPH')}</TableCell>
              <TableCell align="right" sx={{ bgcolor: 'background.default' }}>
                {renderSort('craneMpm', 'Mins/Move')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.visitId} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.visitId}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{formatDateTime(row.startTime)}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{formatDateTime(row.endTime)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatNumber(row.stayHours)}</TableCell>
                <TableCell align="right">{formatNumber(row.loaded, 0)}</TableCell>
                <TableCell align="right">{formatNumber(row.discharged, 0)}</TableCell>
                <TableCell align="right">{formatNumber(row.totalUnits, 0)}</TableCell>
                <TableCell align="right">{formatNumber(row.restowCount, 0)}</TableCell>
                <TableCell align="right">
                  {row.cranesAssignedList && row.cranesAssignedList.length > 0
                    ? row.cranesAssignedList.join(', ')
                    : formatNumber(row.assignedCranes, 0)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 700 }}>{formatNumber(row.craneMph)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {row.craneMpm > 0 ? `${formatNumber(row.craneMpm)}m` : '-'}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ py: 4, textAlign: 'center', color: 'text.disabled' }}>No history visits found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}