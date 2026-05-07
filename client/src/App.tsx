import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { ThemeContextProvider } from "./theme/ThemeContext";
import Layout from "./components/Layout";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

const HistoryVesselAnalysis = lazy(() => import("./pages/HistoryVesselAnalysis"));
const CurrentVesselAnalysis = lazy(() => import("./pages/CurrentVesselAnalysis"));
const TerminalMap           = lazy(() => import("./pages/TerminalMap"));
const TrainModel            = lazy(() => import("./pages/TrainModel"));
const DataIngestion         = lazy(() => import("./pages/DataIngestion"));
const Login                 = lazy(() => import("./pages/Login"));
const Requests              = lazy(() => import("./pages/Requests"));
const UserManagement        = lazy(() => import("./pages/UserManagement"));
const SystemLogs            = lazy(() => import("./pages/SystemLogs"));
const CraneAnalytics        = lazy(() => import("./pages/CraneAnalytics"));

function PageLoader() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <CircularProgress size={28} />
    </Box>
  );
}

export default function App() {
  useEffect(() => {
    const t = setTimeout(() => { import("./pages/TerminalMap"); }, 2000);
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
                  <Route path="/" element={<Navigate to="/history-analysis" />} />
                  <Route path="/history-analysis" element={<ProtectedRoute><HistoryVesselAnalysis /></ProtectedRoute>} />
                  <Route path="/current-analysis" element={<ProtectedRoute><CurrentVesselAnalysis /></ProtectedRoute>} />
                  <Route path="/heatmap" element={<ProtectedRoute><TerminalMap /></ProtectedRoute>} />
                  <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
                  
                  {/* Admin Routes */}
                  <Route path="/train-model"     element={<AdminRoute><TrainModel /></AdminRoute>} />
                  <Route path="/ingest"           element={<AdminRoute><DataIngestion /></AdminRoute>} />
                  <Route path="/user-management"  element={<AdminRoute><UserManagement /></AdminRoute>} />
                  <Route path="/system-logs"      element={<AdminRoute><SystemLogs /></AdminRoute>} />
                  <Route path="/crane-analytics"  element={<AdminRoute><CraneAnalytics /></AdminRoute>} />
                </Routes>
              </Suspense>
            </Layout>
          </BrowserRouter>
      </AuthProvider>
    </ThemeContextProvider>
  );
}
