import { Card, CardContent, Typography, Box } from '@mui/material';

interface HistoricalTrendsProps {
  data: any;
}

export default function HistoricalTrends({ data }: HistoricalTrendsProps) {
  if (!data) return null;

  return (
    <Card className="glass-card hover-lift" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" className="font-outfit" gutterBottom sx={{ fontWeight: 600 }}>
          Historical Averages
        </Typography>
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Average Stay
              </Typography>
              <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>
                {data.avg_hours || 0}
                <Typography component="span" variant="body1" sx={{ ml: 1, color: 'text.secondary' }}>hrs</Typography>
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Average Cranes
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {data.avg_cranes || 0}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Productivity
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {data.avg_mph || 0}
                <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.secondary' }}>mph</Typography>
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Visits
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {data.total_visits || 0}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
