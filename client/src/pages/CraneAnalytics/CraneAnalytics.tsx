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
import type { ExtendedCraneResponse } from '../../types/crane';

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
          px: { xs: 2.5, md: 4 },
          py: 2.5,
          bgcolor: alpha(theme.palette.background.default, 0.9),
          backdropFilter: 'blur(25px)',
          position: 'sticky',
          top: 0,
          zIndex: 1100,
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
          scrollBehavior: 'smooth',
        }}
      >
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, flex: 1 }}>

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
                py: 4,
              }}
            >
              <Box
                sx={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.primary.main, 0.05),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <SearchIcon sx={{ fontSize: 36, color: 'primary.main', opacity: 0.5 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
                Ready for Analysis
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 350 }}>
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
                py: 4,
              }}
            >
              <CircularProgress
                size={40}
                thickness={4.5}
                sx={{
                  mb: 2,
                  color: theme.palette.primary.main,
                  '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
                }}
              />
              <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>
                Synthesizing Data
              </Typography>
              <Typography variant="caption" color="text.secondary">
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
                gap: 3,
                animation: 'fadeIn 0.6s ease-out forwards',
                '@keyframes fadeIn': {
                  from: { opacity: 0, transform: 'translateY(20px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              {/* Hero Header */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 0.25 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: 'text.primary' }}>
                    {data.selected_crane ? data.selected_crane : "Global Fleet"}
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
