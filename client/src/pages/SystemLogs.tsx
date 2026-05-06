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
        <Box sx={{ p: 0 }}>
            <Box sx={{ mb: 4, pb: 3, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box>
                    <Typography variant="h5" sx={{ mb: 0.5, color: "text.primary" }}>System Logs</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 380 }}>Review audit trails, security events, and platform activity.</Typography>
                </Box>
            </Box>

            {loading ? (
                <CircularProgress />
            ) : (
                <TableContainer component={Paper} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
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
