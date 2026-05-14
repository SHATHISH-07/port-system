import { Box, Typography, Card, CardContent, Chip, Divider } from "@mui/material";

interface BerthRecommendationProps {
  analysis: any[];
  conflicts: any[];
  primary: any;
}

export default function BerthRecommendation({ analysis, conflicts, primary }: BerthRecommendationProps) {
  if (!analysis || analysis.length === 0) return null;

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 3 }}>
      <Typography variant="h6" className="font-outfit" sx={{ fontWeight: 700, mb: 2 }}>
        Berth Intelligence
      </Typography>

      <Card className="glass-card" sx={{ mb: 3, border: "1px solid", borderColor: "success.main" }}>
        <CardContent>
          <Typography variant="overline" color="success.main" sx={{ fontWeight: 800 }}>Primary Recommendation</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, mt: 1, mb: 2 }}>{primary.berth}</Typography>

          <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
            {primary.recommendation_reason}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip size="small" label={`${primary.recommended_cranes} Cranes Required`} color="primary" variant="outlined" />
            <Chip size="small" label={`${primary.cargo_concentration_pct}% Cargo Volume`} variant="outlined" />
            <Chip size="small" label={`Risk: ${primary.congestion_risk}`} color={primary.congestion_risk === 'High' ? 'error' : primary.congestion_risk === 'Medium' ? 'warning' : 'success'} />
          </Box>
        </CardContent>
      </Card>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 700, textTransform: "uppercase" }}>
        Alternative Berths
      </Typography>

      {analysis.slice(1).map((b) => (
        <Card key={b.berth} sx={{ mb: 2, bgcolor: "background.default", border: "1px solid", borderColor: "divider" }} className="hover-lift">
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{b.berth}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Score: {b.impact_score}</Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Volume</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{b.cargo_concentration_pct}%</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Transit</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{b.travel_distance_label}</Typography>
              </Box>
            </Box>

            {(b.hazardous > 0 || b.reefer > 0) && (
              <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                {b.hazardous > 0 && <Chip size="small" label={`${b.hazardous} Hazmat`} color="error" sx={{ height: 20, fontSize: '0.65rem' }} />}
                {b.reefer > 0 && <Chip size="small" label={`${b.reefer} Reefer`} color="info" sx={{ height: 20, fontSize: '0.65rem' }} />}
              </Box>
            )}
          </CardContent>
        </Card>
      ))}

      {conflicts && conflicts.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="subtitle2" color="error.main" sx={{ mb: 1.5, fontWeight: 700, textTransform: "uppercase" }}>
            Detected Conflicts
          </Typography>
          {conflicts.map(c => (
            <Box key={c.berth} sx={{ mb: 2, p: 2, borderRadius: 1, bgcolor: "rgba(239, 68, 68, 0.05)", borderLeft: "3px solid", borderColor: "error.main" }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{c.berth}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>{c.reason}</Typography>
              {c.conflict_with && c.conflict_with.length > 0 && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: "error.main", fontWeight: 500 }}>
                  Conflicts with: {c.conflict_with.join(", ")}
                </Typography>
              )}
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
