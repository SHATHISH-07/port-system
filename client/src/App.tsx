import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { ThemeContextProvider } from "./theme/ThemeContext";
import Layout from "./components/Layout";

const HistoryVesselAnalysis = lazy(() => import("./pages/HistoryVesselAnalysis"));
const CurrentVesselAnalysis  = lazy(() => import("./pages/CurrentVesselAnalysis"));
const TerminalMap            = lazy(() => import("./pages/TerminalMap"));
const TrainModel             = lazy(() => import("./pages/TrainModel"));

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
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"                  element={<Navigate to="/history-analysis" />} />
              <Route path="/history-analysis"  element={<HistoryVesselAnalysis />} />
              <Route path="/current-analysis"  element={<CurrentVesselAnalysis />} />
              <Route path="/heatmap"           element={<TerminalMap />} />
              <Route path="/train-model"       element={<TrainModel />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </ThemeContextProvider>
  );
}
