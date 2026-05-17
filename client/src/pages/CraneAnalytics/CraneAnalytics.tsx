import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Alert,
  alpha,
  useTheme,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

import { api } from '../../api/api';
import CraneFilterForm from './components/CraneFilterForm';
import GlobalKPIs from './components/GlobalKPIs';
import AssetDeepDive from './components/AssetDeepDive';
import TerminalEfficiency from './components/TerminalEfficiency';
import CraneDataTable from './components/CraneDataTable';
import type { ExtendedCraneResponse } from '../../../types/crane';

const ROWS_PER_PAGE = 10;

export default function CraneAnalytics() {
  const theme = useTheme();
  const [data, setData] = useState<ExtendedCraneResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [craneId, setCraneId] = useState<string>("");
  const [days, setDays] = useState<string>("30");
  const [availableCranes, setAvailableCranes] = useState<string[]>(['STS01', 'STS02', 'STS03', 'STS04', 'STS05', 'STS06']);
  const [page, setPage] = useState(0);

  const fetchData = useCallback(
    (id?: string, windowDays?: string) => {
      setLoading(true);
      setError(null);
      setPage(0);
      
      const params: Record<string, string> = { limit: "1000" };
      if (id && id.trim()) params.craneId = id.trim();
      if (windowDays) params.days = windowDays;

      api
        .get<ExtendedCraneResponse>("/crane/crane-performance", { params })
        .then((r) => {
          if (r.data?.error) {
            setError(r.data.error);
            setData(null);
          } else {
            setData(r.data);
            if (r.data?.available_cranes) {
              setAvailableCranes(r.data.available_cranes);
            }
          }
        })
        .catch((err) => {
          setError(
            err?.response?.data?.message || 
            err?.message || 
            "Operational data unreachable. Verify terminal connectivity."
          );
          setData(null);
        })
        .finally(() => setLoading(false));
    },
    []
  );

  const handleAnalyze = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchData(craneId, days);
  };

  const handleClear = () => {
    setCraneId("");
    setDays("30");
    setData(null);
    setError(null);
  };

  const isLoaded = !!data && !loading;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top Header Control Bar */}
      <Box
        sx={{
          px: { xs: 3, md: 6 },
          py: 4,
          bgcolor: "transparent",
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <CraneFilterForm
          craneId={craneId}
          onCraneChange={setCraneId}
          availableCranes={availableCranes}
          days={days}
          onDaysChange={setDays}
          onSubmit={handleAnalyze}
          loading={loading}
          onClear={handleClear}
        />
      </Box>

      {error && (
        <Box sx={{ px: { xs: 3, md: 6 }, mt: 2 }}>
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setError(null)}
            sx={{
              borderRadius: 3,
              bgcolor: theme.palette.error.main,
              boxShadow: `0 8px 24px ${alpha(theme.palette.error.main, 0.2)}`,
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
          scrollBehavior: 'smooth',
        }}
      >
        <Box sx={{ p: { xs: 2, sm: 3, md: 6 }, flex: 1 }}>
          
          {/* Ready for Analysis State */}
          {!isLoaded && !loading && (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                opacity: 0.8,
                py: 10,
              }}
            >
              <Box
                sx={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.primary.main, 0.05),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                }}
              >
                <SearchIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                Ready for Analysis
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400 }}>
                Enter a Crane ID or leave it empty to query global fleet statistics.
              </Typography>
            </Box>
          )}

          {/* Loading State */}
          {loading && (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 10,
              }}
            >
              <CircularProgress
                size={56}
                thickness={5}
                sx={{
                  mb: 3,
                  color: theme.palette.primary.main,
                  '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
                }}
              />
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                Synthesizing Data
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Calculating moves, productivity ratings, and cycle times...
              </Typography>
            </Box>
          )}

          {/* Loaded Stats Content */}
          {isLoaded && data && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                animation: 'fadeIn 0.6s ease-out forwards',
                '@keyframes fadeIn': {
                  from: { opacity: 0, transform: 'translateY(20px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              {/* Hero Header */}
              <Box>
                <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.15em' }}>
                  Operational Telemetry
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 0.5 }}>
                  <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {data.selected_crane ? data.selected_crane : "Global Fleet"}
                  </Typography>
                  <Typography variant="h5" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                    Performance Dashboard
                  </Typography>
                </Box>
              </Box>

              {/* Global KPIs — only when no crane selected */}
              {!data.selected_crane && <GlobalKPIs data={data} />}

              {/* Asset deep dive — only when crane selected */}
              {data.selected_crane && <AssetDeepDive craneId={data.selected_crane} data={data} />}

              {/* Terminal Efficiency grid — only when global view */}
              {!data.selected_crane && data.yard_stats && data.yard_stats.length > 0 && (
                <TerminalEfficiency yardStats={data.yard_stats} />
              )}

              {/* Data table — always shown */}
              <CraneDataTable
                craneId={data.selected_crane || ""}
                data={data}
                page={page}
                rowsPerPage={ROWS_PER_PAGE}
                onPageChange={setPage}
                onCraneSelect={(id) => {
                  setCraneId(id);
                  fetchData(id, days);
                }}
              />
            </Box>
          )}

        </Box>
      </Box>
    </Box>
  );
}
