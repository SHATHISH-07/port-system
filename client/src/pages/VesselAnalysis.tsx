import { useState } from "react";
import { api } from "../api/api";
import { type VesselAnalysisData } from "../types/vessel";
import { Box } from "@mui/material";

import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
import PerformanceStats from "../components/vessel-analysis/PerformanceStats";
import RiskEvaluation from "../components/vessel-analysis/RiskAndStrategy";
import ExecutionPlan from "../components/vessel-analysis/ExecutionPlan";
import BerthImpactTable from "../components/vessel-analysis/BerthImpactTable";
import BerthRecommendation from "../components/vessel-analysis/BerthRecommendation";

import VisitTable from "../components/vessel-analysis/VisitTable";

const VesselAnalysis = () => {
  const [vesselId, setVesselId] = useState("");
  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!vesselId) return;
    setLoading(true);

    try {
      const res = await api.get<VesselAnalysisData>(
        `/vessel/analysis?vessel_id=${vesselId}`
      );
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", py: 5, px: 2 }}>
      <AnalysisHeader
        vesselId={vesselId}
        setVesselId={setVesselId}
        onAnalyze={fetchData}
        loading={loading}
        data={data}
      />

      {data && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

          {/* 1️⃣ PERFORMANCE */}
          <PerformanceStats
            actual={data.actual.avg_hours}
            predicted={data.predicted.avg_hours}
          />

          {/* 2️⃣ VISIT TABLE */}
          <VisitTable
            visits={data.actual.visits}
            avg={data.actual.avg_hours}
          />

          {/* 3️⃣ STRATEGY + RISK LAYOUT */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, // 🔥 left bigger
              gap: 3,
              alignItems: "stretch"
            }}
          >

            {/* LEFT COLUMN → BERTH + STRATEGY */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

              <BerthRecommendation
                berth={data.berth_analysis?.[0]?.berth}
                concentration={data.berth_analysis?.[0]?.cargo_concentration}
              />

              <ExecutionPlan steps={data.execution_plan} />

            </Box>

            {/* RIGHT COLUMN → RISKS */}
            <RiskEvaluation risks={data.risks} />

          </Box>

          {/* 5️⃣ BERTH IMPACT TABLE */}
          <BerthImpactTable data={data.berth_analysis} />

        </Box>
      )}
    </Box>
  );
};

export default VesselAnalysis;