import { Box, Grid, Typography } from "@mui/material";
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

function MphBar({ value, max }: { value: number; max: number }) {
  const theme = useTheme();
  const pct = Math.min((value / max) * 100, 100);
  return (
    <Box sx={{ mt: 1.5, width: "100%" }}>
      <Box
        sx={{
          height: 3,
          borderRadius: 4,
          bgcolor: alpha(theme.palette.divider, 0.1),
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 4,
            background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.5)})`,
            transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </Box>
    </Box>
  );
}

export default function TerminalEfficiency({
  yardStats,
}: TerminalEfficiencyProps) {
  const theme = useTheme();
  if (!yardStats || yardStats.length === 0) return null;

  const maxMph = Math.max(...yardStats.map((y) => y.avg_crane_productivity));

  return (
    <Box sx={{ mb: 5 }}>
      <SectionLabel label="Terminal Efficiency" count={yardStats.length} />
      <Grid container spacing={2}>
        {yardStats.map((y) => (
          <Grid size={{ xs: 12, md: 6 }} key={y.terminal_name}>
            <Box
              sx={{
                p: "24px",
                borderRadius: 4,
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.4)} 100%)`,
                backdropFilter: "blur(10px)",
                border: "1px solid",
                borderColor: alpha(theme.palette.primary.main, 0.15),
                boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.04)}`,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "default",
                "&:hover": {
                  borderColor: alpha(theme.palette.primary.main, 0.35),
                  transform: "translateY(-4px)",
                  boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.1)}`,
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: "0.85rem",
                      fontWeight: 800,
                      color: "text.primary",
                      mb: 0.5,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {y.terminal_name}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 2 }}>
                    {[
                      { val: y.active_cranes_count, label: "assets" },
                      { val: y.unique_vessel_visits, label: "visits" },
                      {
                        val: y.total_system_moves.toLocaleString(),
                        label: "moves",
                      },
                    ].map((item) => (
                      <Typography
                        key={item.label}
                        sx={{
                          fontSize: "0.65rem",
                          color: "text.disabled",
                          fontFamily: "'DM Mono', monospace",
                          fontWeight: 600,
                        }}
                      >
                        {item.val}{" "}
                        <Box component="span" sx={{ opacity: 0.6 }}>
                          {item.label}
                        </Box>
                      </Typography>
                    ))}
                  </Box>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography
                    sx={{
                      fontSize: "1.6rem",
                      fontWeight: 900,
                      color: theme.palette.primary.main,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {y.avg_crane_productivity.toFixed(1)}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.55rem",
                      fontWeight: 800,
                      color: "text.disabled",
                      letterSpacing: "0.14em",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    AVG MPH
                  </Typography>
                </Box>
              </Box>
              <MphBar value={y.avg_crane_productivity} max={maxMph} />
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
