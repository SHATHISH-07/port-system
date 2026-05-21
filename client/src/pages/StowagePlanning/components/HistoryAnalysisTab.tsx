import { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, useTheme, alpha, Paper } from '@mui/material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import SearchIcon from '@mui/icons-material/Search';
import { api } from '../../../api/api';
import MetricCard from '../../StayTimeAnalysis/components/MetricCard';

function formatNumber(value?: number, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

export default function HistoryAnalysisTab({ vesselId, yardId, visitId }: any) {
  const theme = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vesselId) return setData(null);
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await api.get('/stowage/history/analysis', { params: { vesselId, yardId, visitId } });
        setData(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [vesselId, yardId, visitId]);

  if (!vesselId && !loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.8, py: 10 }}>
        <Box sx={{ width: 90, height: 90, borderRadius: '50%', bgcolor: alpha(theme.palette.primary.main, 0.05), display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
          <SearchIcon sx={{ fontSize: 36, color: 'primary.main', opacity: 0.5 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>Ready for Analysis</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 350, textAlign: 'center' }}>
          Enter a Vessel ID above to generate historical stowage insights.
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={40} thickness={4.5} sx={{ mb: 2, color: theme.palette.primary.main, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
        <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>Analyzing History</Typography>
        <Typography variant="caption" color="text.secondary">Processing stowage patterns...</Typography>
      </Box>
    );
  }

  if (!data) return null;

  const { summary = {}, specialCargoSummary = {}, containerSizeDistribution = [], dischargePortGrouping = [], equipmentClassDistribution = [], historicalVisits = [], craneMetrics } = data;

  const portBarData = dischargePortGrouping.slice(0, 5).map((i: any) => ({ name: i.port, Containers: i.count }));
  const sizePieData = containerSizeDistribution.map((i: any) => ({ name: i.containerSize === 'BASIC20' ? '20ft (Standard)' : '40ft (Hi-Cube)', value: i.count }));
  const equipmentBarData = equipmentClassDistribution.map((i: any) => ({ name: i.equipmentClass.replace('CONTAINER | ', ''), Count: i.count }));

  const wDist = data.weightDistribution || { aboveDeck: [], belowDeck: [] };
  const deckWeightData = [
    { name: 'Above', Light: wDist.aboveDeck?.find((x: any) => x.band === 'LIGHT')?.count || 0, Medium: wDist.aboveDeck?.find((x: any) => x.band === 'MEDIUM')?.count || 0, Heavy: wDist.aboveDeck?.find((x: any) => x.band === 'HEAVY')?.count || 0 },
    { name: 'Below', Light: wDist.belowDeck?.find((x: any) => x.band === 'LIGHT')?.count || 0, Medium: wDist.belowDeck?.find((x: any) => x.band === 'MEDIUM')?.count || 0, Heavy: wDist.belowDeck?.find((x: any) => x.band === 'HEAVY')?.count || 0 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, animation: 'fadeIn 0.6s ease-out forwards', '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
      
      {/* Hero Section */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.15),
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.5)} 100%)`,
              backdropFilter: 'blur(10px)',
              position: 'relative',
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 0.25 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: 'text.primary' }}>
                    {vesselId}
                  </Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Containers Stowed
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography sx={{ fontWeight: 900, letterSpacing: '-0.03em', fontSize: { xs: '2.5rem', md: '3.5rem' }, lineHeight: 1 }}>
                    {formatNumber(summary.totalContainers || 0, 0)}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.secondary', opacity: 0.5 }}>
                    units
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary', fontWeight: 500 }}>
                  Based on {historicalVisits.length} historical visits.
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                position: 'absolute',
                right: -30,
                bottom: -30,
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
                zIndex: 0,
              }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Grid container spacing={2} sx={{ height: '100%' }}>
            <Grid size={{ xs: 6 }}>
              <MetricCard title="Above Deck" value={summary.aboveDeckCount || 0} subtitle="Stowed units" accent="primary" />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <MetricCard title="Below Deck" value={summary.belowDeckCount || 0} subtitle="Stowed units" accent="default" />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <MetricCard title="Heavy" value={summary.heavyCount || 0} subtitle="Low stow needed" accent="warning" />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <MetricCard title="Hazmat" value={specialCargoSummary.hazardousCount || 0} subtitle="Segregation req." accent="error" />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* High-Density Chart Grid */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2, height: 320, boxShadow: `0 4px 16px ${alpha('#000', 0.02)}` }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>DISCHARGE PORTS</Typography>
            <Box sx={{ mt: 1, height: '85%', overflowY: 'auto' }}>
              <Table size="small">
                <TableBody>
                  {portBarData.map((row: any) => (
                    <TableRow key={row.name} sx={{ '& td': { borderBottom: '1px solid', borderColor: 'divider', py: 1.5, px: 0 } }}>
                      <TableCell sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{row.name}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{row.Containers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2, height: 320, boxShadow: `0 4px 16px ${alpha('#000', 0.02)}` }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>EQUIPMENT SIZES</Typography>
            <Box sx={{ mt: 2, height: '85%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sizePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={5}>
                    <Cell fill={theme.palette.primary.main} />
                    <Cell fill={theme.palette.info.main} />
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '0.75rem', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#000' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.75rem', fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2, height: 320, boxShadow: `0 4px 16px ${alpha('#000', 0.02)}` }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>DECK WEIGHT DISTRIBUTION</Typography>
            <Box sx={{ mt: 2, height: '85%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deckWeightData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                  <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} tick={{ fontWeight: 600 }} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: alpha(theme.palette.primary.main, 0.05) }} contentStyle={{ fontSize: '0.75rem', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#000' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.75rem', fontWeight: 600 }} />
                  <Bar dataKey="Light" stackId="a" fill={theme.palette.success.main} radius={[0,0,4,4]} />
                  <Bar dataKey="Medium" stackId="a" fill={theme.palette.warning.main} />
                  <Bar dataKey="Heavy" stackId="a" fill={theme.palette.error.main} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 2, height: 320, boxShadow: `0 4px 16px ${alpha('#000', 0.02)}` }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>EQUIPMENT TYPES</Typography>
            <Box sx={{ mt: 2, height: '85%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={equipmentBarData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={10} width={90} tickLine={false} axisLine={false} tick={{ fontWeight: 600 }} />
                  <Tooltip cursor={{ fill: alpha(theme.palette.primary.main, 0.05) }} contentStyle={{ fontSize: '0.75rem', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#000' }} />
                  <Bar dataKey="Count" fill={theme.palette.info.main} radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Crane Performance Metrics */}
      {craneMetrics && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, mt: 1, boxShadow: `0 4px 16px ${alpha('#000', 0.02)}` }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>Crane Operational Performance</Typography>
              <Typography variant="caption" color="text.secondary">Historical move breakdown and efficiency metrics</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>Dual Cycle Rate</Typography>
                <Typography sx={{ fontWeight: 800, color: theme.palette.success.main }}>{formatNumber(craneMetrics.dualCycleRate)}%</Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>Avg Move Gap</Typography>
                <Typography sx={{ fontWeight: 800, color: theme.palette.primary.main }}>{formatNumber(craneMetrics.avgMoveGapMinutes)} min</Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ p: 2, height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Load Moves', value: craneMetrics.loadMoves, fill: theme.palette.primary.main },
                { name: 'Discharge Moves', value: craneMetrics.dischargeMoves, fill: theme.palette.info.main },
                { name: 'Restow (Reshuffle)', value: craneMetrics.restowMoves, fill: theme.palette.warning.main },
              ]} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" fontSize={11} width={120} tickLine={false} axisLine={false} tick={{ fontWeight: 600 }} />
                <Tooltip cursor={{ fill: alpha(theme.palette.primary.main, 0.05) }} contentStyle={{ fontSize: '0.75rem', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#000' }} />
                <Bar dataKey="value" radius={[0,4,4,0]}>
                  {
                    [
                      { name: 'Load Moves', value: craneMetrics.loadMoves, fill: theme.palette.primary.main },
                      { name: 'Discharge Moves', value: craneMetrics.dischargeMoves, fill: theme.palette.info.main },
                      { name: 'Restow (Reshuffle)', value: craneMetrics.restowMoves, fill: theme.palette.warning.main },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Card>
      )}

      {/* Historical Logs */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, mt: 1, boxShadow: `0 4px 16px ${alpha('#000', 0.02)}` }}>
        <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>Visit History</Typography>
          <Typography variant="caption" color="text.secondary">Past occurrences and stowage volumes</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <TableRow>
                <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem', py: 1.5, px: 2.5 }}>Visit ID</TableCell>
                <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem', py: 1.5 }}>Containers Stowed</TableCell>
                <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.75rem', py: 1.5 }}>Operation Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historicalVisits.map((visit: any, index: number) => (
                <TableRow key={visit.visitId} hover sx={{ bgcolor: index % 2 === 0 ? 'transparent' : alpha(theme.palette.action.hover, 0.18) }}>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem', px: 2.5 }}>{visit.visitId}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatNumber(visit.containerCount, 0)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{new Date(visit.moveCompleteTime).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {historicalVisits.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>No history visits found.</Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}