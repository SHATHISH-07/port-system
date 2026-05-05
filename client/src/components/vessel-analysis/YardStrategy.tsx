import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

interface Props {
  data: {
    weight_distribution: Record<string, number>;
    top_discharge_ports: Record<string, number>;
    avg_moves_per_container: number;
    reshuffle_risk: string;
  };
}

export default function YardStrategy({ data }: Props) {
  const theme = useTheme();
  if (!data) return null;

  const {
    weight_distribution = {},
    top_discharge_ports = {},
    avg_moves_per_container = 0,
    reshuffle_risk = "Unknown",
  } = data;

  const riskColor = (() => {
    const r = reshuffle_risk?.toLowerCase();
    if (r === "high") return theme.palette.error.main;
    if (r === "medium") return theme.palette.warning.main;
    return theme.palette.success.main;
  })();

  const portEntries = Object.entries(top_discharge_ports).slice(0, 6);
  const portMax = portEntries.length > 0 ? (portEntries[0][1] as number) : 1;
  const weightEntries = Object.entries(weight_distribution);

  const colDivider = `1px solid ${theme.palette.divider}`;

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr 1fr" } }}>

        {/* Col 1 — Weight Distribution */}
        <Box
          sx={{
            p: 3,
            borderRight: { md: colDivider },
            borderBottom: { xs: colDivider, md: "none" },
          }}
        >
          <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
            Weight Distribution
          </Typography>
          {weightEntries.length > 0 ? (
            weightEntries.map(([k, v]) => (
              <Box
                key={k}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1,
                  borderBottom: colDivider,
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Typography variant="body2" sx={{ color: "text.secondary" }}>{k}</Typography>
                <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", fontFamily: "monospace" }}>
                  {v}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography variant="body2" sx={{ color: "text.disabled" }}>No data</Typography>
          )}
        </Box>

        {/* Col 2 — Discharge Ports */}
        <Box
          sx={{
            p: 3,
            borderRight: { md: colDivider },
            borderBottom: { xs: colDivider, md: "none" },
          }}
        >
          <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
            Top Discharge Ports
          </Typography>
          {portEntries.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {portEntries.map(([port, count], i) => {
                const pct = ((count as number) / portMax) * 100;
                return (
                  <Box key={port}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: i === 0 ? "text.primary" : "text.secondary",
                          fontWeight: i === 0 ? 600 : 400,
                        }}
                      >
                        {port}
                      </Typography>
                      <Typography
                        sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.primary", fontFamily: "monospace" }}
                      >
                        {count}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        height: 3,
                        bgcolor: alpha(theme.palette.text.primary, 0.08),
                        borderRadius: 2,
                      }}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          width: `${pct}%`,
                          bgcolor: i === 0
                            ? theme.palette.text.primary
                            : alpha(theme.palette.text.primary, 0.35),
                          borderRadius: 2,
                          transition: "width 400ms ease",
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: "text.disabled" }}>No data</Typography>
          )}
        </Box>

        {/* Col 3 — Reshuffle Summary */}
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
            Reshuffle Summary
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontSize: "3.25rem",
                fontWeight: 200,
                color: "text.primary",
                lineHeight: 1,
                letterSpacing: "-2px",
                fontFamily: "'Inter', sans-serif",
                mb: 0.5,
              }}
            >
              {avg_moves_per_container}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              avg moves per container
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mb: 0.5 }}>
              Reshuffle Risk
            </Typography>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 700, color: riskColor }}>
              {reshuffle_risk}
            </Typography>
          </Box>
        </Box>

      </Box>
    </Box>
  );
}