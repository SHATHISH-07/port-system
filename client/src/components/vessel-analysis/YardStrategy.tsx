import { Card, CardContent, Typography, Box } from "@mui/material";
import { InsightsRounded } from "@mui/icons-material";

interface Props {
    data: {
        weight_distribution: Record<string, number>;
        top_discharge_ports: Record<string, number>;
        avg_moves_per_container: number;
        reshuffle_risk: string;
    };
}

export default function YardStrategy({ data }: Props) {
    if (!data) return null;

    const { weight_distribution, top_discharge_ports, avg_moves_per_container, reshuffle_risk } = data;

    return (
        <Card>
            <CardContent sx={{ p: 0 }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 2.5,
                        py: 2,
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                    }}
                >
                    <InsightsRounded sx={{ fontSize: 15, color: "#8ab4f8" }} />
                    <Typography
                        sx={{
                            fontSize: "0.6875rem",
                            fontWeight: 500,
                            color: "#9aa0a6",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            flex: 1,
                        }}
                    >
                        Yard Preparation Strategy
                    </Typography>
                </Box>

                <Box sx={{ px: 2.5, py: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>

                    <Box
                        sx={{
                            p: "10px 12px",
                            bgcolor: "rgba(138,180,248,0.04)",
                            border: "1px solid rgba(138,180,248,0.12)",
                            borderLeft: "3px solid #8ab4f8",
                            borderRadius: 1,
                        }}
                    >
                        <Typography sx={{ fontSize: "0.75rem", color: "#8ab4f8", mb: 0.5 }}>
                            Weight Distribution
                        </Typography>
                        <Typography sx={{ fontSize: "0.8125rem", color: "#e8eaed" }}>
                            {Object.entries(weight_distribution)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" | ")}
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            p: "10px 12px",
                            bgcolor: "rgba(129,201,149,0.04)",
                            border: "1px solid rgba(129,201,149,0.12)",
                            borderLeft: "3px solid #81c995",
                            borderRadius: 1,
                        }}
                    >
                        <Typography sx={{ fontSize: "0.75rem", color: "#81c995", mb: 0.5 }}>
                            Top Discharge Ports
                        </Typography>
                        <Typography sx={{ fontSize: "0.8125rem", color: "#e8eaed" }}>
                            {Object.entries(top_discharge_ports)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" | ")}
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            p: "10px 12px",
                            bgcolor: "rgba(253,214,99,0.04)",
                            border: "1px solid rgba(253,214,99,0.12)",
                            borderLeft: "3px solid #fdd663",
                            borderRadius: 1,
                        }}
                    >
                        <Typography sx={{ fontSize: "0.75rem", color: "#fdd663", mb: 0.5 }}>
                            Reshuffle Insight
                        </Typography>
                        <Typography sx={{ fontSize: "0.8125rem", color: "#e8eaed" }}>
                            Risk: {reshuffle_risk} | Avg Moves: {avg_moves_per_container}
                        </Typography>
                    </Box>

                </Box>
            </CardContent>
        </Card>
    );
}