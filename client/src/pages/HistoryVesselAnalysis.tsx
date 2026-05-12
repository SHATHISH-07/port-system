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
import CraneAssignment from "../components/vessel-analysis/CraneAssignment";

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
      const res = await api.get<VesselAnalysisData & { error?: string; suggestions?: string[] }>("/vessel/analysis", {
        params: { 
          vesselId: vesselId.trim(),
          datasetType: "history" 
        }
      });

      // Backend returns 200 with {error:...} when vessel not found
      if (res.data?.error) {
        const suggs = res.data.suggestions ?? [];
        const suggHint = suggs.length > 0 ? ` Did you mean: ${suggs.join(', ')}?` : '';
        showToast(`${res.data.error}${suggHint}`, 'warning');
        setData(null);
      } else {
        setData(res.data);
      }
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
          {/* ── 01 · Performance & Recommendation ── */}
          <Section n="01" label="Performance & Recommendation">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 3 }}>
              <PerformanceStats
                actual={data.actual?.avg_hours ?? data.predicted?.avg_hours ?? 0}
                predicted={data.predicted?.avg_hours ?? 0}
                mode={data.mode || "history"}
                loaded={data.input?.loaded ?? data.top_visit_stats?.loaded}
                discharged={data.input?.discharged ?? data.top_visit_stats?.discharged}
              />
              <BerthRecommendation 
                berth={data.berth_recommendation?.berth} 
                concentration={data.berth_recommendation?.congestion_risk} 
              />
            </Box>
          </Section>

          {/* ── 02 · Visit History ── */}
          {!isManual && (
            <Section n="02" label="Visit History">
              <VisitTable visits={data.actual?.visits} avg={data.actual?.avg_hours ?? 0} />
            </Section>
          )}

          {/* ── 03 · Crane Assignment ── */}
          {!isManual && (
            <Section n="03" label="Crane Assignment by Visit">
              <CraneAssignment
                data={data.crane_assignment}
                mode="history"
              />
            </Section>
          )}

          {/* ── 04 · Berth History ── */}
          {!isManual && (
            <Section n="04" label="Historical Berth Analysis">
              <BerthImpactTable 
                data={data.berth_analysis} 
                conflicts={data.berth_conflicts}
                mode="history" 
              />
            </Section>
          )}

          {/* ── 05 · Strategy & Risks ── */}
          {!isManual && (
            <Section n="05" label="Historical Strategy & Risk Analysis">
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
                <RiskAndStrategy 
                  risks={data.risks || []} 
                  predictions={data.operational_predictions} 
                  delays={data.delay_analysis || []}
                />
                <ExecutionPlan steps={data.execution_plan || []} />
              </Box>
            </Section>
          )}

          {/* ── 06 · Yard Strategy ── */}
          {!isManual && data.yard_strategy && (
            <Section n="06" label="Yard Storage Strategy">
              <YardStrategy data={data.yard_strategy} />
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
