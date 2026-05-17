import { Box, TextField, Button, alpha, useTheme, InputAdornment, Typography, MenuItem } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface CraneFilterFormProps {
  craneId: string;
  onCraneChange: (val: string) => void;
  availableCranes: string[];
  days: string;
  onDaysChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  loading: boolean;
}

export default function CraneFilterForm({
  craneId,
  onCraneChange,
  availableCranes = ['STS01', 'STS02', 'STS03', 'STS04', 'STS05', 'STS06'],
  days,
  onDaysChange,
  onSubmit,
  onClear,
  loading,
}: CraneFilterFormProps) {
  const theme = useTheme();

  return (
    <Box
      component="form"
      onSubmit={onSubmit}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
        width: '100%',
      }}
    >
      <Box sx={{
        fontSize: '25px',
        fontWeight: 'bold'
      }}>
        Crane Performance Analysis
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          gap: 2,
          alignItems: { xs: 'stretch', lg: 'center' },
          width: '100%',
        }}
      >
        <TextField
          select
          fullWidth
          value={craneId}
          onChange={(e) => onCraneChange(e.target.value)}
          disabled={loading}
          variant="outlined"
          sx={{
            flex: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: 'background.paper',
              '& fieldset': {
                borderColor: alpha(theme.palette.divider, 0.8),
              },
              '&:hover fieldset': {
                borderColor: theme.palette.primary.main,
              },
            },
          }}
          slotProps={{
            select: {
              displayEmpty: true,
              renderValue: (selected: any) => {
                if (!selected) {
                  return <Box sx={{ color: 'text.secondary' }}>Select Asset / Crane (e.g. STS01)</Box>;
                }
                return selected;
              }
            },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', ml: 1, mr: 1 }} />
                </InputAdornment>
              ),
            },
          }}
        >
          <MenuItem value="">
            <em>Global Fleet / All Cranes</em>
          </MenuItem>
          {availableCranes.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          placeholder="Analysis Window"
          type="number"
          value={days}
          onChange={(e) => onDaysChange(e.target.value)}
          disabled={loading}
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 140 },
            '& .MuiOutlinedInput-root': { borderRadius: 3 },
          }}
        />

        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            minWidth: { xs: '100%', lg: 280 },
            height: 56,
          }}
        >
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              flex: 1,
              borderRadius: 3,
              fontWeight: 700,
              textTransform: 'none',
              boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}`,
              whiteSpace: 'nowrap',
              height: '100%',
            }}
          >
            {loading ? 'Analyzing...' : 'Run Analysis'}
          </Button>

          <Button
            variant="outlined"
            color="inherit"
            onClick={onClear}
            disabled={loading}
            sx={{
              borderRadius: 3,
              fontWeight: 700,
              textTransform: 'none',
              borderColor: alpha(theme.palette.divider, 0.4),
              px: 3,
              whiteSpace: 'nowrap',
              height: '100%',
            }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', px: 1 }}>
        Select a specific Crane ID above or choose "Global Fleet / All Cranes" to analyze asset-level or system-wide performance.
      </Typography>
    </Box>
  );
}
