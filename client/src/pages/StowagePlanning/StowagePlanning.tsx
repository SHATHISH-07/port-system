import React, { useState } from 'react';
import { Box, Alert, useTheme, alpha } from '@mui/material';
import HistoryAnalysisTab from './components/HistoryAnalysisTab';
import CurrentPlanningTab from './components/CurrentPlanningTab';
import VisualizationTab from './components/VisualizationTab';
import StowageHeader from './components/StowageHeader';

// Simple skeletons/placeholders for subcomponents (will be enriched in subsequent tasks)

export default function StowagePlanning() {
  const theme = useTheme();

  // Tabs State: 0 = Analysis, 1 = Planning/Optimizer, 2 = Visualization
  const [activeTab, setActiveTab] = useState(0);

  // Global Parameters
  const [vesselId, setVesselId] = useState('');
  const [yardId, setYardId] = useState('');
  const [visitId, setVisitId] = useState('');
  const [searchVesselId, setSearchVesselId] = useState('');
  const [searchYardId, setSearchYardId] = useState('');
  const [searchVisitId, setSearchVisitId] = useState('');

  // Global Header Upload & Text states for Current & Visualization tabs
  const [globalFile, setGlobalFile] = useState<File | null>(null);
  const [globalContainerText, setGlobalContainerText] = useState('');

  // Triggers to execute subcomponent queries from the parent form search submission
  const [planningTrigger, setPlanningTrigger] = useState(0);
  const [visTrigger, setVisTrigger] = useState(0);

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared Data States
  const [visitIdToVisualize, setVisitIdToVisualize] = useState<string | null>(null);
  const [optimizedContainerIds, setOptimizedContainerIds] = useState<string[]>([]);
  const [visMode, setVisMode] = useState<'HISTORICAL' | 'CURRENT'>('HISTORICAL');

  const handleTabChange = (_e: React.SyntheticEvent, newValue: number) => {
    if (newValue !== null) {
      setActiveTab(newValue);
    }
  };

  const handleSearchSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
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

    // Trigger child tab fetch actions
    if (activeTab === 0) {
      setVisitIdToVisualize(visitId.trim() || null);
      setVisMode('HISTORICAL');
    } else if (activeTab === 1) {
      setPlanningTrigger((prev) => prev + 1);
    } else if (activeTab === 2) {
      setVisTrigger((prev) => prev + 1);
    }

    // Release loading state after search completes
    setTimeout(() => {
      setLoading(false);
    }, 600);
  };

  // Callback to visualize a specific historical visit and load header parameters automatically
  const handleSelectVisitForVisualization = (vid: string, vId: string, yId: string) => {
    setVesselId(vId);
    setYardId(yId || '');
    setVisitId(vid);
    setSearchVesselId(vId);
    setSearchYardId(yId || '');
    setVisitIdToVisualize(vid);
    setVisMode('HISTORICAL');
    setActiveTab(2); // Switch to deck visualization tab
  };

  // Callback to visualize an optimized current planning container set
  const handleSelectPlanningForVisualization = (cids: string[]) => {
    setOptimizedContainerIds(cids);
    setVisMode('CURRENT');
    setActiveTab(2); // Auto switch to Visualization Tab
  };

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Header Control Banner */}
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

      {/* Errors Banner */}
      {error && (
        <Box sx={{ px: { xs: 2.5, md: 4 }, mt: 2 }}>
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setError(null)}
            sx={{
              borderRadius: 2,
              bgcolor: theme.palette.error.main,
              boxShadow: `0 4px 16px ${alpha(theme.palette.error.main, 0.15)}`,
            }}
          >
            {error}
          </Alert>
        </Box>
      )}

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: { xs: 2.5, md: 4 },
          pt: { xs: 2.5, md: 4 },
          pb: 4,
          scrollBehavior: 'smooth',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ display: activeTab === 0 ? 'block' : 'none', width: '100%' }}>
          <HistoryAnalysisTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            visitId={searchVisitId}
            onSelectVisit={handleSelectVisitForVisualization}
          />
        </Box>

        <Box sx={{ display: activeTab === 1 ? 'block' : 'none', width: '100%' }}>
          <CurrentPlanningTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            globalFile={globalFile}
            globalContainerText={globalContainerText}
            trigger={planningTrigger}
            onPlanOptimized={handleSelectPlanningForVisualization}
          />
        </Box>

        <Box sx={{ display: activeTab === 2 ? 'block' : 'none', width: '100%', flex: 1 }}>
          <VisualizationTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            visitId={visitIdToVisualize}
            containerIds={optimizedContainerIds}
            globalFile={globalFile}
            globalContainerText={globalContainerText}
            trigger={visTrigger}
            mode={visMode}
          />
        </Box>
      </Box>
    </Box>
  );
}
