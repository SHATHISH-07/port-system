import React from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ConstructionIcon from '@mui/icons-material/Construction';

interface StowageHeaderProps {
  vesselId: string;
  setVesselId: (val: string) => void;
  yardId: string;
  setYardId: (val: string) => void;
  visitId: string;
  setVisitId: (val: string) => void;
  activeTab: number;
  handleTabChange: (e: React.SyntheticEvent, next: number) => void;
  globalFile: File | null;
  setGlobalFile: (file: File | null) => void;
  globalContainerText: string;
  setGlobalContainerText: (val: string) => void;
  loading: boolean;
  handleSearchSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
}

export default function StowageHeader({
  vesselId,
  setVesselId,
  yardId,
  setYardId,
  visitId,
  setVisitId,
  activeTab,
  handleTabChange,
  globalFile,
  setGlobalFile,
  globalContainerText,
  setGlobalContainerText,
  loading,
  handleSearchSubmit,
}: StowageHeaderProps) {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        px: { xs: 2.5, md: 4 },
        py: 2.5,
        bgcolor: alpha(theme.palette.background.default, 0.9),
        backdropFilter: 'blur(25px)',
        borderRadius: 0,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSearchSubmit}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          width: '100%',
        }}
      >
        {/* Title row */}
        <Box sx={{ mb: 0.5 }}>
          <Box
            sx={{
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: 'text.primary',
            }}
          >
            Stowage and Yard Planning
          </Box>
        </Box>

        {/* Inputs row */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', lg: 'row' },
            flexWrap: 'wrap',
            gap: 1.5,
            alignItems: { xs: 'stretch', lg: 'center' },
            width: '100%',
          }}
        >
          {/* Vessel ID search */}
          <TextField
            size="small"
            placeholder="Search Vessel ID (e.g. VS-PEB-07)"
            value={vesselId}
            onChange={(e) => setVesselId(e.target.value.toUpperCase())}
            disabled={loading}
            variant="outlined"
            sx={{
              flex: { xs: '1 1 100%', sm: '1 1 200px', lg: 2 },
              minWidth: 180,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: 'background.paper',
                height: 36,
                fontSize: '0.8rem',
                '& fieldset': { borderColor: alpha(theme.palette.divider, 0.8) },
                '&:hover fieldset': { borderColor: theme.palette.primary.main },
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary', ml: 0.5, fontSize: 20 }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {/* Yard ID input */}
          <TextField
            placeholder="Yard ID (Opt)"
            size="small"
            value={yardId}
            onChange={(e) => setYardId(e.target.value.toUpperCase())}
            disabled={loading}
            sx={{
              flex: { xs: '1 1 48%', sm: '1 1 120px', lg: 0.8 },
              minWidth: 100,
              '& .MuiOutlinedInput-root': { borderRadius: 2, height: 36, fontSize: '0.8rem' },
            }}
          />

          {/* Visit ID input */}
          {activeTab === 0 && (
            <TextField
              placeholder="Visit ID (Opt)"
              size="small"
              value={visitId}
              onChange={(e) => setVisitId(e.target.value.toUpperCase())}
              disabled={loading}
              sx={{
                flex: { xs: '1 1 48%', sm: '1 1 140px', lg: 0.8 },
                minWidth: 120,
                '& .MuiOutlinedInput-root': { borderRadius: 2, height: 36, fontSize: '0.8rem' },
              }}
            />
          )}

          {/* Upload Button */}
          {activeTab >= 1 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flex: { xs: '1 1 100%', sm: 'auto' },
              }}
            >
              <Button
                variant="outlined"
                component="label"
                startIcon={<CloudUploadIcon />}
                size="small"
                sx={{
                  borderRadius: 2,
                  height: 40,
                  px: 2,
                  textTransform: 'none',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  borderColor: globalFile ? 'success.main' : 'divider',
                  color: globalFile ? 'success.main' : 'text.primary',
                  '&:hover': {
                    borderColor: globalFile ? 'success.dark' : 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  },
                }}
              >
                {globalFile ? 'File Selected' : 'Upload List'}
                <input
                  type="file"
                  accept=".txt,.json"
                  hidden
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setGlobalFile(e.target.files[0]);
                    }
                  }}
                />
              </Button>
              {globalFile && (
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'success.main',
                    maxWidth: 100,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  title={globalFile.name}
                >
                  {globalFile.name}
                  <Button
                    size="small"
                    color="error"
                    variant="text"
                    onClick={() => setGlobalFile(null)}
                    sx={{ p: 0, minWidth: 0, ml: 0.5, fontWeight: 700, textTransform: 'none', fontSize: '0.7rem' }}
                  >
                    ×
                  </Button>
                </Typography>
              )}
            </Box>
          )}

          {/* Paste Container IDs */}
          {activeTab >= 1 && (
            <TextField
              placeholder="Or paste Container IDs..."
              size="small"
              value={globalContainerText}
              onChange={(e) => setGlobalContainerText(e.target.value)}
              sx={{
                flex: { xs: '1 1 100%', lg: 2.5 },
                minWidth: 180,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  height: 40,
                  fontSize: '0.85rem',
                  bgcolor: alpha(theme.palette.background.paper, 0.4),
                },
              }}
            />
          )}

          {/* Action Submit Button */}
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !vesselId.trim()}
            sx={{
              borderRadius: 2,
              px: 2.5,
              py: 0.75,
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.8rem',
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}`,
              flex: { xs: '1 1 100%', sm: 'auto' },
              height: 40,
              whiteSpace: 'nowrap',
            }}
          >
            {activeTab === 0 ? 'Sync Stowage' : 'Run Optimizer'}
          </Button>
        </Box>

        {/* View Switcher Toggles Row */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            mt: 0.5,
            mb: 0.5,
          }}
        >
          <ToggleButtonGroup
            value={activeTab}
            exclusive
            onChange={handleTabChange}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.divider, 0.05),
              borderRadius: 2.5,
              p: 0.3,
              border: '1px solid',
              borderColor: theme.palette.divider,
              height: 40,
              boxSizing: 'border-box',
              '& .MuiToggleButton-root': {
                borderRadius: 2,
                px: { xs: 2.5, md: 4 },
                py: 0,
                height: '100%',
                border: 'none',
                fontWeight: 700,
                textTransform: 'none',
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                },
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: 'primary.main',
                },
              },
            }}
          >
            <ToggleButton value={0}>
              <AssessmentIcon sx={{ fontSize: 16 }} />
              Historical Analysis
            </ToggleButton>
            <ToggleButton value={1}>
              <ConstructionIcon sx={{ fontSize: 16 }} />
              Planning & Ingestion
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Paper>
  );
}
