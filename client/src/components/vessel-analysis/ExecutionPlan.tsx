import { Card, CardContent, Typography, Box } from "@mui/material";
import { ChecklistOutlined } from "@mui/icons-material";

interface Props {
    steps: string[];
}

const ExecutionPlan = ({ steps }: Props) => (
    <Card
        sx={{
            borderRadius: 3,
            border: "1px solid #e5e7eb",
            boxShadow: "none"
        }}
    >
        <CardContent sx={{ p: 3 }}>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
                <ChecklistOutlined sx={{ fontSize: 18, color: "#6b7280" }} />
                <Typography
                    sx={{
                        fontWeight: 600,
                        color: "#6b7280",
                        fontSize: 13,
                        letterSpacing: 0.5
                    }}
                >
                    RECOMMENDED EXECUTION PLAN
                </Typography>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {steps.map((step, i) => (
                    <Box
                        key={i}
                        sx={{
                            display: "flex",
                            gap: 2,
                            alignItems: "flex-start"
                        }}
                    >

                        <Box
                            sx={{
                                minWidth: 28,
                                height: 28,
                                borderRadius: "50%",
                                bgcolor: "#e2e8f0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                color: "#475569",
                                fontSize: 12,
                                mt: "2px"
                            }}
                        >
                            {i + 1}
                        </Box>

                        <Typography
                            sx={{
                                color: "#334155",
                                lineHeight: 1.6,
                                fontSize: 14,
                                flex: 1
                            }}
                        >
                            {step}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </CardContent>
    </Card>
);

export default ExecutionPlan;