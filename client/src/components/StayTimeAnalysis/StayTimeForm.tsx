import { useState } from 'react';
import { Card, CardContent, TextField, Button, Box, Typography } from '@mui/material';

interface StayTimeFormProps {
  onSubmit: (params: {
    vesselId: string;
    loaded?: number;
    discharged?: number;
    craneCount?: number;
  }) => void;
  loading: boolean;
}

export default function StayTimeForm({ onSubmit, loading }: StayTimeFormProps) {
  const [vesselId, setVesselId] = useState('');
  const [loaded, setLoaded] = useState('');
  const [discharged, setDischarged] = useState('');
  const [craneCount, setCraneCount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vesselId) return;
    onSubmit({
      vesselId,
      loaded: loaded ? parseInt(loaded) : undefined,
      discharged: discharged ? parseInt(discharged) : undefined,
      craneCount: craneCount ? parseInt(craneCount) : undefined,
    });
  };

  return (
    <Card className="glass-card">
      <CardContent>
        <Typography variant="h6" gutterBottom className="font-outfit" sx={{ fontWeight: 600 }}>
          Vessel Parameters
        </Typography>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField 
              label="Vessel ID (e.g., VS-CWIT-09)" 
              value={vesselId} 
              onChange={(e) => setVesselId(e.target.value)}
              required
              fullWidth
              size="small"
              sx={{ flex: '1 1 200px' }}
            />
            <TextField 
              label="Expected Loads" 
              type="number"
              value={loaded} 
              onChange={(e) => setLoaded(e.target.value)}
              size="small"
              sx={{ flex: '1 1 120px' }}
            />
            <TextField 
              label="Expected Discharges" 
              type="number"
              value={discharged} 
              onChange={(e) => setDischarged(e.target.value)}
              size="small"
              sx={{ flex: '1 1 120px' }}
            />
            <TextField 
              label="Available Cranes" 
              type="number"
              value={craneCount} 
              onChange={(e) => setCraneCount(e.target.value)}
              size="small"
              sx={{ flex: '1 1 120px' }}
            />
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading || !vesselId}
              sx={{ flex: '1 1 120px', height: 40 }}
            >
              {loading ? 'Analyzing...' : 'Analyze Stay'}
            </Button>
          </Box>
        </form>
      </CardContent>
    </Card>
  );
}
