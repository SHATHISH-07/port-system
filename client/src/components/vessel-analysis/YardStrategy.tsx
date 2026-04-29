import { Box, Typography } from "@mui/material";

interface Props {
  data: {
    weight_distribution: Record<string, number>;
    top_discharge_ports: Record<string, number>;
    avg_moves_per_container: number;
    reshuffle_risk: string;
  };
}

const riskColor = (risk: string) => {
  const r = risk?.toLowerCase();
  if (r === "high") return "#f28b82";
  if (r === "medium") return "#fdd663";
  return "#81c995";
};

export default function YardStrategy({ data }: Props) {
  if (!data) return null;

  const {
    weight_distribution = {},
    top_discharge_ports = {},
    avg_moves_per_container = 0,
    reshuffle_risk = "Unknown",
  } = data;

  const rc = riskColor(reshuffle_risk);
  const portEntries = Object.entries(top_discharge_ports).slice(0, 6);
  const portMax = portEntries.length > 0 ? (portEntries[0][1] as number) : 1;
  const weightEntries = Object.entries(weight_distribution);

  const colLabel = {
    fontSize: "0.6875rem",
    fontWeight: 500,
    color: "#9aa0a6",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    mb: 2,
  };

  return (
    <Box
      sx={{
        bgcolor: "#292a2d",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr 1fr" } }}>

        {/* Col 1: Weight Distribution */}
        <Box
          sx={{
            p: 3,
            borderRight: { md: "1px solid rgba(255,255,255,0.08)" },
            borderBottom: { xs: "1px solid rgba(255,255,255,0.08)", md: "none" },
          }}
        >
          <Typography sx={colLabel}>Weight Distribution</Typography>
          {weightEntries.length > 0 ? (
            weightEntries.map(([k, v]) => (
              <Box
                key={k}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Typography sx={{ fontSize: "0.8125rem", color: "#9aa0a6" }}>{k}</Typography>
                <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "#e8eaed", fontFamily: "monospace" }}>
                  {v}
                </Typography>
              </Box>
            ))
          ) : (
            <Typography sx={{ fontSize: "0.8125rem", color: "#5f6368" }}>No data</Typography>
          )}
        </Box>

        {/* Col 2: Discharge Ports */}
        <Box
          sx={{
            p: 3,
            borderRight: { md: "1px solid rgba(255,255,255,0.08)" },
            borderBottom: { xs: "1px solid rgba(255,255,255,0.08)", md: "none" },
          }}
        >
          <Typography sx={colLabel}>Top Discharge Ports</Typography>
          {portEntries.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {portEntries.map(([port, count], i) => {
                const pct = ((count as number) / portMax) * 100;
                return (
                  <Box key={port}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                      <Typography
                        sx={{
                          fontSize: "0.8125rem",
                          color: i === 0 ? "#e8eaed" : "#9aa0a6",
                          fontWeight: i === 0 ? 500 : 400,
                        }}
                      >
                        {port}
                      </Typography>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "#e8eaed", fontFamily: "monospace" }}>
                        {count}
                      </Typography>
                    </Box>
                    <Box sx={{ height: 2, bgcolor: "rgba(255,255,255,0.08)", borderRadius: 1 }}>
                      <Box
                        sx={{
                          height: "100%",
                          width: `${pct}%`,
                          bgcolor: i === 0 ? "#8ab4f8" : "rgba(138,180,248,0.4)",
                          borderRadius: 1,
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography sx={{ fontSize: "0.8125rem", color: "#5f6368" }}>No data</Typography>
          )}
        </Box>

        {/* Col 3: Movement Stats */}
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Typography sx={colLabel}>Reshuffle Summary</Typography>

          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{
                fontSize: "3.5rem",
                fontWeight: 200,
                color: "#e8eaed",
                lineHeight: 1,
                letterSpacing: "-2px",
                fontFamily: "'Inter', 'Roboto', sans-serif",
                mb: 0.5,
              }}
            >
              {avg_moves_per_container}
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#5f6368" }}>
              avg moves per container
            </Typography>
          </Box>

          <Box>
            <Typography
              sx={{
                fontSize: "0.6875rem",
                color: "#5f6368",
                mb: 0.5,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Reshuffle Risk
            </Typography>
            <Typography sx={{ fontSize: "1.125rem", fontWeight: 700, color: rc }}>
              {reshuffle_risk}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}