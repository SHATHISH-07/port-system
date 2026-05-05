import { useState } from "react";
import { Box, Typography, Snackbar, Alert, Accordion, AccordionSummary, AccordionDetails, Button } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api } from "../api/api";
import { type VesselAnalysisData } from "../types/vessel";

import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
import FileUpload from "../components/FileUpload";
import PerformanceStats from "../components/vessel-analysis/PerformanceStats";
import RiskAndStrategy from "../components/vessel-analysis/RiskAndStrategy";
import ExecutionPlan from "../components/vessel-analysis/ExecutionPlan";
import BerthImpactTable from "../components/vessel-analysis/BerthImpactTable";
import BerthRecommendation from "../components/vessel-analysis/BerthRecommendation";
import VisitTable from "../components/vessel-analysis/VisitTable";
import YardStrategy from "../components/vessel-analysis/YardStrategy";

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

const HistoryVesselAnalysis = () => {
  const [vesselId, setVesselId] = useState("");
  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{open: boolean, message: string, severity: "success" | "error" | "info" | "warning"}>({open: false, message: "", severity: "info"});

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/upload/history", form);
      showToast(res.data.message || "File uploaded successfully", "success");
      setFile(null);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.response?.data?.message || "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const showToast = (message: string, severity: "success" | "error" | "info" | "warning" = "error") => {
    setToast({open: true, message, severity});
  };

  const handleCloseToast = () => setToast(prev => ({...prev, open: false}));

  const fetchData = async () => {
    if (!vesselId.trim()) return;
    setLoading(true);
    try {
      console.info(`Fetching history vessel analysis data for vessel ID: ${vesselId.trim()}`);
      const form = new FormData();
      form.append("vessel_id", vesselId.trim());
      const res = await api.post<VesselAnalysisData>("/vessel/vessel-history-analysis", form);
      console.info("Successfully fetched vessel analysis data.");
      setData(res.data);
    } catch (err: any) {
      console.error("Error fetching history vessel data:", err);
      const detail = err?.response?.data?.detail || "";
      if (detail.includes("No dataset")) {
        showToast("No historical data found. Please upload via POST /upload/history.");
      } else {
        showToast(err?.response?.data?.error || "Error fetching data. Check the vessel ID.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isManual = data?.mode === "manual" || data?.mode === "current-override";

  return (
    <Box>
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>Upload Historical Data</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ maxWidth: 600 }}>
            <FileUpload onFileSelect={setFile} label="Upload History Dataset (.csv)" />
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
        mode="history"
        vesselId={vesselId}
        setVesselId={setVesselId}
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
              mode={data.mode || "history"}
              loaded={data.input?.loaded}
              discharged={data.input?.discharged}
            />
          </Section>

          {/* ── 02 · Visit History ── */}
          {!isManual && (
            <Section n="02" label="Visit History">
              <VisitTable visits={data.actual?.visits} avg={data.actual?.avg_hours ?? 0} />
            </Section>
          )}

          {/* ── 03 · Operational Intelligence (asymmetric grid) ── */}
          {!isManual && (
            <Section n={isManual ? "02" : "03"} label="Operational Intelligence">
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "280px 1fr" },
                  gridTemplateRows: { md: "1fr 1fr" },
                  gap: 2,
                }}
              >
                {/* Berth — spans 2 rows left */}
                <Box sx={{ gridRow: { md: "1 / 3" } }}>
                  <BerthRecommendation
                    berth={data.berth_analysis?.[0]?.berth}
                    concentration={data.berth_analysis?.[0]?.cargo_concentration}
                  />
                </Box>
                {/* Execution — top right */}
                <ExecutionPlan steps={data.execution_plan} />
                {/* Risks — bottom right */}
                <RiskAndStrategy risks={data.risks} />
              </Box>
            </Section>
          )}

          {/* ── 04 · Yard Strategy ── */}
          {!isManual && data.yard_strategy && (
            <Section n="04" label="Yard Preparation Strategy">
              <YardStrategy data={data.yard_strategy} />
            </Section>
          )}

          {/* ── 05 · Berth Impact ── */}
          {!isManual && (
            <Section n="05" label="Berth Impact Analysis">
              <BerthImpactTable data={data.berth_analysis} />
            </Section>
          )}

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

export default HistoryVesselAnalysis;
