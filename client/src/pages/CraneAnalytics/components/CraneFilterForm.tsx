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
        gap: 1.5,
        width: '100%',
      }}
    >
      <Box sx={{
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        Crane Performance Analysis
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          gap: 1.5,
          alignItems: { xs: 'stretch', lg: 'center' },
          width: '100%',
        }}
      >
        <TextField
          select
          fullWidth
          size="small"
          value={craneId}
          onChange={(e) => onCraneChange(e.target.value)}
          disabled={loading}
          variant="outlined"
          sx={{
            flex: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: 'background.paper',
              height: 40,
              fontSize: '0.85rem',
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
                  <SearchIcon sx={{ color: 'text.secondary', ml: 0.5, mr: 0.5, fontSize: 20 }} />
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
          label="Days"
          placeholder="Analysis Window"
          type="number"
          size="small"
          value={days}
          onChange={(e) => onDaysChange(e.target.value)}
          disabled={loading}
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 120 },
            '& .MuiOutlinedInput-root': { borderRadius: 2, height: 40, fontSize: '0.85rem' },
          }}
        />

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            minWidth: { xs: '100%', lg: 240 },
            height: 40,
          }}
        >
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              flex: 1,
              borderRadius: 2,
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.8rem',
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}`,
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
              borderRadius: 2,
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.8rem',
              borderColor: alpha(theme.palette.divider, 0.4),
              px: 2.5,
              whiteSpace: 'nowrap',
              height: '100%',
            }}
          >
            Clear
          </Button>
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5, fontSize: '0.7rem' }}>
        Select a specific Crane ID above or choose "Global Fleet / All Cranes" to analyze asset-level or system-wide performance.
      </Typography>
    </Box>
  );
}
