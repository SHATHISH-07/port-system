import { Box, Typography, TextField, Button, CircularProgress } from "@mui/material";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";

interface Props {
    vesselId: string;
    setVesselId: (val: string) => void;
    onAnalyze: () => void;
    loading: boolean;
    data: any;
}

const AnalysisHeader = ({ vesselId, setVesselId, onAnalyze, loading, data }: Props) => {

    const hasValidData = data && data.vessel;

    return (
        <Box sx={{ mb: 4, textAlign: "center" }}>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: "#111827" }}>
                Vessel Dashboard
            </Typography>

            <Typography sx={{ color: "#6b7280", mb: 4 }}>
                Analyze vessel movement, yard utilization, and operational risks.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, maxWidth: 500, mx: "auto" }}>
                <TextField
                    fullWidth
                    placeholder="Enter vessel ID"
                    value={vesselId}
                    onChange={(e) => setVesselId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
                    size="medium"
                    sx={{ bgcolor: "#fff", borderRadius: 1 }}
                />
                <Button
                    variant="contained"
                    onClick={onAnalyze}
                    disableElevation
                    sx={{
                        bgcolor: "#0f172a",
                        textTransform: "none",
                        fontWeight: 600,
                        px: 4,
                        borderRadius: 2,
                        "&:hover": { bgcolor: "#334155" }
                    }}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : "Analyze"}
                </Button>
            </Box>

            {!hasValidData && !loading && (
                <Box
                    sx={{
                        mt: 8,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        color: "#6b7280"
                    }}
                >
                    <DirectionsBoatIcon sx={{ fontSize: 48, color: "#9ca3af" }} />

                    <Typography sx={{ fontSize: "1rem" }}>
                        Get insights into vessel stay time, yard activity, and operational efficiency.
                    </Typography>

                    <Typography sx={{ fontSize: "0.95rem", color: "#9ca3af" }}>
                        Enter a vessel ID to begin analysis.
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default AnalysisHeader;