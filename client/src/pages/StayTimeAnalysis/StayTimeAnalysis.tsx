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

import StayTimeForm from './components/StayTimeForm';
import HistoryAnalysisTable from './components/HistoryAnalysisTable';
import StayTimeTrendChart from './components/StayTimeTrendChart';
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
      <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>
        Delay Analysis
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
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
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
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

  // Stay Time state
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vesselId, setVesselId] = useState('');
  const [loaded, setLoaded] = useState('');
  const [discharged, setDischarged] = useState('');
  // Committed values — only updated when API call succeeds on Run
  const [committedLoaded, setCommittedLoaded] = useState('');
  const [committedDischarged, setCommittedDischarged] = useState('');

  const handleAnalyze = async (e?: React.SubmitEvent<HTMLFormElement>) => {
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
        setAnalysisData(data);
      } else {
        setAnalysisData(data);
        // Commit the load/discharge values used for this successful run
        setCommittedLoaded(loaded);
        setCommittedDischarged(discharged);
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
  const visitsCount = Object.keys(analysisData?.actual?.visits || {}).length;
  const delayAnalysis = Array.isArray(analysisData?.delay_analysis) ? analysisData.delay_analysis : [];
  const isStayLoaded = !!analysisData && !analysisData.error && !loading;

  return (
    <Box
      sx={{
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header Control Bar */}
      <Box
        sx={{
          px: { xs: 2.5, md: 4 },
          py: 2,
          bgcolor: alpha(theme.palette.background.default, 0.9),
          backdropFilter: 'blur(25px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {/* Top Header Control Bar - Stay Time */}
        <Box sx={{ mb: 1 }}>
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

      </Box>

      {(error) && (
        <Box sx={{ px: { xs: 2.5, md: 4 }, mt: 2 }}>
          <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ borderRadius: 2, bgcolor: theme.palette.error.main }}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{ flex: 1 }}>
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Stay Time Section */}
          <Box>
            {isStayLoaded ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  animation: 'fadeIn 0.6s ease-out forwards',
                  '@keyframes fadeIn': {
                    from: { opacity: 0, transform: 'translateY(20px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <Grid container spacing={2}>
                  {/* Single Unified Stats Card */}
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
                      {/* Left Side: Main Predicted Stay */}
                      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: { md: '40%' } }}>
                        <Box sx={{ mb: 2 }}>
                          <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            {analysisData?.vessel_service || vesselId}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Predicted Port Stay
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                            <Typography sx={{ fontWeight: 900, letterSpacing: '-0.03em', fontSize: { xs: '3.5rem', md: '4.5rem' }, lineHeight: 1, color: 'text.primary' }}>
                              {formatNumber(predictedAvg)}
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary', opacity: 0.7 }}>
                              hours
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
                            {committedLoaded || committedDischarged ? (
                              <>
                                Predicted using{' '}
                                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                  {committedLoaded || 0}
                                </Box>{' '}
                                load moves and{' '}
                                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                  {committedDischarged || 0}
                                </Box>{' '}
                                discharge moves.
                              </>
                            ) : (
                              <>
                                Based on{' '}
                                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                  {visitsCount}
                                </Box>{' '}
                                historical visits.
                              </>
                            )}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Divider for Desktop */}
                      <Box sx={{ display: { xs: 'none', md: 'block' }, width: '1px', height: '120px', bgcolor: 'divider', zIndex: 1 }} />
                      {/* Divider for Mobile */}
                      <Box sx={{ display: { xs: 'block', md: 'none' }, height: '1px', width: '100%', bgcolor: 'divider', zIndex: 1 }} />

                      {/* Right Side: Sub Metrics Grid */}
                      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: { xs: 3, md: 5 }, flex: '1 1 auto', pt: { xs: 1, md: 0 } }}>
                        <Box sx={{ flex: '1 1 calc(33% - 20px)', minWidth: '120px' }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Historical Baseline
                          </Typography>
                          <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'text.primary', mt: 0.5, lineHeight: 1 }}>
                            {formatNumber(actualAvg)}<span style={{ fontSize: '1rem', opacity: 0.6, fontWeight: 700, marginLeft: '2px' }}>h</span>
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                            Typical stay duration
                          </Typography>
                        </Box>
                        <Box sx={{ flex: '1 1 calc(33% - 20px)', minWidth: '120px' }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            History Coverage
                          </Typography>
                          <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'primary.main', mt: 0.5, lineHeight: 1 }}>
                            {formatNumber(visitsCount, 0)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                            Analyzed visits
                          </Typography>
                        </Box>
                        <Box sx={{ flex: '1 1 calc(33% - 20px)', minWidth: '120px' }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Average Restows
                          </Typography>
                          <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: 'warning.main', mt: 0.5, lineHeight: 1 }}>
                            {formatNumber(analysisData?.actual?.avg_restows ?? 0, 0)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                            Per historic visit
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

                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12 }}>
                    <StayTimeTrendChart visits={analysisData?.actual?.visits || {}} avgHours={actualAvg} />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <DelayAnalysisPanel delays={delayAnalysis} />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <HistoryAnalysisTable
                      actualVisits={analysisData?.actual?.visits || {}}
                      assignments={analysisData?.crane_assignment || []}
                    />
                  </Grid>
                </Grid>
              </Box>
            ) : (
              !isStayLoaded && !loading && (
                <Box sx={{ textAlign: 'center', mt: '12rem', opacity: 0.8 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Ready for Stay Time Analysis
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Enter a Vessel ID or Service code above to generate operational insights.
                  </Typography>
                </Box>
              )
            )}
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress size={40} thickness={4.5} />
              </Box>
            )}
          </Box>

        </Box>
      </Box>
    </Box>
  );
}