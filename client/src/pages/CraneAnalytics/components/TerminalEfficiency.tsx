import { Box, Grid, Typography, Card } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import SectionLabel from "./SectionLabel";

interface YardStat {
  terminal_name: string;
  total_system_moves: number;
  active_cranes_count: number;
  unique_vessel_visits: number;
  gross_terminal_mph: number;
  avg_crane_productivity: number;
}

interface TerminalEfficiencyProps {
  yardStats: YardStat[];
}

export default function TerminalEfficiency({ yardStats }: TerminalEfficiencyProps) {
  const theme = useTheme();
  if (!yardStats || yardStats.length === 0) return null;

  return (
    <Box sx={{ mb: 2.5 }}>
      <SectionLabel label="Terminal Efficiency" />
      <Grid container spacing={1.5}>
        {yardStats.map((y) => (
          <Grid size={{ xs: 12, md: 6 }} key={y.terminal_name}>
            <Card
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3.5,
                background: theme.palette.mode === 'light'
                  ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.primary.main, 0.03)} 100%)`
                  : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`,
                backdropFilter: 'blur(10px)',
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.3 : 0.18),
                boxShadow: theme.palette.mode === 'light' ? '0 4px 16px rgba(0,0,0,0.04)' : '0 6px 20px rgba(0,0,0,0.02)',
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  transform: "translateY(-3px)",
                  boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.1)}`,
                  borderColor: alpha(theme.palette.primary.main, 0.35),
                },
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: "0.85rem",
                      fontWeight: 800,
                      color: "text.primary",
                      mb: 1,
                    }}
                  >
                    {y.terminal_name}
                  </Typography>
                  
                  <Box sx={{ display: "flex", gap: 3 }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fontSize: "0.6rem" }}>
                        Assets
                      </Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: "0.85rem", mt: 0.25 }}>
                        {y.active_cranes_count}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fontSize: "0.6rem" }}>
                        Visits
                      </Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: "0.85rem", mt: 0.25 }}>
                        {y.unique_vessel_visits}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fontSize: "0.6rem" }}>
                        Moves
                      </Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: "0.85rem", mt: 0.25 }}>
                        {y.total_system_moves.toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ textAlign: "right", pl: 2, borderLeft: "1px solid", borderColor: alpha(theme.palette.divider, 0.08) }}>
                  <Typography
                    sx={{
                      fontSize: "1.75rem",
                      fontWeight: 900,
                      color: "primary.main",
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {y.avg_crane_productivity.toFixed(1)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.55rem",
                      fontWeight: 800,
                      color: "text.secondary",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      mt: 0.5,
                      display: "block",
                    }}
                  >
                    AVG MPH
                  </Typography>
                </Box>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
