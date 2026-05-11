import { useState } from "react";
import { Box, Typography, Snackbar, Alert } from "@mui/material";
import { api } from "../api/api";
import { type VesselAnalysisData, type VesselHeatmapResponse } from "../types/vessel";

import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
import PerformanceStats from "../components/vessel-analysis/PerformanceStats";
import RiskEvaluation from "../components/vessel-analysis/RiskAndStrategy";
import ExecutionPlan from "../components/vessel-analysis/ExecutionPlan";
import BerthImpactTable from "../components/vessel-analysis/BerthImpactTable";
import BerthRecommendation from "../components/vessel-analysis/BerthRecommendation";
import YardStrategy from "../components/vessel-analysis/YardStrategy";
import CraneAssignment from "../components/vessel-analysis/CraneAssignment";
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

// main component
const CurrentVesselAnalysis = () => {
  const [vesselId, setVesselId] = useState("");
  const [loaded, setLoaded] = useState("");
  const [discharged, setDischarged] = useState("");
  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [heatmapData, setHeatmapData] = useState<VesselHeatmapResponse | null>(null);
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
      const params: Record<string, string> = {
        vesselId: vesselId.trim(),
        datasetType: "current",
      };
      // Pass user-entered load/discharge so backend strategy updates
      if (loaded && Number(loaded) > 0) params.loaded = loaded;
      if (discharged && Number(discharged) > 0) params.discharged = discharged;

      const analysisPromise = api.get<VesselAnalysisData>("/vessel/analysis", { params })
        .then(res => { setData(res.data); });

      const heatmapPromise = api.get<VesselHeatmapResponse>("/vessel/heatmap", {
        params: { vesselId: vesselId.trim(), datasetType: "current" }
      }).then(res => { setHeatmapData(res.data); });

      await Promise.allSettled([analysisPromise, heatmapPromise]);
      setLoading(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: unknown; error?: unknown } } };
      let detailMsg = "";
      if (e?.response?.data?.detail) {
        detailMsg = typeof e.response.data.detail === "string" 
          ? e.response.data.detail 
          : JSON.stringify(e.response.data.detail);
      }
      
      if (detailMsg.includes("No dataset")) {
        showToast("No current data found. Use Data Ingestion (/ingest) to upload records.");
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
      // loading is managed inside the analysis promise
    }
  };

  return (
    <Box>
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
              actual={data?.actual?.avg_hours ?? data?.predicted?.avg_hours ?? 0}
              predicted={data?.predicted?.avg_hours ?? 0}
              mode={data.mode || "current"}
              loaded={data.input?.loaded ?? data.top_visit_stats?.loaded}
              discharged={data.input?.discharged ?? data.top_visit_stats?.discharged}
            />
          </Section>

          {/* ── 02 · Crane Assignment ── */}
          <Section n="02" label="Crane Assignment">
            <CraneAssignment
              data={data.crane_assignment}
              mode="current"
              recommendedCranes={data.operational_predictions?.recommended_crane_count}
            />
          </Section>

          {/* ── 03 · Yard Heatmap ── */}
          {heatmapData && !heatmapData.error && (
            <Section n="03" label="Live Yard Heatmap">
              <HeatmapPage data={heatmapData} />
            </Section>
          )}

          {/* ── 04 · Operational Intelligence ── */}
          <Section n={heatmapData && !heatmapData.error ? "04" : "03"} label="Operational Intelligence">
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
                  concentration={String(data.berth_analysis?.[0]?.cargo_concentration_pct ?? "")}
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
