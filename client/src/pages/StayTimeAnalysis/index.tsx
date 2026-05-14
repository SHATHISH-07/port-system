import { useState } from 'react';
import { Box, Typography, Container, CircularProgress, Alert } from '@mui/material';
import StayTimeForm from '../../components/StayTimeAnalysis/StayTimeForm';
import HistoricalTrends from '../../components/StayTimeAnalysis/HistoricalTrends';
import MLPredictions from '../../components/StayTimeAnalysis/MLPredictions';
import { api } from '../../api/api';

export default function StayTimeAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);

  const fetchAnalysis = async (params: { vesselId: string; loaded?: number; discharged?: number; craneCount?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('vesselId', params.vesselId);
      if (params.loaded !== undefined) queryParams.append('loaded', params.loaded.toString());
      if (params.discharged !== undefined) queryParams.append('discharged', params.discharged.toString());
      if (params.craneCount !== undefined) queryParams.append('craneCount', params.craneCount.toString());

      const res = await api.get(`/vessel/analysis?${queryParams.toString()}`);
      const data = res.data;
      if (data.error) {
        setError(data.error);
        setAnalysisData(null);
      } else {
        setAnalysisData(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analysis');
      setAnalysisData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" className="font-outfit" gutterBottom sx={{ fontWeight: 700 }}>
            Stay Time Analysis
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Predict vessel turnaround times based on historical trends and machine learning.
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <StayTimeForm onSubmit={fetchAnalysis} loading={loading} />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {loading && !analysisData && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {analysisData && !loading && (
          <Box className="animate-slide-up">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
              <Box>
                <HistoricalTrends data={analysisData.history} />
              </Box>
              <Box>
                <MLPredictions data={analysisData.predicted} />
              </Box>
            </Box>

            {/* If there's an actual/current stay matching, we can show it here too */}
            {analysisData.actual && Object.keys(analysisData.actual.visits || {}).length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  This vessel has a current active visit in the yard.
                </Alert>
              </Box>
            )}
          </Box>
        )}
      </Container>
    </Box>
  );
}
