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
  const [loaded, setLoaded] = useState("");
  const [discharged, setDischarged] = useState("");

  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔥 FETCH DATA (UNIFIED)
  const fetchData = async () => {
    setLoading(true);

    try {
      let url = `/vessel/analysis?`;

      if (vesselId) url += `vessel_id=${vesselId}&`;
      if (loaded) url += `loaded=${loaded}&`;
      if (discharged) url += `discharged=${discharged}&`;

      const res = await api.get<VesselAnalysisData>(url);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 MODE DETECTION
  const isManual = data?.mode === "manual";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      {/* HEADER */}
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

      {data && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

          {/* PERFORMANCE */}
          <PerformanceStats
            actual={data.actual?.avg_hours ?? data.predicted.avg_hours}
            predicted={data.predicted.avg_hours}
            mode={data.mode || "vessel"} // Pass mode to trigger override logic
            loaded={data.input?.loaded} // Pass load input
            discharged={data.input?.discharged} // Pass discharge input
          />

          {/* VISITS */}
          {!isManual && (
            <VisitTable
              visits={data.actual?.visits}
              avg={data.actual?.avg_hours}
            />
          )}

          {/* STRATEGY + RISKS — 3-col equal grid */}
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

          {/* BERTH IMPACT */}
          {!isManual && (
            <BerthImpactTable data={data.berth_analysis} />
          )}
        </Box>
      )}
    </Box>
  );
};

export default VesselAnalysis;