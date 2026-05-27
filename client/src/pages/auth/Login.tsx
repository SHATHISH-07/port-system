import React, { useState } from "react";
import { Box, Button, TextField, Typography, Alert, useTheme, Paper } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../api/api";

const Login: React.FC = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const from = location.state?.from?.pathname || "/";

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const formData = new URLSearchParams();
            formData.append("username", username);
            formData.append("password", password);

            const response = await api.post("/auth/login", formData, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            const token = response.data.access_token;

            const userResponse = await api.get("/auth/me", {
                headers: { Authorization: `Bearer ${token}` },
            });

            login(token, userResponse.data);
            navigate(from, { replace: true });
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } } };
            setError(e?.response?.data?.detail || "Invalid username or password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "background.default",
                py: 4,
            }}
        >
            <Box sx={{ width: '100%', maxWidth: 340, px: 2 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary", letterSpacing: "-0.01em" }}>
                        Sign in to Deck Optimizer
                    </Typography>
                </Box>

                {/* Login Card */}
                <Paper
                    elevation={isDark ? 0 : 1}
                    sx={{
                        p: { xs: 2.5, sm: 3 },
                        borderRadius: 2.5,
                        bgcolor: "background.paper",
                        border: "1px solid",
                        borderColor: "divider",
                        boxShadow: isDark ? "none" : "0 4px 20px rgba(0,0,0,0.04)"
                    }}
                >
                    {error && (
                        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 1.5 }}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit}>
                        {/* Username */}
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75, color: "text.primary", fontSize: "0.8rem" }}>
                            Username
                        </Typography>
                        <TextField
                            required
                            fullWidth
                            id="username"
                            name="username"
                            autoComplete="username"
                            autoFocus
                            size="small"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            sx={{ mb: 2.5, '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                        />

                        {/* Password */}
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75, color: "text.primary", fontSize: "0.8rem" }}>
                            Password
                        </Typography>
                        <TextField
                            required
                            fullWidth
                            name="password"
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            size="small"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            sx={{ mb: 3.5, '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
                        />

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            disabled={loading}
                            disableElevation
                            sx={{
                                py: 0.8,
                                fontWeight: 600,
                                textTransform: "none",
                                fontSize: "0.875rem",
                                borderRadius: 1.5,
                            }}
                        >
                            {loading ? "Signing in..." : "Sign in"}
                        </Button>
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
};

export default Login;