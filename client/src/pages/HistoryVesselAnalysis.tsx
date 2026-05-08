import { useState } from "react";
import { Box, Typography, Snackbar, Alert } from "@mui/material";
import { api } from "../api/api";
import { type VesselAnalysisData } from "../types/vessel";

import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
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
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "text.secondary",
            lineHeight: 1,
            letterSpacing: "-2px",
            fontFamily: "monospace",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {n}
        </Typography>
        <Typography variant="h6" sx={{ color: "text.secondary" }}>
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
  const [toast, setToast] = useState<{ open: boolean, message: string, severity: "success" | "error" | "info" | "warning" }>({ open: false, message: "", severity: "info" });

  const showToast = (message: string, severity: "success" | "error" | "info" | "warning" = "error") => {
    setToast({ open: true, message, severity });
  };

  const handleCloseToast = () => setToast(prev => ({ ...prev, open: false }));

  const fetchData = async () => {
    if (!vesselId.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<VesselAnalysisData>("/vessel/analysis", {
        params: { 
          vesselId: vesselId.trim(),
          datasetType: "history" 
        }
      });
      setData(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: unknown; error?: unknown } } };
      let detailMsg = "";
      if (e?.response?.data?.detail) {
        detailMsg = typeof e.response.data.detail === "string" 
          ? e.response.data.detail 
          : JSON.stringify(e.response.data.detail);
      }
      
      if (detailMsg.includes("No dataset")) {
        showToast("No historical data found. Use Data Ingestion (/ingest) to upload records.");
      } else {
        let errorMsg = "Error fetching data. Check the vessel ID.";
        if (e?.response?.data?.error) {
           errorMsg = typeof e.response.data.error === "string" 
            ? e.response.data.error 
            : JSON.stringify(e.response.data.error);
        } else if (detailMsg) {
           errorMsg = detailMsg;
        }
        showToast(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const isManual = data?.mode === "manual" || data?.mode === "current-override";

  return (
    <Box>
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
              loaded={data.input?.loaded ?? data.top_visit_stats?.loaded}
              discharged={data.input?.discharged ?? data.top_visit_stats?.discharged}
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
