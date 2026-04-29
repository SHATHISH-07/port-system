import { useState } from "react";
import { Box, Typography } from "@mui/material";
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
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <Typography
          sx={{
            fontSize: "2.25rem",
            fontWeight: 800,
            color: "rgba(255,255,255,0.09)",
            lineHeight: 1,
            letterSpacing: "-2px",
            fontFamily: "monospace",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {n}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
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

  const fetchData = async () => {
    if (!vesselId.trim()) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("vessel_id", vesselId.trim());
      const res = await api.post<VesselAnalysisData>("/vessel/vessel-history-analysis", form);
      setData(res.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "";
      if (detail.includes("No dataset")) {
        alert("No historical data found. Please upload via POST /upload/history.");
      } else {
        alert(err?.response?.data?.error || "Error fetching data. Check the vessel ID.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isManual = data?.mode === "manual" || data?.mode === "current-override";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>

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
    </Box>
  );
};

export default HistoryVesselAnalysis;
