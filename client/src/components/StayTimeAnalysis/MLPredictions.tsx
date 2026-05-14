import { Card, CardContent, Typography, Box } from '@mui/material';

interface MLPredictionsProps {
  data: any;
}

export default function MLPredictions({ data }: MLPredictionsProps) {
  if (!data) return null;

  return (
    <Card className="glass-card hover-lift" sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box 
        sx={{ 
          position: 'absolute', top: 0, left: 0, right: 0, height: '4px', 
          background: 'linear-gradient(90deg, #60A5FA, #A78BFA)' 
        }} 
      />
      <CardContent>
        <Typography variant="h6" className="font-outfit" gutterBottom sx={{ fontWeight: 600 }}>
          AI Prediction
        </Typography>
        <Box sx={{ mt: 3, mb: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Predicted Stay Time
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 700, color: 'transparent', backgroundClip: 'text', backgroundImage: 'linear-gradient(90deg, #60A5FA, #A78BFA)' }}>
            {data.avg_hours || 0}
            <Typography component="span" variant="h5" sx={{ ml: 1, color: 'text.secondary', fontWeight: 500 }}>hrs</Typography>
          </Typography>
        </Box>
        
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.8 }}>
            Based on historical weights, expected workloads, and active ML features.
            {data.source === 'metric_override' && ' (Adjusted for custom workload/cranes)'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
