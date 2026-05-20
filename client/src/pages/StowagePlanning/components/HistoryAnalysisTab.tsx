import { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, useTheme, alpha } from '@mui/material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../../../api/api';

function DenseMetricCard({ title, value, subtitle, accentColor }: any) {
  return (
    <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider', borderLeft: `4px solid ${accentColor}`, borderRadius: 1 }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, lineHeight: 1 }}>
          {title}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', mt: 0.5, mb: 0.5 }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {subtitle}
        </Typography>
      </CardContent>
    </Card>
  );
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

  if (!vesselId) {
    return <Typography sx={{ mt: 4, textAlign: 'center', color: 'text.secondary' }}>Select a Vessel ID to view history.</Typography>;
  }
  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={30} /></Box>;
  }
  if (!data) return null;

  const { summary = {}, specialCargoSummary = {}, containerSizeDistribution = [], dischargePortGrouping = [], equipmentClassDistribution = [], historicalVisits = [] } = data;

  const portBarData = dischargePortGrouping.slice(0, 5).map((i: any) => ({ name: i.port, Containers: i.count }));
  const sizePieData = containerSizeDistribution.map((i: any) => ({ name: i.containerSize === 'BASIC20' ? '20ft (Standard)' : '40ft (Hi-Cube)', value: i.count }));
  const equipmentBarData = equipmentClassDistribution.map((i: any) => ({ name: i.equipmentClass.replace('CONTAINER | ', ''), Count: i.count }));

  const wDist = data.weightDistribution || { aboveDeck: [], belowDeck: [] };
  const deckWeightData = [
    { name: 'Above', Light: wDist.aboveDeck?.find((x: any) => x.band === 'LIGHT')?.count || 0, Medium: wDist.aboveDeck?.find((x: any) => x.band === 'MEDIUM')?.count || 0, Heavy: wDist.aboveDeck?.find((x: any) => x.band === 'HEAVY')?.count || 0 },
    { name: 'Below', Light: wDist.belowDeck?.find((x: any) => x.band === 'LIGHT')?.count || 0, Medium: wDist.belowDeck?.find((x: any) => x.band === 'MEDIUM')?.count || 0, Heavy: wDist.belowDeck?.find((x: any) => x.band === 'HEAVY')?.count || 0 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Metrics Row */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <DenseMetricCard title="Total" value={summary.totalContainers || 0} subtitle="Containers" accentColor={theme.palette.primary.main} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <DenseMetricCard title="Above Deck" value={summary.aboveDeckCount || 0} subtitle="Stowed units" accentColor={theme.palette.info.main} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <DenseMetricCard title="Below Deck" value={summary.belowDeckCount || 0} subtitle="Stowed units" accentColor={theme.palette.info.dark} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <DenseMetricCard title="Heavy" value={summary.heavyCount || 0} subtitle="Low stow needed" accentColor={theme.palette.error.main} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <DenseMetricCard title="Hazmat" value={specialCargoSummary.hazardousCount || 0} subtitle="Segregation required" accentColor={theme.palette.warning.main} />
        </Grid>
        {data.craneMetrics && (
          <Grid size={{ xs: 12, sm: 4, md: 2 }}>
            <DenseMetricCard title="Reshuffle Rate" value={`${data.craneMetrics.reshuffleRate?.toFixed(1) || 0}%`} subtitle="Historic baseline" accentColor={data.craneMetrics.reshuffleRate > 20 ? theme.palette.error.main : theme.palette.success.main} />
          </Grid>
        )}
      </Grid>

      {/* High-Density Chart Grid */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, height: 260 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">DISCHARGE PORTS</Typography>
            <Box sx={{ mt: 1, height: '85%', overflowY: 'auto' }}>
              <Table size="small">
                <TableBody>
                  {portBarData.map((row: any) => (
                    <TableRow key={row.name} sx={{ '& td': { borderBottom: '1px solid', borderColor: 'divider', py: 1, px: 0 } }}>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{row.Containers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, height: 260 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">EQUIPMENT SIZES</Typography>
            <Box sx={{ mt: 1, height: '90%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sizePieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value">
                    <Cell fill={theme.palette.primary.main} />
                    <Cell fill={theme.palette.secondary.main} />
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: '0.75rem' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.7rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, height: 260 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">DECK WEIGHT DISTRIBUTION</Typography>
            <Box sx={{ mt: 1, height: '90%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deckWeightData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} />
                  <YAxis fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: '0.75rem' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.7rem' }} />
                  <Bar dataKey="Light" stackId="a" fill={theme.palette.success.main} />
                  <Bar dataKey="Medium" stackId="a" fill={theme.palette.warning.main} />
                  <Bar dataKey="Heavy" stackId="a" fill={theme.palette.error.main} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, height: 260 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">EQUIPMENT TYPES</Typography>
            <Box sx={{ mt: 1, height: '90%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={equipmentBarData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={10} />
                  <YAxis dataKey="name" type="category" fontSize={10} width={90} />
                  <Tooltip contentStyle={{ fontSize: '0.75rem' }} />
                  <Bar dataKey="Count" fill={theme.palette.info.main} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Historical Logs */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mt: 1 }}>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Visit ID</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Containers Stowed</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Operation Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historicalVisits.map((visit: any) => (
                <TableRow key={visit.visitId} hover>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{visit.visitId}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{visit.containerCount}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{new Date(visit.moveCompleteTime).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}