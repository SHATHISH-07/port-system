import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  CircularProgress,
  alpha,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  Collapse,
  IconButton,
  TableSortLabel,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ClearIcon from '@mui/icons-material/Clear';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../../../api/api';

function Row({ step, index, theme }: { step: any; index: number; theme: any }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow sx={{ '&:hover': { bgcolor: 'action.hover' }, '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontWeight: 700 }}>{step.stepIndex}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{step.unitId}</TableCell>
        <TableCell>{step.portOfDischarge}</TableCell>
        <TableCell>
          <Box
            sx={{
              display: 'inline-block',
              px: 1,
              py: 0.25,
              borderRadius: 1.5,
              fontSize: '0.75rem',
              fontWeight: 700,
              bgcolor:
                step.weightCategory === 'HEAVY'
                  ? alpha(theme.palette.error.main, 0.1)
                  : step.weightCategory === 'MEDIUM'
                    ? alpha(theme.palette.warning.main, 0.1)
                    : alpha(theme.palette.success.main, 0.1),
              color:
                step.weightCategory === 'HEAVY'
                  ? 'error.main'
                  : step.weightCategory === 'MEDIUM'
                    ? 'warning.main'
                    : 'success.main',
            }}
          >
            {step.weightCategory}
          </Box>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {step.recommendedDeck} (Tier {step.recommendedTier})
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="caption" sx={{ fontWeight: 800, color: step.reshuffleRisk === 'HIGH' ? 'error.main' : step.reshuffleRisk === 'MEDIUM' ? 'warning.main' : 'success.main' }}>
            {step.reshuffleRisk}
          </Typography>
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700 }}>
          {step.loadingPriority}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.02), borderRadius: 2 }}>
              <Typography variant="subtitle2" gutterBottom component="div" sx={{ fontWeight: 800 }}>
                Recommendation Reasoning
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {step.recommendedReason}
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>Current Location</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Yard Block {step.currentYardBlock} • Slot {step.currentSlotPosition}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>Vessel Mapping</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Service {step.outboundService} • Visit {step.actualOutboundCarrierVisitId}</Typography>
                </Grid>
              </Grid>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function CurrentPlanningTab({
  vesselId,
  yardId,
  globalFile,
  globalContainerText,
  trigger,
  onPlanOptimized,
}: any) {
  const theme = useTheme();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizedData, setOptimizedData] = useState<any>(null);

  // Table pagination and filtering state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filterText, setFilterText] = useState('');

  // Sorting state
  const [orderBy, setOrderBy] = useState<string>('stepIndex');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const handlePageChange = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRequestSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const getSortValue = (row: any, field: string, index: number) => {
    if (field === 'stepIndex') return index;
    if (field === 'weightCategory') {
      const w = row.weightCategory?.toUpperCase();
      if (w === 'LIGHT') return 1;
      if (w === 'MEDIUM') return 2;
      if (w === 'HEAVY') return 3;
      return 0;
    }
    if (field === 'reshuffleRisk') {
      const r = row.reshuffleRisk?.toUpperCase();
      if (r === 'LOW') return 1;
      if (r === 'MEDIUM') return 2;
      if (r === 'HIGH') return 3;
      return 0;
    }
    return row[field];
  };

  const sortedRecommendations = React.useMemo(() => {
    const rawList = (optimizedData?.recommendations || []).map((rec: any, idx: number) => ({
      ...rec,
      stepIndex: idx + 1,
    }));

    const filtered = rawList.filter((step: any) => {
      const uId = step.unitId ? String(step.unitId).trim().toLowerCase() : '';
      const fText = filterText ? filterText.trim().toLowerCase() : '';
      return uId.includes(fText);
    });

    return filtered.sort((a: any, b: any) => {
      const aVal = getSortValue(a, orderBy, a.stepIndex);
      const bVal = getSortValue(b, orderBy, b.stepIndex);

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      // numbers
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [optimizedData, filterText, orderBy, order]);

  const paginatedRecommendations = sortedRecommendations.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // Chart Data Computation
  const deckCounts: Record<string, number> = { BELOW_DECK: 0, MIDDLE_DECK: 0, TOP_DECK: 0 };
  const riskCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const weightCounts: Record<string, number> = { LIGHT: 0, MEDIUM: 0, HEAVY: 0 };

  (optimizedData?.recommendations || []).forEach((step: any) => {
    // Split into 3 tiers: Below Deck (<=04), Middle Deck (06-08), Top Deck (>08 or >=80)
    let tierVal = parseInt(step.recommendedTier, 10) || 0;
    if (tierVal <= 4) {
      deckCounts.BELOW_DECK++;
    } else if (tierVal <= 8 && tierVal < 80) {
      deckCounts.MIDDLE_DECK++;
    } else {
      deckCounts.TOP_DECK++;
    }

    if (riskCounts[step.reshuffleRisk] !== undefined) riskCounts[step.reshuffleRisk]++;
    if (weightCounts[step.weightCategory] !== undefined) weightCounts[step.weightCategory]++;
  });

  const deckPieData = [
    { name: 'Top Deck', value: deckCounts.TOP_DECK, color: theme.palette.info.main },
    { name: 'Middle Deck', value: deckCounts.MIDDLE_DECK, color: theme.palette.warning.main },
    { name: 'Below Deck', value: deckCounts.BELOW_DECK, color: theme.palette.primary.main },
  ];

  const riskPieData = [
    { name: 'High Risk', value: riskCounts.HIGH, color: theme.palette.error.main },
    { name: 'Medium Risk', value: riskCounts.MEDIUM, color: theme.palette.warning.main },
    { name: 'Low Risk', value: riskCounts.LOW, color: theme.palette.success.main },
  ];

  const weightBarData = [
    { name: 'Heavy', Count: weightCounts.HEAVY, color: theme.palette.error.main },
    { name: 'Medium', Count: weightCounts.MEDIUM, color: theme.palette.warning.main },
    { name: 'Light', Count: weightCounts.LIGHT, color: theme.palette.success.main },
  ];

  const executeOptimization = async () => {
    if (!vesselId) {
      setError('Vessel ID is required. Please search a Vessel ID in the header first.');
      return;
    }
    if (!globalFile && !globalContainerText?.trim()) {
      setError('Please upload a container list file or paste container IDs in the header control row.');
      return;
    }

    setLoading(true);
    setError(null);
    setOptimizedData(null);

    try {
      const formData = new FormData();
      formData.append('vesselId', vesselId);
      if (yardId) {
        formData.append('yardId', yardId);
      }
      if (globalFile) {
        formData.append('file', globalFile);
      }
      if (globalContainerText?.trim()) {
        formData.append('containerIds', globalContainerText.trim());
      }

      let response = await api.post('/stowage/current/planning', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setOptimizedData(response.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to optimize stowage plan.');
    } finally {
      setLoading(false);
    }
  };

  // Automatically trigger optimization when header button is clicked
  React.useEffect(() => {
    if (trigger > 0) {
      executeOptimization();
    }
  }, [trigger]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>


      {!optimizedData && !loading && (
        <Box sx={{ py: 8, textAlign: 'center', opacity: 0.8 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Ready to Optimize</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Please select a Container List file or paste IDs, then click "Run Optimizer" to calculate sequencing.
          </Typography>
        </Box>
      )}

      {error && (
        <Paper elevation={0} sx={{ p: 2, bgcolor: alpha(theme.palette.error.main, 0.1), border: '1px solid', borderColor: alpha(theme.palette.error.main, 0.3), borderRadius: 3 }}>
          <Typography color="error" variant="body2" sx={{ fontWeight: 700 }}>
            {error}
          </Typography>
        </Paper>
      )}

      {/* Loading Overlay */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={40} thickness={4} sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            Simulating yard moves and optimizing vessel load patterns...
          </Typography>
        </Box>
      )}

      {/* Optimization Results Block */}
      {optimizedData && (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Stowage Plan Generated
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Load sequence steps optimized to minimize yard reshuffles.
              </Typography>
            </Box>

            <Button
              variant="contained"
              color="success"
              onClick={() => onPlanOptimized(optimizedData.recommendations?.map((s: any) => s.unitId) || [])}
              startIcon={<VisibilityIcon />}
              sx={{
                borderRadius: 2,
                px: 3,
                fontWeight: 700,
                textTransform: 'none',
                boxShadow: `0 4px 14px ${alpha(theme.palette.success.main, 0.25)}`,
              }}
            >
              Visualize Plan Deck
            </Button>
          </Box>

          {/* Analysis Charts */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: 260 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Deck Distribution</Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={deckPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
                      {deckPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: 260 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Reshuffle Risk Profile</Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
                      {riskPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: 260 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Weight Categories</Typography>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={weightBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} />
                    <Tooltip cursor={{ fill: alpha(theme.palette.text.primary, 0.05) }} />
                    <Bar dataKey="Count" radius={[4, 4, 0, 0]}>
                      {weightBarData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          {/* Table of Loading Sequence */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              Load Schedule & Sequence Steps
            </Typography>
            <TextField
              size="small"
              placeholder="Filter by Container ID..."
              value={filterText}
              onChange={(e) => {
                setFilterText(e.target.value);
                setPage(0);
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: filterText && (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="clear filter"
                        onClick={() => {
                          setFilterText('');
                          setPage(0);
                        }}
                        edge="end"
                        size="small"
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              }}
              sx={{ minWidth: 250 }}
            />
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 800, color: 'text.secondary', borderBottom: '2px solid', borderColor: 'divider' } }}>
                  <TableCell width="50px" />
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'stepIndex'}
                      direction={orderBy === 'stepIndex' ? order : 'asc'}
                      onClick={() => handleRequestSort('stepIndex')}
                    >
                      Step
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Container ID</TableCell>
                  <TableCell>Dest Port</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'weightCategory'}
                      direction={orderBy === 'weightCategory' ? order : 'asc'}
                      onClick={() => handleRequestSort('weightCategory')}
                    >
                      Weight
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'recommendedDeck'}
                      direction={orderBy === 'recommendedDeck' ? order : 'asc'}
                      onClick={() => handleRequestSort('recommendedDeck')}
                    >
                      Recommended Deck
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'reshuffleRisk'}
                      direction={orderBy === 'reshuffleRisk' ? order : 'asc'}
                      onClick={() => handleRequestSort('reshuffleRisk')}
                    >
                      Risk
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'loadingPriority'}
                      direction={orderBy === 'loadingPriority' ? order : 'asc'}
                      onClick={() => handleRequestSort('loadingPriority')}
                    >
                      Priority
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedRecommendations.map((step: any, index: number) => (
                  <Row key={step.unitId} step={step} index={page * rowsPerPage + index} theme={theme} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={sortedRecommendations.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
          />
        </Paper>
      )}
    </Box>
  );
}
