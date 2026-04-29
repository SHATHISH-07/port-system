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
import YardStrategy from "../components/vessel-analysis/YardStrategy";

const HistoryVesselAnalysis = () => {

  const [uploaded, setUploaded] = useState(false);
  const [vesselId, setVesselId] = useState("");

  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔥 UPLOAD DATASET
  const handleUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);

    await api.post("/vessel/vessel-history-analysis", form);

    setUploaded(true);
  };

  // 🔥 ANALYZE
  const fetchData = async () => {
    setLoading(true);

    try {
      const form = new FormData();
      if (vesselId) form.append("vessel_id", vesselId);

      const analysisRes = await api.post<VesselAnalysisData>("/vessel/vessel-history-analysis", form);

      setData(analysisRes.data);

    } catch (err: any) {

      if (err?.response?.data?.message?.includes("No dataset") || err?.response?.data?.detail?.includes("No dataset")) {
        setUploaded(false);
        alert("Upload dataset again");
      } else {
        alert("Error fetching data");
      }

    } finally {
      setLoading(false);
    }
  };

  const isManual = data?.mode === "manual" || data?.mode === "current-override";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>

      <AnalysisHeader
        mode="history"
        vesselId={vesselId}
        setVesselId={setVesselId}
        onAnalyze={fetchData}
        onUpload={handleUpload}
        loading={loading}
        uploaded={uploaded}
        data={data}
      />

      {data && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 3 }}>

          <PerformanceStats
            actual={data.actual?.avg_hours ?? data.predicted?.avg_hours ?? 0}
            predicted={data.predicted?.avg_hours ?? 0}
            mode={data.mode || "history"}
            loaded={data.input?.loaded}
            discharged={data.input?.discharged}
          />

          {!isManual && (
            <VisitTable visits={data.actual?.visits} avg={data.actual?.avg_hours ?? 0} />
          )}

          {!isManual && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
                gap: 2.5,
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

          {!isManual && data.yard_strategy && (
            <YardStrategy data={data.yard_strategy} />
          )}

          {!isManual && <BerthImpactTable data={data.berth_analysis} />}

        </Box>
      )}
    </Box>
  );
};

export default HistoryVesselAnalysis;
