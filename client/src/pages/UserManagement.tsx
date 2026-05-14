import React, { useState, useEffect } from "react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, MenuItem
} from "@mui/material";
import { api } from "../api/api";
import { useAuth } from "../auth/AuthContext";

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

    const fetchUsers = async () => {
        try {
            const res = await api.get("/users/");
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
            await api.post("/users/", { username, password, role });
            setOpenModal(false);
            setUsername("");
            setPassword("");
            setRole("user");
            fetchUsers();
        } catch (error) {
            console.error("Failed to create user", error);
            alert("Failed to create user. Username may already exist.");
        }
    };

    const handleToggleActive = async (userId: number) => {
        try {
            await api.put(`/users/${userId}/toggle-active`);
            fetchUsers();
        } catch (error) {
            console.error("Failed to toggle active status", error);
            alert("Failed to update status.");
        }
    };

    const handleResetPassword = async () => {
        if (!selectedUser) return;
        try {
            await api.put(`/users/${selectedUser.id}/reset-password`, { new_password: password });
            setOpenResetModal(false);
            setPassword("");
            alert("Password reset successfully.");
        } catch (error) {
            console.error("Failed to reset password", error);
            alert("Failed to reset password.");
        }
    };

    return (
        <Box sx={{ p: 0 }}>
            <Box sx={{ mb: 4, pb: 3, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box>
                    <Typography variant="h5" sx={{ mb: 0.5, color: "text.primary" }}>User Management</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 380 }}>Manage platform access, role permissions, and account security.</Typography>
                </Box>
                <Button 
                    variant="contained" 
                    disableElevation
                    onClick={() => setOpenModal(true)}
                    sx={{ textTransform: "none", fontWeight: 600, height: 40 }}
                >
                    Add User
                </Button>
            </Box>

            <TableContainer component={Paper} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                <Table>
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
        </Box>
    );
};

export default UserManagement;
