import React, { useState, useEffect } from "react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, MenuItem
} from "@mui/material";
import { api } from "../api/api";
import { useAuth } from "../auth/AuthContext";

interface OperationalRequest {
    id: number;
    type: string;
    status: string;
    payload: string;
    created_at: string;
    created_by_user?: string;
}

const Requests: React.FC = () => {
    const [requests, setRequests] = useState<OperationalRequest[]>([]);
    const [openModal, setOpenModal] = useState(false);
    const [type, setType] = useState("UPLOAD_REQUEST");
    const [payload, setPayload] = useState("");
    
    const { user } = useAuth();

    const fetchRequests = async () => {
        try {
            const res = await api.get("/requests/");
            setRequests(res.data);
        } catch (error) {
            console.error("Failed to fetch requests", error);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleCreateRequest = async () => {
        try {
            await api.post("/requests/", { type, payload });
            setOpenModal(false);
            setPayload("");
            fetchRequests();
        } catch (error) {
            console.error("Failed to create request", error);
            alert("Failed to create request.");
        }
    };

    const handleUpdateStatus = async (id: number, status: string) => {
        try {
            await api.put(`/requests/${id}/status`, { status });
            fetchRequests();
        } catch (error) {
            console.error("Failed to update status", error);
            alert("Failed to update status.");
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
                <Typography variant="h4" sx={{ fontWeight: "bold" }}>Operational Requests</Typography>
                <Button 
                    variant="contained" 
                    disableElevation
                    onClick={() => setOpenModal(true)}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                >
                    New Request
                </Button>
            </Box>

            <TableContainer component={Paper} elevation={3}>
                <Table>
                    <TableHead sx={{ backgroundColor: "background.paper" }}>
                        <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Details</TableCell>
                            {user?.role === "admin" && <TableCell>Requested By</TableCell>}
                            <TableCell>Date</TableCell>
                            {user?.role === "admin" && <TableCell align="right">Actions</TableCell>}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {requests.map((r) => (
                            <TableRow key={r.id}>
                                <TableCell>{r.id}</TableCell>
                                <TableCell>{r.type.replace("_", " ")}</TableCell>
                                <TableCell>
                                    <Chip 
                                        label={r.status.toUpperCase()} 
                                        color={r.status === "executed" ? "success" : r.status === "rejected" ? "error" : "warning"} 
                                        size="small" 
                                    />
                                </TableCell>
                                <TableCell>{r.payload || "-"}</TableCell>
                                {user?.role === "admin" && <TableCell>{r.created_by_user}</TableCell>}
                                <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                                {user?.role === "admin" && (
                                    <TableCell align="right">
                                        {r.status === "pending" && (
                                            <>
                                                <Button size="small" color="success" onClick={() => handleUpdateStatus(r.id, "executed")}>Execute</Button>
                                                <Button size="small" color="error" onClick={() => handleUpdateStatus(r.id, "rejected")}>Reject</Button>
                                            </>
                                        )}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Create Request Modal */}
            <Dialog open={openModal} onClose={() => setOpenModal(false)} fullWidth maxWidth="sm">
                <DialogTitle>Submit Operational Request</DialogTitle>
                <DialogContent>
                    <TextField
                        select
                        margin="dense"
                        label="Request Type"
                        fullWidth
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                    >
                        <MenuItem value="UPLOAD_REQUEST">Data Upload</MenuItem>
                        <MenuItem value="RETRAIN_REQUEST">Model Retraining</MenuItem>
                        <MenuItem value="CONFIG_UPDATE_REQUEST">Configuration Update</MenuItem>
                    </TextField>
                    <TextField
                        margin="dense"
                        label="Details / Justification"
                        fullWidth
                        multiline
                        rows={4}
                        value={payload}
                        onChange={(e) => setPayload(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenModal(false)}>Cancel</Button>
                    <Button onClick={handleCreateRequest} variant="contained">Submit</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Requests;
