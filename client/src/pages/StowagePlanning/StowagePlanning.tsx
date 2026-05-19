import React, { useState } from 'react';
import { Box, Alert, useTheme, alpha } from '@mui/material';
import HistoryAnalysisTab from './components/HistoryAnalysisTab';
import CurrentPlanningTab from './components/CurrentPlanningTab';
import StowageHeader from './components/StowageHeader';

// Simple skeletons/placeholders for subcomponents (will be enriched in subsequent tasks)

export default function StowagePlanning() {
  const theme = useTheme();

  // Tabs State: 0 = Analysis, 1 = Planning/Optimizer
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

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (activeTab === 1) {
      setPlanningTrigger((prev) => prev + 1);
    }

    // Release loading state after search completes
    setTimeout(() => {
      setLoading(false);
    }, 600);
  };

  // Callbacks are no longer needed as Visual Bay Deck is removed

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
            onSelectVisit={() => {}}
          />
        </Box>

        <Box sx={{ display: activeTab === 1 ? 'block' : 'none', width: '100%' }}>
          <CurrentPlanningTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            globalFile={globalFile}
            globalContainerText={globalContainerText}
            trigger={planningTrigger}
          />
        </Box>
      </Box>
    </Box>
  );
}
