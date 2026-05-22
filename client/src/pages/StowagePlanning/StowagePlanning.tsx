import React, { useState } from 'react';
import { Box, Alert } from '@mui/material';
import HistoryAnalysisTab from './components/HistoryAnalysisTab';
import CurrentPlanningTab from './components/CurrentPlanningTab';
import StowageVisualizationTab from './components/StowageVisualizationTab';
import StowageHeader from './components/StowageHeader';

export default function StowagePlanning() {
  const [activeTab, setActiveTab] = useState(0);
  const [vesselId, setVesselId] = useState('');
  const [yardId, setYardId] = useState('');
  const [visitId, setVisitId] = useState('');
  const [searchVesselId, setSearchVesselId] = useState('');
  const [searchYardId, setSearchYardId] = useState('');
  const [searchVisitId, setSearchVisitId] = useState('');
  const [globalFile, setGlobalFile] = useState<File | null>(null);
  const [globalContainerText, setGlobalContainerText] = useState('');
  const [planningTrigger, setPlanningTrigger] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Visualization state lifted to parent so it can escape the padded content wrapper
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [visualizationData, setVisualizationData] = useState<any>(null);
  const [loadingVisualization, setLoadingVisualization] = useState(false);
  const [portRotation, setPortRotation] = useState<string[]>([]);
  const [recomputeTrigger, setRecomputeTrigger] = useState(0);

  const handleTabChange = (_e: React.SyntheticEvent, newValue: number) => {
    if (newValue !== null) setActiveTab(newValue);
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vesselId.trim()) {
      setError('Vessel ID is required.');
      return;
    }
    setError(null);
    setLoading(true);
    setSearchVesselId(vesselId.trim());
    setSearchYardId(yardId.trim());
    setSearchVisitId(visitId.trim());
    if (activeTab === 1) {
      setPlanningTrigger((prev) => prev + 1);
    }
    setTimeout(() => setLoading(false), 600);
  };



  return (
    <Box sx={{ width: '100%', height: visualizationOpen ? 'calc(100vh - 64px)' : 'auto', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box sx={{ display: visualizationOpen ? 'none' : 'block' }}>
        <StowageHeader
          vesselId={vesselId}
          setVesselId={setVesselId}
          yardId={yardId}
          setYardId={setYardId}
          visitId={visitId}
          setVisitId={setVisitId}
          activeTab={activeTab}
          handleTabChange={handleTabChange}
          globalFile={globalFile}
          setGlobalFile={setGlobalFile}
          globalContainerText={globalContainerText}
          setGlobalContainerText={setGlobalContainerText}
          loading={loading}
          handleSearchSubmit={handleSearchSubmit}
        />
      </Box>

      {error && !visualizationOpen && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="error" sx={{ borderRadius: 1 }}>{error}</Alert>
        </Box>
      )}

      <Box sx={{ p: visualizationOpen ? 0 : 3, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: activeTab === 0 && !visualizationOpen ? 'block' : 'none', width: '100%' }}>
          <HistoryAnalysisTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            visitId={searchVisitId}
            trigger={planningTrigger}
          />
        </Box>

        <Box sx={{ display: activeTab === 1 && !visualizationOpen ? 'block' : 'none', width: '100%' }}>
          <CurrentPlanningTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            globalFile={globalFile}
            globalContainerText={globalContainerText}
            trigger={planningTrigger}
            // Visualization state passed down so CurrentPlanningTab can trigger it
            // but the actual visualization renders in the parent (above)
            onOpenVisualization={(data: any, rotation: string[], loading: boolean) => {
              setVisualizationData(data);
              setPortRotation(rotation);
              setLoadingVisualization(loading);
              setVisualizationOpen(true);
            }}
            onVisualizationLoadingChange={setLoadingVisualization}
            onVisualizationDataChange={setVisualizationData}
            portRotation={portRotation}
            onPortRotationChange={setPortRotation}
            recomputeTrigger={recomputeTrigger}
            visualizationOpen={visualizationOpen}
            onCloseVisualization={() => setVisualizationOpen(false)}
          />
        </Box>
      </Box>

      {/* Render Visualization as an absolute overlay so we don't unmount CurrentPlanningTab, but KEEP the sidebar visible! */}
      {visualizationOpen && (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 9999, bgcolor: 'background.default', display: 'flex', flexDirection: 'column', m: { xs: "-20px -16px", md: "-32px -40px" } }}>
          <StowageVisualizationTab
            vesselId={searchVesselId}
            visualizationData={visualizationData}
            loadingVisualization={loadingVisualization}
            onClose={() => setVisualizationOpen(false)}
            portRotation={portRotation}
            onPortRotationChange={setPortRotation}
            onDragEnd={(newRotation: string[]) => {
              setPortRotation(newRotation);
              setRecomputeTrigger(prev => prev + 1);
            }}
          />
        </Box>
      )}
    </Box>
  );
}