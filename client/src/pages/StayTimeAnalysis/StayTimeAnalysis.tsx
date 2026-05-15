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
        width: '100%',
        overflowX: 'hidden',
      }}
    >
      <Box
        sx={{
          width: '100%',
          px: { xs: 2, sm: 3, md: 4 },
          py: { xs: 2, md: 4 },
        }}
      >
        <Box
          sx={{
            mb: 4,
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            width: '100%',
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
          <Alert
            severity="error"
            variant="outlined"
            sx={{
              mb: 4,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.error.main, 0.02),
            }}
          >
            {error}
          </Alert>
        )}

        {!isLoaded && !loading && !error && (
          <Box
            sx={{
              py: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              bgcolor: alpha(theme.palette.background.paper, 0.5),
              borderRadius: 4,
              border: '2px dashed',
              borderColor: 'divider',
              width: '100%',
            }}
          >
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
              Enter a Vessel ID to begin analysis
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Historical data and predictive insights will appear here.
            </Typography>
          </Box>
        )}

        {loading && (
          <Box sx={{ py: 12, textAlign: 'center', width: '100%' }}>
            <CircularProgress size={40} thickness={4} sx={{ mb: 3 }} />
            <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Generating analysis...
            </Typography>
          </Box>
        )}

        {isLoaded && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <Grid container spacing={3} sx={{ width: '100%', m: 0 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <HeroMetricCard
                  title="Predicted Stay"
                  value={`${formatNumber(predictedAvg)}h`}
                  subtitle="Forecast for next visit"
                  color={theme.palette.primary.main}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <HeroMetricCard
                  title="Historical Baseline"
                  value={`${formatNumber(actualAvg)}h`}
                  subtitle={`${visitsCount} visits • Avg stay across history`}
                  color={theme.palette.text.primary}
                />
              </Grid>
            </Grid>

            <Grid container spacing={3} sx={{ width: '100%', m: 0 }}>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <MetricCard
                  title="Variance"
                  value={`${formatNumber(variance)}h`}
                  subtitle="Predicted minus actual"
                  accent={variance >= 0 ? 'warning' : 'success'}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <MetricCard
                  title="Visits"
                  value={formatNumber(visitsCount, 0)}
                  subtitle="Historical visits returned"
                  accent="primary"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <MetricCard
                  title="Actual Avg"
                  value={`${formatNumber(actualAvg)}h`}
                  subtitle="Historical baseline"
                  accent="success"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <MetricCard
                  title="Predicted Avg"
                  value={`${formatNumber(predictedAvg)}h`}
                  subtitle="Model output"
                  accent="warning"
                />
              </Grid>
            </Grid>

            <DelayAnalysisPanel delays={delayAnalysis} />

            <Grid container spacing={3} sx={{ width: '100%', m: 0 }}>
              <Grid size={{ xs: 12, xl: 7 }}>
                <StayTimeTrendChart visits={analysisData?.actual?.visits || {}} avgHours={actualAvg} />
              </Grid>

              <Grid size={{ xs: 12, xl: 5 }}>
                <PortBreakdownChart visits={analysisData?.actual?.visits || {}} />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <ComparisonChart
                  actualAvg={actualAvg}
                  predictedAvg={predictedAvg}
                  maxHours={analysisData?.actual?.max_hours}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <HistoryAnalysisTable
                  actualVisits={analysisData?.actual?.visits || {}}
                  assignments={analysisData?.crane_assignment || []}
                  avgStay={analysisData?.actual?.avg_hours || 0}
                  predictedStay={analysisData?.predicted?.avg_hours || 0}
                  vesselService={analysisData?.vessel_service || vesselId}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>
    </Box>
  );
}