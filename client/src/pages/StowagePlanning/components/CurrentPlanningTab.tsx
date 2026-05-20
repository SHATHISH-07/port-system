import React, { useState } from 'react';
import {
  Box, Card, Typography, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Collapse, IconButton, alpha, useTheme, TextField, InputAdornment,
  CircularProgress
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SearchIcon from '@mui/icons-material/Search';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RouteIcon from '@mui/icons-material/Route';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../../../api/api';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const cardStyles = {
  elevation: 0,
  sx: {
    borderRadius: 3,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    overflow: 'hidden'
  }
};

// Reusable styled chip for high-density tables - fully theme aware
const StatusChip = ({ label, theme }: any) => {
  let color = theme.palette.success.main;
  if (label === 'HIGH' || label === 'HEAVY') color = theme.palette.error.main;
  if (label === 'MEDIUM') color = theme.palette.warning.main;

  return (
    <Box sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: alpha(color, 0.15),
      color: color,
      px: 1,
      py: 0.25,
      borderRadius: 1,
      fontSize: '0.65rem',
      fontWeight: 800,
      letterSpacing: 0.5,
      border: `1px solid ${alpha(color, 0.2)}`
    }}>
      {label}
    </Box>
  );
};

function CompactRow({ step, index, theme }: any) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        sx={{
          '& > *': { borderBottom: '1px solid', borderColor: alpha(theme.palette.divider, 0.5), py: 0.75 },
          transition: 'background-color 0.2s ease',
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) }
        }}
      >
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => setOpen(!open)} sx={{ color: open ? 'primary.main' : 'text.secondary' }}>
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>
          {String(step.stepIndex).padStart(2, '0')}
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: 'primary.main' }}>
          {step.unitId}
        </TableCell>
        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.primary' }}>{step.portOfDischarge}</TableCell>
        <TableCell>
          <StatusChip label={step.weightCategory} theme={theme} />
        </TableCell>
        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.primary' }}>
          {step.recommendedDeck} <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', ml: 0.5 }}>T{step.recommendedTier}</Typography>
        </TableCell>
        <TableCell>
          <StatusChip label={step.reshuffleRisk} theme={theme} />
        </TableCell>
        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 800, color: 'text.primary' }}>{step.loadingPriority}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0, border: 'none' }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{
              m: 1,
              mb: 2,
              p: 2,
              bgcolor: 'background.paper',
              boxShadow: theme.shadows[2],
              borderLeft: `3px solid ${theme.palette.primary.main}`,
              borderRadius: 2
            }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 0.5, fontWeight: 700, lineHeight: 1 }}>Reasoning</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{step.recommendedReason}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 0.5, fontWeight: 700, lineHeight: 1 }}>Yard Origin</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.primary' }}>
                    Block {step.currentYardBlock} <span style={{ color: theme.palette.text.disabled, margin: '0 4px' }}>|</span> {step.currentSlotPosition}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Typography variant="overline" color="primary" sx={{ display: 'block', mb: 0.5, fontWeight: 700, lineHeight: 1 }}>Outbound</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.primary' }}>{step.actualOutboundCarrierVisitId || 'TBD'}</Typography>
                </Grid>
              </Grid>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

const SortablePort = ({ id, index }: { id: string, index: number }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const theme = useTheme();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    padding: '10px 16px',
    marginBottom: '8px',
    backgroundColor: isDragging ? alpha(theme.palette.primary.main, 0.05) : theme.palette.background.paper,
    border: `1px solid ${isDragging ? theme.palette.primary.main : alpha(theme.palette.divider, 0.6)}`,
    borderRadius: '12px',
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: isDragging ? theme.shadows[4] : 'none',
    zIndex: isDragging ? 100 : 1,
    position: 'relative' as any,
    width: '100%',
    boxSizing: 'border-box' as any,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DragIndicatorIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
      <Box sx={{
        width: 26, height: 26, borderRadius: '50%',
        bgcolor: alpha(theme.palette.primary.main, 0.1),
        color: 'primary.main', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', fontWeight: 800, flexShrink: 0
      }}>
        {index + 1}
      </Box>
      <Typography variant="body2" fontWeight={800} color="text.primary" sx={{ letterSpacing: 0.5, flex: 1 }}>
        {id}
      </Typography>
    </div>
  );
};

export default function CurrentPlanningTab({ vesselId, yardId, globalFile, globalContainerText, trigger }: any) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizedData, setOptimizedData] = useState<any>(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [filterText, setFilterText] = useState('');

  const [portRotation, setPortRotation] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const executeOptimization = async (overrideRotation?: string[]) => {
    if (!vesselId || (!globalFile && !globalContainerText?.trim())) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('vesselId', vesselId);
      if (yardId) formData.append('yardId', yardId);
      if (globalFile) formData.append('file', globalFile);
      if (globalContainerText?.trim()) formData.append('containerIds', globalContainerText.trim());

      const rotationToUse = overrideRotation || portRotation;
      if (rotationToUse.length > 0) {
        formData.append('portRotation', rotationToUse.join(','));
      }

      const response = await api.post('/stowage/current/planning', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOptimizedData(response.data);
      if (!overrideRotation && response.data.dischargeSequence) {
        setPortRotation(response.data.dischargeSequence.map((s: any) => s.port));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to optimize plan.');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = portRotation.indexOf(active.id);
      const newIndex = portRotation.indexOf(over.id);
      const newRotation = arrayMove(portRotation, oldIndex, newIndex);
      setPortRotation(newRotation);
    }
  };

  React.useEffect(() => {
    if (trigger > 0) executeOptimization();
  }, [trigger]);

  if (!optimizedData && !loading && !error) return null;
  if (loading && !optimizedData) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress size={40} thickness={4} /></Box>;
  if (error) return <Typography color="error" sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.error.main, 0.1), borderRadius: 2 }}>{error}</Typography>;

  const recs = (optimizedData?.recommendations || []).map((r: any, i: number) => ({ ...r, stepIndex: i + 1 }));
  const filteredRecs = recs.filter((r: any) => (r.unitId || '').toLowerCase().includes(filterText.toLowerCase()));
  const paginatedRecs = filteredRecs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const deckCounts = { BELOW_DECK: 0, ABOVE_DECK: 0 };
  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const weightCounts = { LIGHT: 0, MEDIUM: 0, HEAVY: 0 };

  recs.forEach((r: any) => {
    if (r.recommendedDeck === 'ABOVE_DECK') deckCounts.ABOVE_DECK++;
    if (r.recommendedDeck === 'BELOW_DECK') deckCounts.BELOW_DECK++;
    if (riskCounts[r.reshuffleRisk as keyof typeof riskCounts] !== undefined) riskCounts[r.reshuffleRisk as keyof typeof riskCounts]++;
    if (weightCounts[r.weightCategory as keyof typeof weightCounts] !== undefined) weightCounts[r.weightCategory as keyof typeof weightCounts]++;
  });

  const deckPie = [
    { name: 'Top', value: deckCounts.ABOVE_DECK, c: theme.palette.primary.light },
    { name: 'Below', value: deckCounts.BELOW_DECK, c: theme.palette.primary.dark }
  ];
  const riskPie = [
    { name: 'High', value: riskCounts.HIGH, c: theme.palette.error.main },
    { name: 'Medium', value: riskCounts.MEDIUM, c: theme.palette.warning.main },
    { name: 'Low', value: riskCounts.LOW, c: theme.palette.success.main }
  ];
  const weightBar = [
    { name: 'Heavy', Count: weightCounts.HEAVY, c: theme.palette.error.main },
    { name: 'Medium', Count: weightCounts.MEDIUM, c: theme.palette.warning.main },
    { name: 'Light', Count: weightCounts.LIGHT, c: theme.palette.success.main }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 1 }}>

      {/* ROW 1: Three Charts */}
      <Grid container spacing={3}>
        {/* Deck Distribution */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card {...cardStyles} sx={{ ...cardStyles.sx, p: 2.5, height: 260, position: 'relative' }}>
            <Typography variant="overline" fontWeight={800} color="text.secondary" letterSpacing={1}>DECK DISTRIBUTION</Typography>
            <Box sx={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 70%)` }} />
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={deckPie} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" stroke="none" paddingAngle={2}>
                  {deckPie.map((e, i) => <Cell key={i} fill={e.c} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.75rem', fontWeight: 600 }} itemStyle={{ color: theme.palette.text.primary }} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.7rem', fontWeight: 600, paddingTop: '10px', color: theme.palette.text.secondary }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid>

        {/* Reshuffle Risk */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card {...cardStyles} sx={{ ...cardStyles.sx, p: 2.5, height: 260, position: 'relative' }}>
            <Typography variant="overline" fontWeight={800} color="text.secondary" letterSpacing={1}>RESHUFFLE RISK</Typography>
            <Box sx={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 70%)` }} />
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={riskPie} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" stroke="none" paddingAngle={2}>
                  {riskPie.map((e, i) => <Cell key={i} fill={e.c} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.75rem', fontWeight: 600 }} itemStyle={{ color: theme.palette.text.primary }} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.7rem', fontWeight: 600, paddingTop: '10px', color: theme.palette.text.secondary }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid>

        {/* Weight Bands */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card {...cardStyles} sx={{ ...cardStyles.sx, p: 2.5, height: 260, position: 'relative' }}>
            <Typography variant="overline" fontWeight={800} color="text.secondary" letterSpacing={1}>WEIGHT BANDS</Typography>
            <Box sx={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 70%)` }} />
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={weightBar} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.divider, 0.5)} />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} fontWeight={600} stroke={theme.palette.text.secondary} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke={theme.palette.text.secondary} />
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.75rem', fontWeight: 600 }} cursor={{ fill: alpha(theme.palette.text.primary, 0.03) }} />
                <Bar dataKey="Count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {weightBar.map((e, i) => <Cell key={i} fill={e.c} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
      </Grid>

      {/* ROW 2: Route Sequence and Yard Strategies */}
      <Grid container spacing={3}>
        {/* Drag-and-Drop Route Sequence */}
        {portRotation && portRotation.length > 0 && (
          <Grid size={{ xs: 12, md: 5 }}>
            <Card {...cardStyles} sx={{ ...cardStyles.sx, p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Box>
                  <Typography variant="overline" fontWeight={800} color="text.secondary" letterSpacing={1} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RouteIcon fontSize="small" color="primary" /> Route Sequence
                  </Typography>
                </Box>
                {loading && <CircularProgress size={16} />}
              </Box>

              <Box sx={{
                flex: 1, p: 2, bgcolor: alpha(theme.palette.background.default, 0.5),
                overflowY: 'visible',
                '&::-webkit-scrollbar': { width: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: alpha(theme.palette.primary.main, 0.2), borderRadius: 3 }
              }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={portRotation} strategy={verticalListSortingStrategy}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      {portRotation.map((portId, idx) => (
                        <SortablePort key={portId} id={portId} index={idx} />
                      ))}
                    </Box>
                  </SortableContext>
                </DndContext>
              </Box>
            </Card>
          </Grid>
        )}

        {/* Yard Loading Strategy */}
        {optimizedData.strategyInsights && optimizedData.strategyInsights.length > 0 && (
          <Grid size={{ xs: 12, md: portRotation && portRotation.length > 0 ? 7 : 12 }}>
            <Card {...cardStyles} sx={{ ...cardStyles.sx, p: 3, height: '100%', bgcolor: alpha(theme.palette.info.main, 0.04), borderColor: alpha(theme.palette.info.main, 0.2) }}>
              <Typography variant="overline" color="info.main" fontWeight={800} letterSpacing={1} sx={{ display: 'block', mb: 2 }}>
                Yard Loading Strategy
              </Typography>
              <Grid container spacing={2}>
                {optimizedData.strategyInsights.map((insight: string, idx: number) => (
                  <Grid size={{ xs: 12, md: 6 }} key={idx}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'info.main', mt: 0.75, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.6 }}>
                        {insight}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* ROW 3: Sequence Data Table */}
      <Card {...cardStyles}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
          <Typography variant="overline" fontWeight={800} color="primary" letterSpacing={1}>Load Sequence Operations</Typography>
          <TextField
            size="small"
            placeholder="Search Unit ID..."
            value={filterText}
            onChange={(e) => { setFilterText(e.target.value); setPage(0); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="primary" /></InputAdornment> } }}
            sx={{
              width: 260,
              '& .MuiOutlinedInput-root': {
                height: 36,
                fontSize: '0.8rem',
                bgcolor: 'background.paper',
                borderRadius: 2,
                transition: 'all 0.2s',
                '&:hover': { boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.05)}` },
                '&.Mui-focused': { boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.15)}` }
              }
            }}
          />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'background.default', fontWeight: 800, fontSize: '0.7rem', color: 'text.secondary', textTransform: 'uppercase', py: 1.5, borderBottom: `2px solid ${theme.palette.divider}` } }}>
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
              {paginatedRecs.map((step: any, idx: number) => (
                <CompactRow key={step.unitId} step={step} index={idx} theme={theme} />
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
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.01),
            '.MuiTablePagination-toolbar': { minHeight: 48, color: 'text.primary' }
          }}
        />
      </Card>
    </Box>
  );
}