import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api } from '../../../api/api';
import VesselDeckGrid from './VesselDeckGrid';

export default function VisualizationTab({
  vesselId,
  yardId,
  visitId,
  containerIds,
  globalFile,
  globalContainerText,
  trigger,
}: any) {

  // Mode: 'HISTORICAL' | 'CURRENT' | 'DIRECT_UPLOAD'
  const [visMode, setVisMode] = useState<'HISTORICAL' | 'CURRENT' | 'DIRECT_UPLOAD'>(
    visitId ? 'HISTORICAL' : containerIds && containerIds.length > 0 ? 'CURRENT' : 'DIRECT_UPLOAD'
  );

  // States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visData, setVisData] = useState<any>(null);
  const [selectedBay, setSelectedBay] = useState<string>('');

  const fetchVisualization = async () => {
    if (!vesselId) {
      setError('Vessel ID is required. Please search a Vessel ID in the header first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let response;
      const targetFile = globalFile;
      const targetText = globalContainerText?.trim();

      const formData = new FormData();
      formData.append('vesselId', vesselId);
      if (yardId) {
        formData.append('yardId', yardId);
      }
      if (visMode === 'HISTORICAL' && visitId) {
        formData.append('visitId', visitId);
      }
      if (targetFile) {
        formData.append('file', targetFile);
      }
      
      if (visMode === 'CURRENT' && containerIds && containerIds.length > 0) {
        formData.append('containerIds', JSON.stringify(containerIds));
      } else if (targetText) {
        formData.append('containerIds', targetText);
      }

      response = await api.post('/stowage/visualization', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setVisData(response.data);

      // Auto-select the first available bay block
      const groups = response.data.map?.groups || {};
      const bays = Object.keys(groups);
      if (bays.length > 0) {
        setSelectedBay(bays[0]);
      } else {
        setSelectedBay('');
      }

    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to generate vessel deck visualization.');
    } finally {
      setLoading(false);
    }
  };

  // Automatically trigger fetch when header button is clicked
  useEffect(() => {
    if (trigger > 0) {
      fetchVisualization();
    }
  }, [trigger]);

  // Triggers loading when shared states change
  useEffect(() => {
    if (visitId) {
      setVisMode('HISTORICAL');
    } else if (containerIds && containerIds.length > 0) {
      setVisMode('CURRENT');
    } else {
      setVisMode('DIRECT_UPLOAD');
      setVisData(null);
    }
  }, [visitId, containerIds]);

  useEffect(() => {
    if (visMode === 'HISTORICAL' && visitId) {
      fetchVisualization();
    } else if (visMode === 'CURRENT' && containerIds && containerIds.length > 0) {
      fetchVisualization();
    }
  }, [visMode, visitId, containerIds]);

  // Loader State
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={45} thickness={4} sx={{ mb: 2.5 }} />
        <Typography variant="body2" color="text.secondary">
          Mapping container layouts and plotting vessel digital twin cross-sections...
        </Typography>
      </Box>
    );
  }

  // Active Visual Layout Grid state
  if (!visData) {
    return (
      <Box sx={{ py: 8, textAlign: 'center', opacity: 0.8 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Ready to Visualize</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please search a Vessel ID and select a Container List file, paste container IDs, or click a historical Visit ID, then click "Visualize Layout".
        </Typography>
        {error && (
          <Alert severity="error" variant="outlined" sx={{ mt: 4, borderRadius: 2, textAlign: 'left', maxWidth: 600, mx: 'auto' }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  const groups = visData.map?.groups || {};
  const bays = Object.keys(groups);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Visualizer Filters & Banner Control */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {visMode === 'HISTORICAL' ? `Historical Deck: ${visitId}` : `Current Optimization Plan`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Interactive structural cross-sections colorized by load ballast bands.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {bays.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="bay-select-label">Select Bay</InputLabel>
              <Select
                labelId="bay-select-label"
                value={selectedBay}
                label="Select Bay"
                onChange={(e) => setSelectedBay(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                {bays.map((bay) => (
                  <MenuItem key={bay} value={bay}>
                    {bay}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Button
            variant="text"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={() => fetchVisualization()}
            sx={{ fontWeight: 700, textTransform: 'none' }}
          >
            Refresh Layout
          </Button>
        </Box>
      </Paper>

      {/* Grid rendering */}
      {selectedBay ? (
        <VesselDeckGrid bayId={selectedBay} bayData={groups[selectedBay]} summary={visData.summary} />
      ) : (
        <Paper elevation={0} sx={{ py: 8, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
          <Typography color="text.secondary" variant="body2">
            No stowed slots found matching search filters for this vessel.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
