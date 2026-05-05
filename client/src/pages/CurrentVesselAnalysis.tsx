import { useState } from "react";
import { Box, Typography, Snackbar, Alert, Accordion, AccordionSummary, AccordionDetails, Button } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api } from "../api/api";
import { type VesselAnalysisData } from "../types/vessel";

import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
import FileUpload from "../components/FileUpload";
import PerformanceStats from "../components/vessel-analysis/PerformanceStats";
import RiskEvaluation from "../components/vessel-analysis/RiskAndStrategy";
import ExecutionPlan from "../components/vessel-analysis/ExecutionPlan";
import BerthImpactTable from "../components/vessel-analysis/BerthImpactTable";
import BerthRecommendation from "../components/vessel-analysis/BerthRecommendation";
import YardStrategy from "../components/vessel-analysis/YardStrategy";
import HeatmapPage from "./HeatmapPage";


function Section({
  n,
  label,
  children,
}: {
  n: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" sx={{ pt: 4 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          mb: 2.5,
          pb: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontSize: "2.25rem",
            fontWeight: 800,
            color: "text.disabled",
            lineHeight: 1,
            letterSpacing: "-2px",
            fontFamily: "monospace",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {n}
        </Typography>
        <Typography variant="overline" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

// main component
const CurrentVesselAnalysis = () => {
  const [vesselId, setVesselId] = useState("");
  const [loaded, setLoaded] = useState("");
  const [discharged, setDischarged] = useState("");
  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ open: boolean, message: string, severity: "success" | "error" | "info" | "warning" }>({ open: false, message: "", severity: "info" });

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/upload/current", form);
      showToast(res.data.message || "File uploaded successfully", "success");
      setFile(null);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.response?.data?.message || "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const showToast = (message: string, severity: "success" | "error" | "info" | "warning" = "error") => {
    setToast({ open: true, message, severity });
  };

  const handleCloseToast = () => setToast(prev => ({ ...prev, open: false }));

  const fetchData = async () => {
    if (!vesselId.trim()) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("vessel_id", vesselId.trim());
      if (loaded) form.append("loaded", loaded);
      if (discharged) form.append("discharged", discharged);

      console.info(`Fetching current vessel analysis data for vessel ID: ${vesselId.trim()}`);

      const analysisPromise = api.post<VesselAnalysisData>("/vessel/current-vessel-analysis", form)
        .then(res => {
          setData(res.data);
          setLoading(false);
        });

      const heatmapPromise = api.post("/vessel/heatmap", form)
        .then(res => setHeatmapData(res.data));

      await Promise.allSettled([analysisPromise, heatmapPromise]);
      console.info("Successfully fetched vessel analysis data.");
    } catch (err: any) {
      console.error("Error fetching current vessel data:", err);
      const detail = err?.response?.data?.detail || "";
      if (detail.includes("No dataset")) {
        showToast("No current data found. Please upload via POST /upload/current.");
      } else {
        showToast(err?.response?.data?.error || "Error fetching data. Check the vessel ID.");
      }
    } finally {
      // loading is handled inside the promise 
    }
  };

  return (
    <Box>
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>Upload Current Data</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ maxWidth: 600 }}>
            <FileUpload onFileSelect={setFile} label="Upload Current Dataset (.csv)" />
            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="contained"
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? "Uploading…" : "Upload File"}
              </Button>
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* ── Command bar ── */}
      <AnalysisHeader
        mode="current"
        vesselId={vesselId}
        setVesselId={setVesselId}
        loaded={loaded}
        setLoaded={setLoaded}
        discharged={discharged}
        setDischarged={setDischarged}
        onAnalyze={fetchData}
        loading={loading}
        data={data}
      />

      {data && (
        <>
          {/* ── 01 · Performance ── */}
          <Section n="01" label="Performance Metrics">
            <PerformanceStats
              actual={data.actual?.avg_hours ?? data.predicted?.avg_hours ?? 0}
              predicted={data.predicted?.avg_hours ?? 0}
              mode={data.mode || "current"}
              loaded={data.input?.loaded}
              discharged={data.input?.discharged}
            />
          </Section>

          {/* ── 02 · Yard Heatmap ── */}
          {heatmapData && !heatmapData.error && (
            <Section n="02" label="Live Yard Heatmap">
              <HeatmapPage data={heatmapData} />
            </Section>
          )}

          {/* ── 03 · Operational Intelligence ── */}
          {/* Asymmetric 1:2 grid — berth on left, execution+risks share right */}
          <Section n={heatmapData && !heatmapData.error ? "03" : "02"} label="Operational Intelligence">
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "280px 1fr" },
                gridTemplateRows: { md: "1fr 1fr" },
                gap: 2,
              }}
            >
              {/* Berth — spans 2 rows on the left */}
              <Box sx={{ gridRow: { md: "1 / 3" } }}>
                <BerthRecommendation
                  berth={data.berth_analysis?.[0]?.berth}
                  concentration={data.berth_analysis?.[0]?.cargo_concentration}
                />
              </Box>
              {/* Execution plan — top right */}
              <ExecutionPlan steps={data.execution_plan} />
              {/* Risks — bottom right */}
              <RiskEvaluation risks={data.risks} />
            </Box>
          </Section>

          {/* ── 04 · Yard Strategy ── */}
          {data.yard_strategy && (
            <Section n={heatmapData && !heatmapData.error ? "04" : "03"} label="Yard Preparation Strategy">
              <YardStrategy data={data.yard_strategy} />
            </Section>
          )}

          {/* ── 05 · Berth Table ── */}
          <Section
            n={
              [heatmapData && !heatmapData.error, data.yard_strategy].filter(Boolean).length === 2
                ? "05"
                : [heatmapData && !heatmapData.error, data.yard_strategy].filter(Boolean).length === 1
                  ? "04"
                  : "03"
            }
            label="Berth Impact Analysis"
          >
            <BerthImpactTable data={data.berth_analysis} />
          </Section>

          {/* Bottom spacer */}
          <Box sx={{ pb: 6 }} />
        </>
      )}

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={handleCloseToast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={handleCloseToast} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CurrentVesselAnalysis;
