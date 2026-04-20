import { Anchor } from "@mui/icons-material";
import { Box, Card, CardContent, Typography } from "@mui/material";

interface Props {
    bestBerth: string;
}

const BerthRecommendation = ({ bestBerth }: Props) => (
    <Card sx={{
        height: "100%",
        borderRadius: 3,
        border: "1px solid #e5e7eb",
        boxShadow: "none",
        backgroundColor: "#ffffffff"
    }}>
        <CardContent sx={{ p: 3 }}>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 3
                }}
            >
                <Anchor sx={{ fontSize: 18, color: "#373e4cff" }} />

                <Typography
                    sx={{
                        fontWeight: 600,
                        color: "#373e4cff",
                        fontSize: 13,
                        letterSpacing: 0.5
                    }}
                >
                    BERTH RECOMMENDATION
                </Typography>
            </Box>

            <Typography sx={{ fontSize: 30, fontWeight: 700, color: "#093148ff", mb: 1 }}>
                {bestBerth}
            </Typography>

            <Typography sx={{ color: "#071922ff", lineHeight: 1.6, fontSize: 15 }}>
                Assigning the vessel to this block minimizes yard-to-vessel transfer distances, as the majority of outbound containers are currently staged in this zone.
            </Typography>
        </CardContent>
    </Card>
);

export default BerthRecommendation;