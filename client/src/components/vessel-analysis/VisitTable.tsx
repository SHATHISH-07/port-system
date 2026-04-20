import {
    Card,
    CardContent,
    Typography,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Chip
} from "@mui/material";

interface Visit {
    stay_hours: number;
    loaded_containers: number;
    discharged_containers: number;
    move_start: string;
    move_end: string;
}

interface Props {
    visits: Record<string, Visit>;
    avg: number;
}

const getColor = (value: number, avg: number) => {
    if (value > avg * 1.3) return "#fef2f2";   // bad
    if (value > avg) return "#fffbeb";         // medium
    return "#ecfdf5";                         // good
};

const VisitTable = ({ visits, avg }: Props) => {
    const rows = Object.entries(visits);

    return (
        <Card sx={{ borderRadius: 3, border: "1px solid #e5e7eb" }}>
            <CardContent>
                <Typography sx={{ fontWeight: 600, mb: 2 }}>
                    VISIT PERFORMANCE
                </Typography>

                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Visit</TableCell>
                            <TableCell>Stay</TableCell>
                            <TableCell>Loaded</TableCell>
                            <TableCell>Discharged</TableCell>
                            <TableCell>Operation Window</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {rows.map(([id, v]) => (
                            <TableRow key={id} sx={{ bgcolor: getColor(v.stay_hours, avg) }}>
                                <TableCell>{id}</TableCell>

                                <TableCell>
                                    <Chip label={`${v.stay_hours} hrs`} size="small" />
                                </TableCell>

                                <TableCell>{v.loaded_containers}</TableCell>
                                <TableCell>{v.discharged_containers}</TableCell>

                                {/* 🔥 MOVE WINDOW */}
                                <TableCell>
                                    <Typography sx={{ fontSize: 11 }}>
                                        {v.move_start}
                                    </Typography>
                                    <Typography sx={{ fontSize: 11, color: "#64748b" }}>
                                        → {v.move_end}
                                    </Typography>
                                </TableCell>

                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

export default VisitTable;