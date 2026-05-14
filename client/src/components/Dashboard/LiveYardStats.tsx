import { Box, Typography, Card, CardContent } from "@mui/material";

interface LiveYardStatsProps {
  summary: any;
}

export default function LiveYardStats({ summary }: LiveYardStatsProps) {
  if (!summary) return null;

  return (
    <Box>
      <Typography variant="h5" className="font-outfit" sx={{ fontWeight: 800, mb: 4 }}>
        Terminal Statistics
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
        <Box>
          <Card className="glass-card hover-lift">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Total Volume</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 1, color: "primary.main" }}>
                {summary.total_containers}
              </Typography>
              <Typography variant="body2" color="text.secondary">Active container moves required</Typography>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Card className="glass-card hover-lift">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Impacted Blocks</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 1 }}>
                {summary.total_blocks}
              </Typography>
              <Typography variant="body2" color="text.secondary">Yard blocks handling this vessel</Typography>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Card className="glass-card hover-lift" sx={{ border: summary.hazmat_total > 0 ? "1px solid #ef4444" : undefined }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Hazardous Cargo</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 1, color: summary.hazmat_total > 0 ? "error.main" : "inherit" }}>
                {summary.hazmat_total}
              </Typography>
              <Typography variant="body2" color="text.secondary">Classified HAZMAT units requiring buffer</Typography>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Card className="glass-card hover-lift" sx={{ border: summary.reefer_total > 0 ? "1px solid #3b82f6" : undefined }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Refrigerated Units</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 1, color: summary.reefer_total > 0 ? "info.main" : "inherit" }}>
                {summary.reefer_total}
              </Typography>
              <Typography variant="body2" color="text.secondary">Reefers requiring active power allocation</Typography>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Card className="glass-card hover-lift" sx={{ border: summary.oog_total > 0 ? "1px solid #f59e0b" : undefined }}>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Out Of Gauge</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 1, color: summary.oog_total > 0 ? "warning.main" : "inherit" }}>
                {summary.oog_total}
              </Typography>
              <Typography variant="body2" color="text.secondary">Oversized units requiring special handling</Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
