import React, { useState, useEffect } from "react";
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress } from "@mui/material";
import { api } from "../api/api";

interface AuditLog {
    id: number;
    action: string;
    details: string;
    timestamp: string;
    username: string;
}

const SystemLogs: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await api.get("/users/audit-logs");
                setLogs(res.data);
            } catch (error) {
                console.error("Failed to fetch logs", error);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: "bold", mb: 3 }}>System Logs</Typography>

            {loading ? (
                <CircularProgress />
            ) : (
                <TableContainer component={Paper} elevation={3}>
                    <Table>
                        <TableHead sx={{ backgroundColor: "background.paper" }}>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>Action</TableCell>
                                <TableCell>Details</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Date</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {logs.map((log: AuditLog) => (
                                <TableRow key={log.id}>
                                    <TableCell>{log.id}</TableCell>
                                    <TableCell>{log.action}</TableCell>
                                    <TableCell>{log.details}</TableCell>
                                    <TableCell>{log.username || "System"}</TableCell>
                                    <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default SystemLogs;
