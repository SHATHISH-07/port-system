import { Card, CardContent, Typography, Box } from "@mui/material";
import { WatchLaterOutlined } from "@mui/icons-material";

interface Props {
    actual: number;
    predicted: number;
}

const PerformanceStats = ({ actual, predicted }: Props) => {
    return (
        <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb", boxShadow: "none", backgroundColor: "#ffffffff", width: "100%", mx: "auto" }}>
            <CardContent sx={{ p: 3 }}>

                {/* HEADER FIX */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 3
                    }}
                >
                    <WatchLaterOutlined sx={{ fontSize: 18, color: "#373e4cff" }} />

                    <Typography
                        sx={{
                            fontWeight: 600,
                            color: "#373e4cff",
                            fontSize: 13,
                            letterSpacing: 0.5
                        }}
                    >
                        TURNAROUND TIME
                    </Typography>
                </Box>

                {/* CONTENT */}
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                    <Box>
                        <Typography sx={{ fontSize: 74, fontWeight: 700 }}>
                            {actual}{" "}
                            <span style={{ fontSize: 34, color: "#6b7280" }}>hrs</span>
                        </Typography>
                        <Typography sx={{ fontSize: 23, color: "#6b7280" }}>
                            Actual Stay
                        </Typography>
                    </Box>

                    <Box sx={{ textAlign: "right" }}>
                        <Typography sx={{ fontSize: 65, fontWeight: 600, color: "#486495ff" }}>
                            {predicted} hrs
                        </Typography>
                        <Typography sx={{ fontSize: 23, color: "#486495ff" }}>
                            Predicted
                        </Typography>
                    </Box>
                </Box>

            </CardContent>
        </Card>
    );
};

export default PerformanceStats;