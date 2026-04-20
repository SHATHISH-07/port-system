import { useState } from "react";
import { api } from "../api/api";
import { type VesselAnalysisData } from "../types/vessel";
import { Box, Paper, Typography, Divider } from "@mui/material";

// Sub-components
import AnalysisHeader from "../components/vessel-analysis/AnalysisHeader";
import PerformanceStats from "../components/vessel-analysis/PerformanceStats";

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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", py: 5, px: 2 }}>
      {/* HEADER */}
      <AnalysisHeader
        vesselId={vesselId}
        setVesselId={setVesselId}
        onAnalyze={fetchData}
        loading={loading}
        data={data}
      />

      {data && data.vessel && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
          <Box sx={{ gridColumn: "1 / -1", mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: "bold" }}>
              Stay Duration Analytics
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Machine Learning prediction bounds versus physical port constraints.
            </Typography>
          </Box>

          {/* Average Performance */}
          <PerformanceStats
            actual={data.actual.avg_hours}
            predicted={data.predicted.avg_hours}
          />
          
          {/* Max/Min Insights */}
          <Paper sx={{ p: 4, borderRadius: 3, border: "1px solid #e5e7eb", boxShadow: "none" }}>
             <Typography sx={{ fontWeight: "bold", mb: 2, color: "#373e4c" }}>DURATION RANGES</Typography>
             <Divider sx={{ mb: 2 }} />
             
             <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
               <Typography color="text.secondary">Physical Visit Max</Typography>
               <Typography sx={{ fontWeight: 'bold' }}>{data.actual.max_hours} hrs</Typography>
             </Box>
             <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
               <Typography color="text.secondary">Predicted Network Max</Typography>
               <Typography sx={{ fontWeight: 'bold', color: "#486495" }}>{data.predicted.max_hours} hrs</Typography>
             </Box>
             
             <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
               <Typography color="text.secondary">Physical Visit Min</Typography>
               <Typography sx={{ fontWeight: 'bold' }}>{data.actual.min_hours} hrs</Typography>
             </Box>
             <Box sx={{ display: "flex", justifyContent: "space-between" }}>
               <Typography color="text.secondary">Predicted Network Min</Typography>
               <Typography sx={{ fontWeight: 'bold', color: "#486495" }}>{data.predicted.min_hours} hrs</Typography>
             </Box>
          </Paper>

          {/* Connected Visits */}
          <Box sx={{ gridColumn: "1 / -1" }}>
            <Paper sx={{ p: 4, borderRadius: 3, border: "1px solid #e5e7eb", boxShadow: "none" }}>
              <Typography sx={{ fontWeight: "bold", mb: 2, color: "#373e4c" }}>REGISTERED VISITS ({data.predicted.visits} Predicted Context)</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {Object.entries(data.actual.visits || {}).map(([visitId, hours]) => (
                  <Box key={visitId} sx={{ p: 2, bgcolor: "#f8fafc", borderRadius: 2, minWidth: 150 }}>
                     <Typography variant="body2" sx={{ color: "text.secondary" }}>{visitId}</Typography>
                     <Typography sx={{ fontWeight: "bold", fontSize: 18 }}>{hours} hrs</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Box>

        </Box>
      )}
    </Box>
  );
};

export default VesselAnalysis;