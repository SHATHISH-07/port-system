import { Card, CardContent, Typography, Box } from "@mui/material";
import { Anchor } from "@mui/icons-material";

interface Props {
    berth?: string;
    concentration?: string;
}

const BerthRecommendation = ({ berth, concentration }: Props) => (
    <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb" }}>
        <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Anchor fontSize="small" />
                <Typography sx={{ fontWeight: 600 }}>RECOMMENDED BERTH</Typography>
            </Box>

            <Typography sx={{ fontSize: 28, fontWeight: 700 }}>
                {berth || "N/A"}
            </Typography>

            <Typography sx={{ fontSize: 13, color: "#64748b" }}>
                Cargo concentration: {concentration}
            </Typography>
        </CardContent>
    </Card>
);

export default BerthRecommendation;