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
import YardStrategy from "../components/vessel-analysis/YardStrategy";

const VesselAnalysis = () => {

  const [uploaded, setUploaded] = useState(false);

  const [vesselId, setVesselId] = useState("");
  const [loaded, setLoaded] = useState("");
  const [discharged, setDischarged] = useState("");

  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [heatmapData, setHeatmapData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔥 UPLOAD DATASET
  const handleUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);

    await api.post("/vessel/vessel-history-analysis", form);
    await api.post("/vessel/heatmap", form);

    setUploaded(true);
  };

  // 🔥 ANALYZE
  const fetchData = async () => {
    setLoading(true);

    try {
      const form = new FormData();

      if (vesselId) form.append("vessel_id", vesselId);
      if (loaded) form.append("loaded", loaded);
      if (discharged) form.append("discharged", discharged);

      const [analysisRes, heatmapRes] = await Promise.all([
        api.post<VesselAnalysisData>("/vessel/current-vessel-analysis", form),
        api.post("/vessel/heatmap", form),
      ]);

      setData(analysisRes.data);
      setHeatmapData(heatmapRes.data);

    } catch (err: any) {

      if (err?.response?.data?.message?.includes("No dataset")) {
        setUploaded(false);
        alert("Upload dataset again");
      }

    } finally {
      setLoading(false);
    }
  };

  const isManual = data?.mode === "manual";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>

      <AnalysisHeader
        vesselId={vesselId}
        setVesselId={setVesselId}
        loaded={loaded}
        setLoaded={setLoaded}
        discharged={discharged}
        setDischarged={setDischarged}
        onAnalyze={fetchData}
        onUpload={handleUpload}
        loading={loading}
        uploaded={uploaded}
        data={data}
      />

      {data && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 3 }}>

          <PerformanceStats
            actual={data.actual?.avg_hours ?? data.predicted.avg_hours}
            predicted={data.predicted.avg_hours}
            mode={data.mode || "vessel"}
            loaded={data.input?.loaded}
            discharged={data.input?.discharged}
          />

          {heatmapData && <HeatmapPage data={heatmapData} />}

          {!isManual && (
            <VisitTable visits={data.actual?.visits} avg={data.actual?.avg_hours} />
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

export default VesselAnalysis;