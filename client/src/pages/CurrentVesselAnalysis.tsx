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
// import VisitTable from "../components/vessel-analysis/VisitTable";
import YardStrategy from "../components/vessel-analysis/YardStrategy";
import HeatmapPage from "./HeatmapPage";

const CurrentVesselAnalysis = () => {

  const [vesselId, setVesselId] = useState("");
  const [loaded, setLoaded] = useState("");
  const [discharged, setDischarged] = useState("");
  const [data, setData] = useState<VesselAnalysisData | null>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!vesselId.trim()) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("vessel_id", vesselId.trim());
      if (loaded) form.append("loaded", loaded);
      if (discharged) form.append("discharged", discharged);

      const [analysisRes, heatmapRes] = await Promise.all([
        api.post<VesselAnalysisData>("/vessel/current-vessel-analysis", form),
        api.post("/vessel/heatmap", form)
      ]);

      setData(analysisRes.data);
      setHeatmapData(heatmapRes.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "";
      if (detail.includes("No dataset")) {
        alert("No current data found in the database. Please upload the dataset via POST /upload/current.");
      } else {
        alert(err?.response?.data?.error || "Error fetching data. Check the vessel ID.");
      }
    } finally {
      setLoading(false);
    }
  };



  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>

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
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 3 }}>

          <PerformanceStats
            actual={data.actual?.avg_hours ?? data.predicted?.avg_hours ?? 0}
            predicted={data.predicted?.avg_hours ?? 0}
            mode={data.mode || "current"}
            loaded={data.input?.loaded}
            discharged={data.input?.discharged}
          />

          {heatmapData && !heatmapData.error && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ fontSize: "1.25rem", fontWeight: 600, color: "#e8eaed", mb: 0.5 }}>
                  Live Yard Heatmap
                </Box>
                <Box sx={{ fontSize: "0.875rem", color: "#9aa0a6" }}>
                  Real-time container concentration and block allocation for the target vessel.
                </Box>
              </Box>
              <HeatmapPage data={heatmapData} />
            </Box>
          )}

          {/* <VisitTable visits={data.actual?.visits} avg={data.actual?.avg_hours ?? 0} /> */}

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

          {data.yard_strategy && (
            <YardStrategy data={data.yard_strategy} />
          )}

          <BerthImpactTable data={data.berth_analysis} />



        </Box>
      )}
    </Box>
  );
};

export default CurrentVesselAnalysis;
