import { Card, CardContent, Typography, Box } from "@mui/material";
import { WarningAmberOutlined } from "@mui/icons-material";

interface Props {
    risks: string[];
}

const RiskEvaluation = ({ risks }: Props) => (
    <Card
        sx={{
            borderRadius: 3,
            border: "1px solid #e5e7eb",
            boxShadow: "none"
        }}
    >
        <CardContent sx={{ p: 3 }}>

            {/* HEADER */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
                <WarningAmberOutlined sx={{ fontSize: 18, color: "#6b7280" }} />

                <Typography
                    sx={{
                        fontWeight: 600,
                        color: "#6b7280",
                        fontSize: 13,
                        letterSpacing: 0.5
                    }}
                >
                    OPERATIONAL RISKS
                </Typography>
            </Box>

            {/* CONTENT */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {risks.length > 0 ? (
                    risks.map((risk, i) => (
                        <Box
                            key={i}
                            sx={{
                                p: 2,
                                borderLeft: "4px solid #f59e0b",
                                bgcolor: "#fffbeb",
                                borderRadius: 2,
                                display: "flex",
                                gap: 1.5,
                                alignItems: "flex-start"
                            }}
                        >

                            <Box
                                sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    bgcolor: "#f59e0b",
                                    mt: "6px"
                                }}
                            />

                            <Typography
                                sx={{
                                    color: "#92400e",
                                    fontWeight: 500,
                                    fontSize: 14,
                                    lineHeight: 1.6
                                }}
                            >
                                {risk}
                            </Typography>
                        </Box>
                    ))
                ) : (
                    <Box sx={{ p: 2 }}>
                        <Typography
                            sx={{
                                color: "#6b7280",
                                fontStyle: "italic",
                                fontSize: 13
                            }}
                        >
                            No significant operational risks identified for this visit.
                        </Typography>
                    </Box>
                )}
            </Box>
        </CardContent>
    </Card>
);

export default RiskEvaluation;