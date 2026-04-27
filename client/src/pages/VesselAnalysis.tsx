import { useState } from "react";
import { Box } from "@mui/material";
import { api } from "../api/api";
import { type VesselAnalysisData } from "../types/vessel";

import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
import PerformanceStats from "../components/vessel-analysis/PerformanceStats";
import RiskEvaluation from "../components/vessel-analysis/RiskAndStrategy";
import ExecutionPlan from "../components/vessel-analysis/ExecutionPlan";
import BerthImpactTable from "../components/vessel-analysis/BerthImpactTable";
import BerthRecommendation from "../components/vessel-analysis/BerthRecommendation";
import VisitTable from "../components/vessel-analysis/VisitTable";
import HeatmapPage from "./HeatmapPage";
import YardStrategy from "../components/vessel-analysis/YardStrategy"; // ✅ NEW

const VesselAnalysis = () => {
  const [vesselId, setVesselId] = useState("");
  const [loaded, setLoaded] = useState("");
  const [discharged, setDischarged] = useState("");

  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [heatmapData, setHeatmapData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔥 FETCH DATA
  const fetchData = async () => {
    setLoading(true);

    try {
      let analysisUrl = `/vessel/analysis?`;
      if (vesselId) analysisUrl += `vessel_id=${vesselId}&`;
      if (loaded) analysisUrl += `loaded=${loaded}&`;
      if (discharged) analysisUrl += `discharged=${discharged}&`;

      const [analysisRes, heatmapRes] = await Promise.all([
        api.get<VesselAnalysisData>(analysisUrl),
        api.get(`/vessel/heatmap?vessel_id=${vesselId}`)
      ]);

      setData(analysisRes.data);
      setHeatmapData(heatmapRes.data);
    } catch (error) {
      console.error("Failed to load vessel data:", error);
    } finally {
      setLoading(false);
    }
  };

  const isManual = data?.mode === "manual";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      {/* ── HEADER ── */}
      <AnalysisHeader
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

      {/* ── MAIN CONTENT ── */}
      {data && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 3 }}>

          {/* ── PERFORMANCE ── */}
          <PerformanceStats
            actual={data.actual?.avg_hours ?? data.predicted.avg_hours}
            predicted={data.predicted.avg_hours}
            mode={data.mode || "vessel"}
            loaded={data.input?.loaded}
            discharged={data.input?.discharged}
          />

          {/* ── HEATMAP ── */}
          {heatmapData && <HeatmapPage data={heatmapData} />}

          {/* ── VISIT TABLE ── */}
          {!isManual && (
            <VisitTable visits={data.actual?.visits} avg={data.actual?.avg_hours} />
          )}

          {/* ── TOP GRID (CORE DECISIONS) ── */}
          {!isManual && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
                gap: 2.5,
                alignItems: "start",
              }}
            >
              <BerthRecommendation
                berth={data.berth_analysis?.[0]?.berth}
                concentration={data.berth_analysis?.[0]?.cargo_concentration}
              />

              <ExecutionPlan steps={data.execution_plan} />

              <RiskEvaluation risks={data.risks} />
            </Box>
          )}

          {/* ── NEW: YARD STRATEGY (FULL WIDTH) ── */}
          {!isManual && data.yard_strategy && (
            <Box>
              <YardStrategy data={data.yard_strategy} />
            </Box>
          )}

          {/* ── BERTH IMPACT TABLE ── */}
          {!isManual && <BerthImpactTable data={data.berth_analysis} />}

        </Box>
      )}
    </Box>
  );
};

export default VesselAnalysis;