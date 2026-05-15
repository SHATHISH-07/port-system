import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { ThemeContextProvider } from "./theme/ThemeContext";
import Layout from "./components/Layout";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

const OperationalDashboard = lazy(() => import("./pages/OperationalDashboard"));
const StayTimeAnalysis = lazy(() => import("./pages/StayTimeAnalysis/StayTimeAnalysis"));
const TrainModel = lazy(() => import("./pages/TrainModel"));
const DataIngestion = lazy(() => import("./pages/DataIngestion"));
const Login = lazy(() => import("./pages/Login"));
const Requests = lazy(() => import("./pages/Requests"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const SystemLogs = lazy(() => import("./pages/SystemLogs"));
const CraneAnalytics = lazy(() => import("./pages/CraneAnalytics"));

function PageLoader() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <CircularProgress size={28} />
    </Box>
  );
}

export default function App() {
  useEffect(() => {
    const t = setTimeout(() => { import("./pages/OperationalDashboard"); }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeContextProvider>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />

                {/* Common Protected Routes */}
                <Route path="/" element={<Navigate to="/stay-analysis" />} />
                <Route path="/stay-analysis" element={<ProtectedRoute><StayTimeAnalysis /></ProtectedRoute>} />
                <Route path="/operational-dashboard" element={<ProtectedRoute><OperationalDashboard /></ProtectedRoute>} />
                <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
                <Route path="/crane-analytics" element={<ProtectedRoute><CraneAnalytics /></ProtectedRoute>} />

                {/* Legacy Routes (Kept for now to prevent breaking any direct links during transition) */}
                <Route path="/history-analysis" element={<Navigate to="/stay-analysis" />} />
                <Route path="/current-analysis" element={<Navigate to="/stay-analysis" />} />
                <Route path="/heatmap" element={<Navigate to="/operational-dashboard" />} />

                {/* Admin Routes */}
                <Route path="/train-model" element={<AdminRoute><TrainModel /></AdminRoute>} />
                <Route path="/ingest" element={<AdminRoute><DataIngestion /></AdminRoute>} />
                <Route path="/user-management" element={<AdminRoute><UserManagement /></AdminRoute>} />
                <Route path="/system-logs" element={<AdminRoute><SystemLogs /></AdminRoute>} />
              </Routes>
            </Suspense>
          </Layout>
        </BrowserRouter>
      </AuthProvider>
    </ThemeContextProvider>
  );
}