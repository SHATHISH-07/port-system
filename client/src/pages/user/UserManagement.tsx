import React, { useState, useEffect } from "react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, MenuItem, Alert, Snackbar
} from "@mui/material";
import { api } from "../../api/api";
import { useAuth } from "../../auth/AuthContext";

interface User {
    id: number;
    username: string;
    role: string;
    is_active: boolean;
    created_at: string;
}

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [openModal, setOpenModal] = useState(false);
    const [openResetModal, setOpenResetModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("user");
    
    const { user: currentUser } = useAuth();

    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: "success" | "error" | "info" | "warning";
    }>({ open: false, message: "", severity: "info" });

    const showToast = (message: string, severity: typeof toast.severity) =>
        setToast({ open: true, message, severity });

    const fetchUsers = async () => {
        try {
            const res = await api.get("/users");
            setUsers(res.data);
        } catch (error) {
            console.error("Failed to fetch users", error);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchUsers();
    }, []);

    const handleCreateUser = async () => {
        try {
            await api.post("/users", { username, password, role });
            setOpenModal(false);
            setUsername("");
            setPassword("");
            setRole("user");
            fetchUsers();
            showToast("User account created successfully.", "success");
        } catch (error) {
            console.error("Failed to create user", error);
            showToast("Failed to create user. Username may already exist.", "error");
        }
    };

    const handleToggleActive = async (userId: number) => {
        try {
            await api.put(`/users/${userId}/toggle-active`);
            fetchUsers();
            showToast("User status updated successfully.", "success");
        } catch (error) {
            console.error("Failed to toggle active status", error);
            showToast("Failed to update status.", "error");
        }
    };

    const handleResetPassword = async () => {
        if (!selectedUser) return;
        try {
            await api.put(`/users/${selectedUser.id}/reset-password`, { new_password: password });
            setOpenResetModal(false);
            setPassword("");
            showToast("Password reset successfully.", "success");
        } catch (error) {
            console.error("Failed to reset password", error);
            showToast("Failed to reset password.", "error");
        }
    };

    return (
        <Box sx={{ p: 3, width: "100%" }}>
            <Box sx={{ mb: 2, pb: 1.5, display: "flex", flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-end" }, gap: 2 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontSize: "1.1rem", mb: 0.5, color: "text.primary", fontWeight: 700 }}>User Management</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", maxWidth: 380 }}>Manage platform access, role permissions, and account security.</Typography>
                </Box>
                <Button 
                    variant="contained" 
                    disableElevation
                    onClick={() => setOpenModal(true)}
                    sx={{ textTransform: "none", fontWeight: 600, height: 32, fontSize: "0.75rem", px: 2, alignSelf: { xs: "flex-start", sm: "auto" } }}
                >
                    Add User
                </Button>
            </Box>

            <TableContainer component={Paper} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 800, "& .MuiTableCell-root": { py: 1.5, px: 2 } }}>
                    <TableHead sx={{ backgroundColor: "background.paper" }}>
                        <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>Username</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Created At</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((u) => (
                            <TableRow key={u.id}>
                                <TableCell>{u.id}</TableCell>
                                <TableCell>{u.username}</TableCell>
                                <TableCell>
                                    <Chip 
                                        label={u.role.toUpperCase()} 
                                        color={u.role === "admin" ? "secondary" : "default"} 
                                        size="small" 
                                    />
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={u.is_active ? "Active" : "Inactive"} 
                                        color={u.is_active ? "success" : "error"} 
                                        size="small" 
                                    />
                                </TableCell>
                                <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                                <TableCell align="right">
                                    <Button 
                                        size="small" 
                                        onClick={() => {
                                            setSelectedUser(u);
                                            setOpenResetModal(true);
                                        }}
                                        sx={{ mr: 1 }}
                                    >
                                        Reset Password
                                    </Button>
                                    <Button 
                                        size="small" 
                                        color={u.is_active ? "error" : "success"}
                                        disabled={u.id === currentUser?.id}
                                        onClick={() => handleToggleActive(u.id)}
                                    >
                                        {u.is_active ? "Deactivate" : "Activate"}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Create User Modal */}
            <Dialog open={openModal} onClose={() => setOpenModal(false)}>
                <DialogTitle>Create New Account</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Username"
                        fullWidth
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <TextField
                        margin="dense"
                        label="Password"
                        type="password"
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <TextField
                        select
                        margin="dense"
                        label="Role"
                        fullWidth
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        <MenuItem value="user">User</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenModal(false)}>Cancel</Button>
                    <Button onClick={handleCreateUser} variant="contained">Create</Button>
                </DialogActions>
            </Dialog>

            {/* Reset Password Modal */}
            <Dialog open={openResetModal} onClose={() => setOpenResetModal(false)}>
                <DialogTitle>Reset Password for {selectedUser?.username}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="New Password"
                        type="password"
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenResetModal(false)}>Cancel</Button>
                    <Button onClick={handleResetPassword} variant="contained" color="warning">Reset</Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={toast.open}
                autoHideDuration={6000}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default UserManagement;
