import React, { useState } from 'react';
import {
  Box,
  Typography,
  Alert,
  Grid,
  alpha,
  useTheme,
  CircularProgress,
  Paper,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

import MetricCard from './components/MetricCard';
import StayTimeForm from './components/StayTimeForm';
import HistoryAnalysisTable from './components/HistoryAnalysisTable';
import StayTimeTrendChart from './components/StayTimeTrendChart';
import ComparisonChart from './components/ComparisonChart';
import PortBreakdownChart from './components/PortBreakdownChart';
import { api } from '../../api/api';

type AnalysisData = any;

function formatNumber(value?: number, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

function extractApiError(err: any) {
  const detail = err?.response?.data?.detail;
  const message = err?.response?.data?.message;

  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        const loc = Array.isArray(item?.loc) ? item.loc.join('.') : '';
        const msg = item?.msg || 'Validation error';
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join(' | ');
  }

  if (typeof detail === 'string') return detail;
  if (typeof message === 'string') return message;
  return err?.message || 'Connection error. Please ensure the backend is running.';
}

function HeroMetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, md: 4 },
        height: '100%',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        border: '1px solid',
        borderColor: alpha(color, 0.16),
        background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(color, 0.015)} 100%)`,
        boxShadow: `0 8px 32px ${alpha(color, 0.10)}`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 40px ${alpha(color, 0.16)}`,
        },
      }}
    >
      <Typography
        variant="overline"
        sx={{
          color: 'text.secondary',
          fontWeight: 800,
          letterSpacing: '0.1em',
          mb: 1,
          fontSize: '0.85rem',
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="h3"
        sx={{
          color,
          fontWeight: 900,
          mb: 1,
          lineHeight: 1,
          fontSize: { xs: '2rem', md: '2.5rem' },
        }}
      >
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        {subtitle}
      </Typography>
    </Paper>
  );
}

function DelayAnalysisPanel({ delays }: { delays: any[] }) {
  const theme = useTheme();

  if (!delays.length) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 6px 24px rgba(0,0,0,0.03)',
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
        Delay Analysis
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Signals detected from move timing and restow activity
      </Typography>

      <Stack spacing={1.25}>
        {delays.map((delay: any, index: number) => (
          <Box
            key={`${delay.factor || 'delay'}-${index}`}
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: alpha(
                delay.impact === 'High'
                  ? theme.palette.error.main
                  : theme.palette.warning.main,
                0.18
              ),
              bgcolor: alpha(
                delay.impact === 'High'
                  ? theme.palette.error.main
                  : theme.palette.warning.main,
                0.04
              ),
              display: 'flex',
              gap: 1.5,
              alignItems: 'flex-start',
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                mt: 0.6,
                borderRadius: '50%',
                bgcolor: delay.impact === 'High' ? 'error.main' : 'warning.main',
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.35 }}>
                {delay.factor}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.55 }}>
                {delay.reason}
              </Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export default function StayTimeAnalysis() {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vesselId, setVesselId] = useState('');
  const [loaded, setLoaded] = useState('');
  const [discharged, setDischarged] = useState('');

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmedVesselId = vesselId.trim();
    if (!trimmedVesselId) return;

    setLoading(true);
    setError(null);

    try {
      const params: Record<string, any> = {
        vesselId: trimmedVesselId,
        vessel_id: trimmedVesselId,
        vessel_service: trimmedVesselId,
      };

      if (loaded.trim() !== '') {
        const loadedValue = Number(loaded);
        if (Number.isNaN(loadedValue)) {
          setError('Load Moves must be a valid number.');
          setAnalysisData(null);
          setLoading(false);
          return;
        }
        params.loaded = loadedValue;
      }

      if (discharged.trim() !== '') {
        const dischargedValue = Number(discharged);
        if (Number.isNaN(dischargedValue)) {
          setError('Discharge must be a valid number.');
          setAnalysisData(null);
          setLoading(false);
          return;
        }
        params.discharged = dischargedValue;
      }

      const response = await api.get('/vessel/analysis', { params });
      const data = response.data;

      if (data?.error) {
        setError(data.error);
        setAnalysisData(null);
      } else {
        setAnalysisData(data);
      }
    } catch (err: any) {
      setError(extractApiError(err));
      setAnalysisData(null);
    } finally {
      setLoading(false);
    }
  };

  const actualAvg = analysisData?.actual?.avg_hours ?? 0;
  const predictedAvg = analysisData?.predicted?.avg_hours ?? 0;
  const variance = predictedAvg - actualAvg;
  const visitsCount = Object.keys(analysisData?.actual?.visits || {}).length;
  const delayAnalysis = Array.isArray(analysisData?.delay_analysis) ? analysisData.delay_analysis : [];
  const isLoaded = !!analysisData && !loading;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Control Bar */}
      <Box
        sx={{
          px: { xs: 3, md: 6 },
          py: 4,
          bgcolor: alpha(theme.palette.background.default, 0.9),
          backdropFilter: 'blur(25px)',
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          borderBottom: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
        }}
      >
        <StayTimeForm
          value={vesselId}
          onChange={setVesselId}
          loaded={loaded}
          onLoadedChange={setLoaded}
          discharged={discharged}
          onDischargedChange={setDischarged}
          onSubmit={handleAnalyze}
          loading={loading}
        />
      </Box>

      {error && (
        <Box sx={{ px: { xs: 3, md: 6 }, mt: 2 }}>
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setError(null)}
            sx={{
              borderRadius: 3,
              bgcolor: theme.palette.error.main,
              boxShadow: `0 8px 24px ${alpha(theme.palette.error.main, 0.2)}`,
            }}
          >
            {error}
          </Alert>
        </Box>
      )}

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          scrollBehavior: 'smooth',
        }}
      >

        <Box sx={{ p: { xs: 2, sm: 3, md: 6 }, flex: 1 }}>
          {!isLoaded && !loading && (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                opacity: 0.8,
              }}
            >
            <Box
              sx={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                bgcolor: alpha(theme.palette.primary.main, 0.05),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <SearchIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
              Ready for Analysis
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400 }}>
              Enter a Vessel ID or Service code above to generate operational insights.
            </Typography>
          </Box>
        )}

        {loading && (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress
              size={56}
              thickness={5}
              sx={{
                mb: 3,
                color: theme.palette.primary.main,
                '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
              }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Synthesizing Data
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Calculating variance, crane intensity, and bottleneck risks...
            </Typography>
          </Box>
        )}

        {isLoaded && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              animation: 'fadeIn 0.6s ease-out forwards',
              '@keyframes fadeIn': {
                from: { opacity: 0, transform: 'translateY(20px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            {/* Hero Header */}
            <Box>
              <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.15em' }}>
                Operational Forecast
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 0.5 }}>
                <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {analysisData?.vessel_service || vesselId}
                </Typography>
                <Typography variant="h5" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                  Analysis Report
                </Typography>
              </Box>
            </Box>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 4,
                    borderRadius: 5,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.15),
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.5)} 100%)`,
                    backdropFilter: 'blur(10px)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ position: 'relative', zIndex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', mb: 1, textTransform: 'uppercase' }}>
                      Predicted Port Stay
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography variant="h1" sx={{ fontWeight: 950, letterSpacing: '-0.04em', fontSize: { xs: '3.5rem', md: '5rem' } }}>
                        {formatNumber(predictedAvg)}
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.secondary', opacity: 0.5 }}>
                        hours
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary', fontWeight: 500 }}>
                      Based on {visitsCount} historical visits and current crane intensity targets.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      position: 'absolute',
                      right: -40,
                      bottom: -40,
                      width: 240,
                      height: 240,
                      borderRadius: '50%',
                      background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
                      zIndex: 0,
                    }}
                  />
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, md: 5 }}>
                <Stack spacing={3} sx={{ height: '100%' }}>
                  <MetricCard
                    title="Historical Baseline"
                    value={`${formatNumber(actualAvg)}h`}
                    subtitle="Typical stay duration"
                    accent="default"
                  />
                  <MetricCard
                    title="Estimated Variance"
                    value={`${variance >= 0 ? '+' : ''}${formatNumber(variance)}h`}
                    subtitle="Relative to historical mean"
                    accent={variance >= 0 ? 'warning' : 'success'}
                  />
                </Stack>
              </Grid>
            </Grid>

            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>
                Resource Allocation & Efficiency
              </Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <MetricCard
                    title="History Coverage"
                    value={formatNumber(visitsCount, 0)}
                    subtitle="Analyzed visits"
                    accent="primary"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <MetricCard
                    title="Crane Target"
                    value="25.0"
                    subtitle="MPHC objective"
                    accent="success"
                  />
                </Grid>
              </Grid>
            </Box>

            <Grid container spacing={4}>
              <Grid size={{ xs: 12 }}>
                <StayTimeTrendChart visits={analysisData?.actual?.visits || {}} avgHours={actualAvg} />
              </Grid>

              <Grid size={{ xs: 12, lg: 5 }}>
                <PortBreakdownChart visits={analysisData?.actual?.visits || {}} />
              </Grid>
              <Grid size={{ xs: 12, lg: 7 }}>
                <ComparisonChart
                  actualAvg={actualAvg}
                  predictedAvg={predictedAvg}
                  maxHours={analysisData?.actual?.max_hours}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <DelayAnalysisPanel delays={delayAnalysis} />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <HistoryAnalysisTable
                  actualVisits={analysisData?.actual?.visits || {}}
                  assignments={analysisData?.crane_assignment || []}
                  avgStay={actualAvg}
                  predictedStay={predictedAvg}
                  vesselService={analysisData?.vessel_service || vesselId}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>
    </Box>
  </Box>
  );
}