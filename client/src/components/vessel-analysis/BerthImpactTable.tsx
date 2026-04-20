import {
    Card,
    CardContent,
    Typography,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Chip,
    Box,
    Button
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { useState } from "react";

interface Row {
    berth: string;
    block: string;
    cargo_concentration: string;
    total_travel_distance: string;
    congestion_risk: "Low" | "Medium" | "High";
}

interface Props {
    data: Row[];
}

const getChipStyles = (value: string) => {
    if (value === "Low") return { bgcolor: "#ecfdf5", color: "#047857" };
    if (value === "Medium") return { bgcolor: "#fffbeb", color: "#b45309" };
    return { bgcolor: "#fef2f2", color: "#b91c1c" };
};

const BerthImpactTable = ({ data }: Props) => {
    const [expanded, setExpanded] = useState(false);

    if (!data || data.length === 0) return null;

    const initialRows = 5;

    const displayRows = expanded ? data : data.slice(0, initialRows);

    return (
        <Card
            sx={{
                borderRadius: 3,
                border: "1px solid #e5e7eb",
                boxShadow: "none"
            }}
        >
            <CardContent sx={{ p: 3 }}>
                {/* HEADER */}
                <Typography
                    sx={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "#6b7280",
                        letterSpacing: 0.5,
                        mb: 2
                    }}
                >
                    BERTH IMPACT ANALYSIS
                </Typography>

                <Table size="small">
                    <TableHead>
                        <TableRow>
                            {["Berth", "Cargo Concentration", "Travel Distance", "Congestion Risk"].map((h) => (
                                <TableCell
                                    key={h}
                                    sx={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#9ca3af",
                                        borderBottom: "1px solid #f1f5f9"
                                    }}
                                >
                                    {h}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {displayRows.map((row, i) => (
                            <TableRow
                                key={i}
                                sx={{
                                    backgroundColor: i === 0 ? "#f0fdf4" : "transparent",
                                    "&:hover": {
                                        backgroundColor: "#f9fafb"
                                    }
                                }}
                            >
                                {/* BERTH */}
                                <TableCell sx={{ borderBottom: "1px solid #f9fafb" }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        {row.berth}

                                        {i === 0 && (
                                            <Chip
                                                label="Recommended"
                                                size="small"
                                                sx={{
                                                    bgcolor: "#e5f9feff",
                                                    color: "#d1370dff",
                                                    fontSize: 13,
                                                    border: "1px solid #d1370dff"
                                                }}
                                            />
                                        )}
                                    </Box>
                                </TableCell>

                                {/* CONCENTRATION */}
                                <TableCell sx={{ borderBottom: "1px solid #f9fafb" }}>
                                    {row.cargo_concentration}
                                </TableCell>

                                {/* DISTANCE */}
                                <TableCell sx={{ borderBottom: "1px solid #f9fafb" }}>
                                    <Chip
                                        label={row.total_travel_distance}
                                        size="small"
                                        sx={getChipStyles(row.total_travel_distance)}
                                    />
                                </TableCell>

                                {/* CONGESTION */}
                                <TableCell sx={{ borderBottom: "1px solid #f9fafb" }}>
                                    <Chip
                                        label={row.congestion_risk}
                                        size="small"
                                        sx={getChipStyles(row.congestion_risk)}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {/* 🔽 SHOW MORE / LESS */}
                {data.length > initialRows && (
                    <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                        <Button
                            onClick={() => setExpanded(!expanded)}
                            endIcon={expanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                            sx={{
                                textTransform: "none",
                                color: "#6b7280",
                                fontSize: 13
                            }}
                        >
                            {expanded ? "Show Less" : "Show More"}
                        </Button>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

export default BerthImpactTable;