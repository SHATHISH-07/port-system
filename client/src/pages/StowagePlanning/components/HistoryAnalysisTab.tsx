import { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, useTheme, alpha, Paper } from '@mui/material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../../../api/api';

function formatNumber(value?: number, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

interface HistoryAnalysisTabProps {
  vesselId: string;
  yardId?: string;
  visitId?: string;
  trigger?: number;
}

interface HistoryData {
  summary?: Record<string, number>;
  specialCargoSummary?: Record<string, number>;
  containerSizeDistribution?: Array<{ containerSize: string; count: number }>;
  dischargePortGrouping?: Array<{ port: string; count: number }>;
  equipmentClassDistribution?: Array<{ equipmentClass: string; count: number }>;
  historicalVisits?: Array<{ visitId: string; containerCount: number; moveCompleteTime: string }>;

  weightDistribution?: {
    aboveDeck?: Array<{ band: string; count: number }>;
    belowDeck?: Array<{ band: string; count: number }>;
  };
  craneMetrics?: {
    restowMoves: number;
    reshuffleRate: number;
  };
}

export default function HistoryAnalysisTab({ vesselId, yardId, visitId }: HistoryAnalysisTabProps) {
  const theme = useTheme();
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!vesselId) {
        setData(null);
        return;
      }
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
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.8, pt: { xs: 15, md: 25 } }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>Ready for Analysis</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 350, textAlign: 'center' }}>
          Enter a Vessel ID above to generate historical stowage insights.
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pt: { xs: 15, md: 25 } }}>
        <CircularProgress size={40} thickness={4.5} sx={{ color: theme.palette.primary.main, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
      </Box>
    );
  }

  if (!data) return null;

  const summary = data?.summary || {};
  const specialCargoSummary = data?.specialCargoSummary || {};
  const containerSizeDistribution = data?.containerSizeDistribution || [];
  const dischargePortGrouping = data?.dischargePortGrouping || [];
  const equipmentClassDistribution = data?.equipmentClassDistribution || [];
  const historicalVisits = data?.historicalVisits || [];
  const weightDistribution = data?.weightDistribution || { aboveDeck: [], belowDeck: [] };
  const craneMetrics = data?.craneMetrics;

  const portBarData = dischargePortGrouping.slice(0, 5).map((i: { port: string; count: number }) => ({ name: i.port, Containers: i.count }));
  const sizePieData = containerSizeDistribution.map((i: { containerSize: string; count: number }) => ({ name: i.containerSize === 'BASIC20' ? '20ft (Standard)' : '40ft (Hi-Cube)', value: i.count }));
  const equipmentBarData = equipmentClassDistribution.map((i: { equipmentClass: string; count: number }) => ({ name: i.equipmentClass.replace('CONTAINER | ', ''), Count: i.count }));

  const deckWeightData = [
    { name: 'Above', Light: weightDistribution.aboveDeck?.find((x: { band: string; count: number }) => x.band === 'LIGHT')?.count || 0, Medium: weightDistribution.aboveDeck?.find((x: { band: string; count: number }) => x.band === 'MEDIUM')?.count || 0, Heavy: weightDistribution.aboveDeck?.find((x: { band: string; count: number }) => x.band === 'HEAVY')?.count || 0 },
    { name: 'Below', Light: weightDistribution.belowDeck?.find((x: { band: string; count: number }) => x.band === 'LIGHT')?.count || 0, Medium: weightDistribution.belowDeck?.find((x: { band: string; count: number }) => x.band === 'MEDIUM')?.count || 0, Heavy: weightDistribution.belowDeck?.find((x: { band: string; count: number }) => x.band === 'HEAVY')?.count || 0 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, animation: 'fadeIn 0.6s ease-out forwards', '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>

      {/* Hero Section - Single Unified Stats Card */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.15),
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.7)} 100%)`,
              backdropFilter: 'blur(20px)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              gap: 4,
              boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.05)}`
            }}
          >
            {/* Left Side: Main Total Stowed */}
            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: { md: '30%' } }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {vesselId}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Total Containers Stowed
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography sx={{ fontWeight: 900, letterSpacing: '-0.03em', fontSize: { xs: '3.5rem', md: '4.5rem' }, lineHeight: 1, color: 'text.primary' }}>
                    {formatNumber(summary.totalContainers || 0, 0)}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary', opacity: 0.7 }}>
                    units
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    mt: 2,
                    display: 'block',
                    color: 'text.secondary',
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  Based on{' '}
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {historicalVisits.length}
                  </Box>{' '}
                  historical visits.
                </Typography>
              </Box>
            </Box>

            {/* Divider for Desktop */}
            <Box sx={{ display: { xs: 'none', md: 'block' }, width: '1px', height: '140px', bgcolor: 'divider', zIndex: 1 }} />
            {/* Divider for Mobile */}
            <Box sx={{ display: { xs: 'block', md: 'none' }, height: '1px', width: '100%', bgcolor: 'divider', zIndex: 1 }} />

            {/* Right Side: Sub Metrics Grid */}
            <Box sx={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: { xs: 3, md: 5 }, flex: '1 1 auto', pt: { xs: 1, md: 0 } }}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Above Deck
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'primary.main', mt: 0.5, lineHeight: 1 }}>
                  {summary.aboveDeckCount || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                  Stowed units
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Below Deck
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'text.primary', mt: 0.5, lineHeight: 1 }}>
                  {summary.belowDeckCount || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                  Stowed units
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Heavy
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'warning.main', mt: 0.5, lineHeight: 1 }}>
                  {summary.heavyCount || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                  Low stow needed
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Hazmat
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'error.main', mt: 0.5, lineHeight: 1 }}>
                  {specialCargoSummary.hazardousCount || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                  Segregation req.
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Avg Restows
                </Typography>
                <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'warning.main', mt: 0.5, lineHeight: 1 }}>
                  {craneMetrics ? Math.round(craneMetrics.restowMoves / Math.max(1, historicalVisits.length)) : 0}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                  Per visit
                </Typography>
              </Box>
            </Box>

            {/* Background Decoration */}
            <Box
              sx={{
                position: 'absolute',
                right: { xs: '-10%', md: '0%' },
                top: { xs: '-10%', md: '50%' },
                transform: { md: 'translateY(-50%)' },
                width: { xs: 200, md: 350 },
                height: { xs: 200, md: 350 },
                borderRadius: '50%',
                background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 70%)`,
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />
          </Paper>
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
                  {portBarData.map((row: { name: string; Containers: number }) => (
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
                  <Bar dataKey="Light" stackId="a" fill={theme.palette.success.main} radius={[0, 0, 4, 4]} />
                  <Bar dataKey="Medium" stackId="a" fill={theme.palette.warning.main} />
                  <Bar dataKey="Heavy" stackId="a" fill={theme.palette.error.main} radius={[4, 4, 0, 0]} />
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
                  <Bar dataKey="Count" fill={theme.palette.info.main} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>
      </Grid>



      {/* Historical Logs — hidden when scoped to a single visit */}
      {!visitId && (
        <Paper elevation={0} sx={{ mt: 3, mb: 1, p: { xs: 2, md: 3 }, borderRadius: 4, border: '1px solid', borderColor: alpha(theme.palette.divider, 0.8), bgcolor: 'background.paper', boxShadow: `0 4px 20px ${alpha('#000', 0.03)}` }}>
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.02em', color: 'text.primary' }}>Visit History</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mt: 0.5, display: "block" }}>
                Past occurrences and stowage volumes
              </Typography>
            </Box>
          </Box>
          <TableContainer sx={{ maxHeight: 400, borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 0.5)}`, overflowY: "auto" }}>
            <Table size="medium" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell align="left" sx={{ bgcolor: alpha(theme.palette.background.default, 0.8), backdropFilter: 'blur(10px)', fontWeight: 800, fontSize: '0.75rem', py: 2, px: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visit ID</TableCell>
                  <TableCell align="center" sx={{ bgcolor: alpha(theme.palette.background.default, 0.8), backdropFilter: 'blur(10px)', fontWeight: 800, fontSize: '0.75rem', py: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Containers Stowed</TableCell>
                  <TableCell align="right" sx={{ bgcolor: alpha(theme.palette.background.default, 0.8), backdropFilter: 'blur(10px)', fontWeight: 800, fontSize: '0.75rem', py: 2, px: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operation Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historicalVisits.map((visit: { visitId: string; containerCount: number; moveCompleteTime: string | null }) => (
                  <TableRow key={visit.visitId} hover sx={{ '& td': { borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}` }, '&:last-child td': { borderBottom: 'none' } }}>
                    <TableCell align="left" sx={{ fontWeight: 700, fontSize: '0.85rem', px: 3, color: 'primary.main' }}>{visit.visitId}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.85rem', fontWeight: 800, color: 'text.primary' }}>{formatNumber(visit.containerCount, 0)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', color: 'text.secondary', px: 3, fontWeight: 500 }}>
                      {visit.moveCompleteTime ? new Date(visit.moveCompleteTime).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {historicalVisits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ borderBottom: 'none' }}>
                      <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>No history visits found.</Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}