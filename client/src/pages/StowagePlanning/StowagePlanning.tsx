import React, { useState } from 'react';
import { Box, Alert, Typography } from '@mui/material';
import HistoryAnalysisTab from './components/HistoryAnalysisTab';
import CurrentPlanningTab from './components/CurrentPlanningTab';
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

    setTimeout(() => {
      setLoading(false);
    }, 600);
  };

  return (
    <Box
      sx={{
        width: '100%',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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

      {error && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="error" sx={{ borderRadius: 1 }}>{error}</Alert>
        </Box>
      )}

      <Box
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ display: activeTab === 0 ? 'block' : 'none', width: '100%' }}>
          <HistoryAnalysisTab
            vesselId={searchVesselId}
            yardId={searchYardId}
            visitId={searchVisitId}
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

        <Box sx={{ display: activeTab === 2 ? 'block' : 'none', width: '100%' }}>
          <Box sx={{ textAlign: 'center', py: 10, color: 'text.secondary' }}>
            <Typography variant="h6">Visualization Module</Typography>
            <Typography variant="body2">Deck visualization pending implementation.</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}