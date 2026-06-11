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
import { EquipmentBreakdownChart } from './components/EquipmentBreakdownChart';
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
              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: delay.impact === 'High' ? 'error.main' : 'warning.main', mb: 0.5, display: 'block' }}>
                {delay.factor}
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 500, lineHeight: 1.4 }}>
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
  const [craneCount, setCraneCount] = useState('1');
  const [equipmentBreakdown, setEquipmentBreakdown] = useState<Record<string, number>>({});


  const handleAnalyze = async (e?: React.SubmitEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();

    const trimmedVesselId = vesselId.trim();
    if (!trimmedVesselId) return;

    setLoading(true);
    setError(null);

    try {
      const dataPayload: Record<string, any> = {
        vessel_id: trimmedVesselId,
      };

      if (loaded.trim() !== '') {
        const loadedValue = Number(loaded);
        if (Number.isNaN(loadedValue)) throw new Error('Load Moves must be a valid number.');
        dataPayload.load_moves = loadedValue;
      }

      if (discharged.trim() !== '') {
        const dischargedValue = Number(discharged);
        if (Number.isNaN(dischargedValue)) throw new Error('Discharge must be a valid number.');
        dataPayload.discharge_moves = dischargedValue;
      }

      if (craneCount.trim() !== '') {
        const craneValue = Number(craneCount);
        if (Number.isNaN(craneValue)) throw new Error('Crane Count must be a valid number.');
        dataPayload.crane_count = craneValue;
      }

      if (Object.keys(equipmentBreakdown).length > 0) {
        dataPayload.equipment_breakdown = equipmentBreakdown;
      }

      const response = await api.post('/vessel/analysis', dataPayload);
      const data = response.data;

      if (data?.error) {
        setError(data.error);
        setAnalysisData(data);
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
  const visitsCount = Object.keys(analysisData?.actual?.visits || {}).length;
  const delayAnalysis = Array.isArray(analysisData?.delay_analysis) ? analysisData.delay_analysis : [];
  const isStayLoaded = !!analysisData && !analysisData.error && !loading;

  // ML Prediction Factors
  const modelFactors = analysisData?.predicted?.model_factors || {};
  const fTotalMoves = modelFactors.total_moves || 0;
  const fCranes = modelFactors.crane_count || 1;
  const fMph = modelFactors.historical_mph_avg || 0;

  const cBreakdown = analysisData?.actual?.container_breakdown || {};
  const cTotal = cBreakdown.total || 0;
  const c40 = cBreakdown.ft40 || 0;
  const c20 = cBreakdown.ft20 || 0;
  const cHeavy = cBreakdown.heavy || 0;
  const cReefer = cBreakdown.reefer || 0;
  const cHaz = cBreakdown.hazard || 0;
  const cOog = cBreakdown.oog || 0;

  const MetricBox = ({ title, value, unit, subtitle, color = 'text.primary' }: any) => (
    <Box sx={{ flex: '1 1 calc(25% - 24px)', minWidth: '95px' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: '1.6rem', fontWeight: 900, color, mt: 0.25, lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: '0.9rem', opacity: 0.6, fontWeight: 700, marginLeft: '2px' }}>{unit}</span>}
      </Typography>
      {subtitle && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );

  const MetricGroup = ({ title, children }: any) => (
    <Box sx={{ width: '100%', mb: 1 }}>
      <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.1em', mb: 1, display: 'block' }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 2, md: 3 }, p: 2.5, borderRadius: 3, bgcolor: alpha(theme.palette.background.default, 0.5), border: '1px solid', borderColor: alpha(theme.palette.divider, 0.6) }}>
        {children}
      </Box>
    </Box>
  );

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
            craneCount={craneCount}
            onCraneCountChange={setCraneCount}
            equipmentBreakdown={equipmentBreakdown}
            onEquipmentBreakdownChange={setEquipmentBreakdown}
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
      <Box sx={{ flex: 1, pb: { xs: 10, sm: 4, md: 2 } }}>
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
                        justifyContent: 'flex-start',
                        gap: { xs: 4, md: 6 },
                        boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.05)}`
                      }}
                    >
                      {/* Left Side: Main Predicted Stay */}
                      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
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
                            <Typography sx={{ fontWeight: 900, letterSpacing: '-0.03em', fontSize: { xs: '4.5rem', md: '6.5rem' }, lineHeight: 1, color: 'text.primary' }}>
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
                            Prediction is based on <strong>{visitsCount}</strong> historical visits.
                          </Typography>
                        </Box>
                      </Box>

                      {/* Divider for Desktop */}
                      <Box sx={{ display: { xs: 'none', md: 'block' }, width: '1px', height: '120px', bgcolor: 'divider', zIndex: 1 }} />
                      {/* Divider for Mobile */}
                      <Box sx={{ display: { xs: 'block', md: 'none' }, height: '1px', width: '100%', bgcolor: 'divider', zIndex: 1 }} />

                      {/* Right Side: Prediction Drivers Grid */}
                      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 1, flex: '1 1 auto', pt: { xs: 1, md: 0 } }}>
                        
                        <MetricGroup title="Operational Performance">
                          <MetricBox title="Historical Baseline" value={formatNumber(actualAvg)} unit="h" subtitle="Typical stay duration" />
                          <MetricBox title="Avg Workload" value={formatNumber(fTotalMoves, 0)} subtitle="Total Moves" />
                          <MetricBox title="Avg Resources" value={fCranes} subtitle="Assigned Cranes" color="primary.main" />
                          <MetricBox title="Avg Productivity" value={formatNumber(fMph, 1)} unit="MPH" subtitle="Moves per Hour" />
                          <MetricBox title="History Coverage" value={formatNumber(visitsCount, 0)} subtitle="Analyzed visits" color="primary.main" />
                        </MetricGroup>

                        <MetricGroup title="Container Classification">
                          <MetricBox title="Total Historical Vol." value={formatNumber(cTotal, 0)} color="info.main" />
                          <MetricBox title="40FT Containers" value={formatNumber(c40, 0)} />
                          <MetricBox title="20FT Containers" value={formatNumber(c20, 0)} />
                          <MetricBox title="Heavy" value={formatNumber(cHeavy, 0)} color="error.main" />
                          <MetricBox title="Reefer Units" value={formatNumber(cReefer, 0)} color="info.main" />
                          <MetricBox title="Hazardous" value={formatNumber(cHaz, 0)} color="warning.main" />
                          <MetricBox title="Out of Gauge" value={formatNumber(cOog, 0)} />
                        </MetricGroup>
                        
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
                  <Grid size={{ xs: 12, md: 6 }}>
                    <StayTimeTrendChart visits={analysisData?.actual?.visits || {}} avgHours={actualAvg} />
                  </Grid>

                  {analysisData?.actual?.container_breakdown?.equipment_breakdown && Object.keys(analysisData.actual.container_breakdown.equipment_breakdown).length > 0 ? (
                    <Grid size={{ xs: 12, md: 6 }}>
                      <EquipmentBreakdownChart equipmentData={analysisData.actual.container_breakdown.equipment_breakdown} />
                    </Grid>
                  ) : (
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', borderRadius: 4, border: '1px dashed', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">No Equipment Data</Typography>
                      </Box>
                    </Grid>
                  )}

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