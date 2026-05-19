import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  alpha,
  useTheme,
  Button,
} from '@mui/material';
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

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  accent?: 'primary' | 'success' | 'warning' | 'error' | 'default';
}

function MetricCard({ title, value, subtitle, accent = 'default' }: MetricCardProps) {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';

  const accentColors = {
    primary: isLight ? theme.palette.primary.dark : theme.palette.primary.main,
    success: isLight ? theme.palette.success.dark : theme.palette.success.main,
    warning: isLight ? theme.palette.warning.dark : theme.palette.warning.main,
    error: isLight ? theme.palette.error.dark : theme.palette.error.main,
    default: theme.palette.text.primary,
  };

  const activeColor = accentColors[accent];

  const gradient = accent === 'default'
    ? isLight
      ? `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
      : `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.paper, 0.4)} 100%)`
    : isLight
      ? `linear-gradient(135deg, ${alpha(activeColor, 0.08)} 0%, ${alpha(activeColor, 0.03)} 100%)`
      : `linear-gradient(135deg, ${alpha(activeColor, 0.12)} 0%, ${alpha(activeColor, 0.02)} 100%)`;

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        borderRadius: 3.5,
        background: gradient,
        backdropFilter: 'blur(10px)',
        border: '1px solid',
        borderColor: accent === 'default'
          ? isLight ? alpha(theme.palette.divider, 0.8) : 'divider'
          : alpha(activeColor, isLight ? 0.3 : 0.18),
        boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.04)' : '0 6px 20px rgba(0,0,0,0.02)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: `0 8px 24px ${alpha(activeColor, 0.1)}`,
          borderColor: alpha(activeColor, 0.35),
        },
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="caption" sx={{ color: isLight ? 'text.primary' : 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem', opacity: isLight ? 0.85 : 1 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5, mb: 0.5, color: activeColor, letterSpacing: '-0.03em' }}>
              {value}
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" sx={{ color: isLight ? 'text.primary' : 'text.secondary', fontWeight: 500, opacity: isLight ? 0.75 : 1 }}>
          {subtitle}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function HistoryAnalysisTab({ vesselId, yardId, visitId, onSelectVisit }: any) {
  const theme = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vesselId) {
      setData(null);
      return;
    }
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/stowage/history/analysis', {
          params: { vesselId, yardId, visitId },
        });
        setData(response.data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to fetch historical stowage analysis.');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [vesselId, yardId, visitId]);

  if (!vesselId) {
    return (
      <Box sx={{ py: 8, textAlign: 'center', opacity: 0.8 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>No Vessel Selected</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please enter a Vessel ID in the search header above and click "Sync Stowage" to load history insights.
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={40} thickness={4} sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Analyzing historical container distributions...
        </Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error" variant="body1">
          {error || 'No historical data found for this vessel/yard combination.'}
        </Typography>
      </Box>
    );
  }

  const {
    summary = {},
    containerSizeDistribution = [],
    specialCargoSummary = {},
    dischargePortGrouping = [],
    equipmentClassDistribution = [],
    historicalVisits = [],
  } = data;

  const total =
    summary.totalContainers ??
    summary.total_containers ??
    summary.total ??
    0;

  const heavy =
    summary.heavyCount ??
    summary.heavy_count ??
    summary.heavy ??
    0;

  const medium =
    summary.mediumCount ??
    summary.medium_count ??
    summary.medium ??
    0;

  const light =
    summary.lightCount ??
    summary.light_count ??
    summary.light ??
    0;

  const haz =
    specialCargoSummary.hazardousCount ??
    specialCargoSummary.hazardous_count ??
    0;

  const aboveDeck =
    summary.aboveDeckCount ??
    summary.above_deck_count ??
    summary.aboveDeck ??
    summary.above_deck ??
    0;

  const belowDeck =
    summary.belowDeckCount ??
    summary.below_deck_count ??
    summary.belowDeck ??
    summary.below_deck ??
    0;

  // Top Discharge Ports Data
  const portBarData = dischargePortGrouping.slice(0, 5).map((item: any) => ({
    name: item.port,
    Containers: item.count,
  }));

  // Container Size Data
  const sizePieData = containerSizeDistribution.map((item: any) => ({
    name: item.containerSize === 'BASIC20' ? '20ft (Standard)' : '40ft (Hi-Cube)',
    value: item.count,
  }));

  // Equipment Class Data
  const equipmentBarData = equipmentClassDistribution.map((item: any) => ({
    name: item.equipmentClass,
    Count: item.count,
  }));

  // Weight distribution by deck location
  const weightDistribution = data.weightDistribution || { aboveDeck: [], belowDeck: [] };
  const aboveLight = weightDistribution.aboveDeck?.find((x: any) => x.band === 'LIGHT')?.count || 0;
  const aboveMedium = weightDistribution.aboveDeck?.find((x: any) => x.band === 'MEDIUM')?.count || 0;
  const aboveHeavy = weightDistribution.aboveDeck?.find((x: any) => x.band === 'HEAVY')?.count || 0;

  const belowLight = weightDistribution.belowDeck?.find((x: any) => x.band === 'LIGHT')?.count || 0;
  const belowMedium = weightDistribution.belowDeck?.find((x: any) => x.band === 'MEDIUM')?.count || 0;
  const belowHeavy = weightDistribution.belowDeck?.find((x: any) => x.band === 'HEAVY')?.count || 0;

  const deckWeightData = [
    { name: 'Above Deck', Light: aboveLight, Medium: aboveMedium, Heavy: aboveHeavy },
    { name: 'Below Deck', Light: belowLight, Medium: belowMedium, Heavy: belowHeavy },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 1600, mx: 'auto', width: '100%', pb: 4 }}>
      {/* 6 Metric Cards */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <MetricCard
            title="Total Containers"
            value={total.toLocaleString()}
            subtitle="Analyzed placements"
            accent="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <MetricCard
            title="Above Deck"
            value={aboveDeck.toLocaleString()}
            subtitle="Stowed above deck"
            accent="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <MetricCard
            title="Below Deck"
            value={belowDeck.toLocaleString()}
            subtitle="Stowed below deck"
            accent="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <MetricCard
            title="Heavy Ratio"
            value={`${total ? Math.round((heavy / total) * 100) : 0}%`}
            subtitle={`${heavy.toLocaleString()} heavy units`}
            accent="error"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <MetricCard
            title="Light & Medium"
            value={(light + medium).toLocaleString()}
            subtitle="Stability ballast"
            accent="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <MetricCard
            title="Hazardous Units"
            value={haz.toLocaleString()}
            subtitle="Safety separation required"
            accent="warning"
          />
        </Grid>
      </Grid>

      {/* Port Distributions, Equipment Dimensions & Deck Weight Distribution */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: 320, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
              Top Discharge Destinations
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Distribution of inbound containers grouped by destination port
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={portBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
                  <XAxis type="number" stroke={theme.palette.text.secondary} fontSize={11} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke={theme.palette.text.secondary} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, borderColor: theme.palette.divider, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
                  />
                  <Bar dataKey="Containers" fill="#0284c7" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: 320, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
              Equipment Dimensions
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Stowage balance by container dimensions (20ft vs. 40ft)
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sizePieData}
                    cx="35%"
                    cy="50%"
                    outerRadius={65}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#0284c7" />
                    <Cell fill="#38bdf8" />
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, borderColor: theme.palette.divider, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
                  />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider', height: 320, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
              Deck Weight Distribution
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Container stability weights by deck location (Above vs Below)
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deckWeightData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                  <XAxis dataKey="name" stroke={theme.palette.text.secondary} fontSize={11} tickLine={false} />
                  <YAxis stroke={theme.palette.text.secondary} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, borderColor: theme.palette.divider, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                  <Bar dataKey="Light" stackId="a" fill={theme.palette.success.main} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Medium" stackId="a" fill={theme.palette.warning.main} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Heavy" stackId="a" fill={theme.palette.error.main} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Equipment Class Distribution */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
              Equipment Class Distribution
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Breakdown of equipment classes historically loaded on this vessel
            </Typography>
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={equipmentBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
                  <XAxis type="number" stroke={theme.palette.text.secondary} fontSize={11} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke={theme.palette.text.secondary} fontSize={11} tickLine={false} width={120} />
                  <Tooltip
                    cursor={{ fill: alpha(theme.palette.text.primary, 0.05) }}
                    contentStyle={{ backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, borderColor: theme.palette.divider, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: theme.palette.text.primary, fontWeight: 700 }}
                  />
                  <Bar dataKey="Count" fill={theme.palette.secondary.main} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Historical Visit Log */}
      <Paper
        elevation={0}
        sx={{
          p: 3.5,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          width: '100%',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5, textAlign: 'center' }}>
          Historical Carrier Visits
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3, textAlign: 'center' }}>
          Click on a Visit ID to automatically render the full layout in the Visual Bay Deck tab.
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{
            borderRadius: 2,
            width: '100%',
            bgcolor: 'background.paper',
            borderColor: alpha(theme.palette.divider, 0.9),
            '&::-webkit-scrollbar': { height: 8 },
            '&::-webkit-scrollbar-track': { backgroundColor: alpha(theme.palette.text.primary, 0.04), borderRadius: 999 },
            '&::-webkit-scrollbar-thumb': { backgroundColor: alpha(theme.palette.text.primary, 0.18), borderRadius: 999 },
          }}
        >
          <Table
            size="small"
            sx={{
              minWidth: 600,
              '& .MuiTableCell-root': {
                borderBottomColor: alpha(theme.palette.divider, 0.8),
                fontSize: '0.8rem',
                py: 1.75,
                px: 3,
              },
              '& .MuiTableCell-head': {
                fontWeight: 800,
                color: 'text.primary',
                bgcolor: 'transparent',
                borderBottom: '2px solid',
                borderColor: 'divider',
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ width: '33.3%', fontWeight: 800 }}>Visit ID</TableCell>
                <TableCell align="center" sx={{ width: '33.3%', fontWeight: 800 }}>Containers Stowed</TableCell>
                <TableCell align="center" sx={{ width: '33.3%', fontWeight: 800 }}>Operation Completion Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historicalVisits.map((visit: any, index: number) => (
                <TableRow
                  key={visit.visitId}
                  hover
                  sx={{
                    bgcolor: index % 2 === 0
                      ? theme.palette.mode === 'light'
                        ? alpha(theme.palette.grey[50], 0.5)
                        : alpha(theme.palette.action.hover, 0.1)
                      : 'transparent',
                    '&:last-child td, &:last-child th': { border: 0 },
                    '&:hover': {
                      bgcolor: theme.palette.mode === 'light'
                        ? alpha(theme.palette.primary.main, 0.04)
                        : alpha(theme.palette.action.hover, 0.2),
                    },
                  }}
                >
                  <TableCell component="th" scope="row" align="center" sx={{ width: '33.3%', fontWeight: 800 }}>
                    <span style={{ fontWeight: 800, color: theme.palette.text.primary }}>
                      {visit.visitId}
                    </span>
                  </TableCell>
                  <TableCell align="center" sx={{ width: '33.3%', fontWeight: 700 }}>
                    {visit.containerCount.toLocaleString()}
                  </TableCell>
                  <TableCell align="center" sx={{ width: '33.3%', color: 'text.secondary' }}>
                    {new Date(visit.moveCompleteTime).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
