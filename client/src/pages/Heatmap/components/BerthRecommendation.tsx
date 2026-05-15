import { Box, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface BerthRecommendationProps {
  analysis: any[];
  conflicts: any[];
  primary: any;
}

function riskColor(risk?: string) {
  const v = (risk || "").toLowerCase();
  if (v.includes("high")) return "error";
  if (v.includes("medium")) return "warning";
  return "success";
}

export default function BerthRecommendation({ analysis, conflicts, primary }: BerthRecommendationProps) {
  const theme = useTheme();

  if (!analysis || analysis.length === 0) return null;

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Stack spacing={1.25} sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>
          Berth Intelligence
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Recommended berth selection with alternatives and detected conflicts.
        </Typography>
      </Stack>

      <Card
        variant="outlined"
        sx={{
          mb: 2.5,
          borderRadius: 3,
          overflow: "hidden",
          borderColor: alpha(theme.palette.success.main, 0.35),
          background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.10)} 0%, ${alpha(
            theme.palette.background.paper,
            0.98
          )} 48%, ${theme.palette.background.paper} 100%)`,
        }}
      >
        <CardContent sx={{ p: 2.75, "&:last-child": { pb: 2.75 } }}>
          <Stack spacing={2}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start" }}>
              <Box>
                <Typography variant="overline" sx={{ color: "success.main", fontWeight: 800, letterSpacing: 1 }}>
                  Primary Recommendation
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5 }}>
                  {primary?.berth || "—"}
                </Typography>
              </Box>

              <Chip
                label={primary?.congestion_risk ? `Risk: ${primary.congestion_risk}` : "Risk: —"}
                color={riskColor(primary?.congestion_risk) as any}
                variant="filled"
              />
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
              {primary?.recommendation_reason || "No recommendation reason available."}
            </Typography>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              <Chip
                size="small"
                label={`${primary?.recommended_cranes ?? 0} cranes required`}
                variant="outlined"
                color="primary"
              />
              <Chip
                size="small"
                label={`${primary?.cargo_concentration_pct ?? 0}% cargo volume`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={primary?.congestion_risk || "Unknown risk"}
                color={riskColor(primary?.congestion_risk) as any}
                variant="outlined"
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Typography
        variant="subtitle2"
        sx={{ mb: 1.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "text.secondary" }}
      >
        Alternative Berths
      </Typography>

      <Stack spacing={1.5}>
        {analysis.slice(1).map((b) => (
          <Card
            key={b.berth}
            variant="outlined"
            sx={{
              borderRadius: 2.5,
              borderColor: "divider",
              backgroundColor: "background.paper",
              transition: "transform 160ms ease, box-shadow 160ms ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: `0 12px 26px ${alpha(theme.palette.common.black, 0.08)}`,
              },
            }}
          >
            <CardContent sx={{ p: 2.1, "&:last-child": { pb: 2.1 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  {b.berth}
                </Typography>
                <Chip size="small" label={`Score ${b.impact_score ?? "—"}`} variant="outlined" />
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Cargo concentration
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {b.cargo_concentration_pct ?? 0}%
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Transit
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {b.travel_distance_label || "—"}
                  </Typography>
                </Box>
              </Box>

              {(b.hazardous > 0 || b.reefer > 0) && (
                <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {b.hazardous > 0 && <Chip size="small" label={`${b.hazardous} Hazmat`} color="error" variant="outlined" />}
                  {b.reefer > 0 && <Chip size="small" label={`${b.reefer} Reefer`} color="info" variant="outlined" />}
                </Box>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>

      {conflicts && conflicts.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography
            variant="subtitle2"
            sx={{ mb: 1.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "error.main" }}
          >
            Detected Conflicts
          </Typography>

          <Stack spacing={1.25}>
            {conflicts.map((c) => (
              <Box
                key={c.berth}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.error.main, 0.06),
                  border: "1px solid",
                  borderColor: alpha(theme.palette.error.main, 0.18),
                  borderLeft: `4px solid ${theme.palette.error.main}`,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>
                  {c.berth}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {c.reason}
                </Typography>
                {c.conflict_with && c.conflict_with.length > 0 && (
                  <Typography variant="caption" sx={{ display: "block", mt: 0.75, color: "error.main", fontWeight: 600 }}>
                    Conflicts with: {c.conflict_with.join(", ")}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
