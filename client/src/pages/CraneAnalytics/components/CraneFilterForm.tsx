import { Box, TextField, Button, alpha, useTheme, Typography, MenuItem, Select, FormControl, InputLabel } from '@mui/material';

interface CraneFilterFormProps {
  craneId: string;
  onCraneChange: (val: string) => void;
  availableCranes: string[];
  days: string;
  onDaysChange: (val: string) => void;
  onClear: () => void;
  loading: boolean;
}

export default function CraneFilterForm({
  craneId,
  onCraneChange,
  availableCranes,
  days,
  onDaysChange,
  onClear,
  loading,
}: CraneFilterFormProps) {
  const theme = useTheme();

  return (
    <Box
      component="form"
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
        <FormControl 
          variant="outlined" 
          sx={{ 
            flex: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: 'background.paper',
              height: 56,
              '& fieldset': { borderColor: alpha(theme.palette.divider, 0.8) },
              '&:hover fieldset': { borderColor: theme.palette.primary.main },
            },
          }}
        >
          <InputLabel id="crane-select-label">Select Asset / Crane ID</InputLabel>
          <Select
            labelId="crane-select-label"
            value={craneId}
            onChange={(e) => onCraneChange(e.target.value)}
            label="Select Asset / Crane ID"
            disabled={loading}
          >
            <MenuItem value=""><em>All Operational Assets</em></MenuItem>
            {availableCranes.map((cid) => (
              <MenuItem key={cid} value={cid}>{cid}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Analysis Window"
          type="number"
          value={days}
          onChange={(e) => onDaysChange(e.target.value)}
          disabled={loading}
          variant="outlined"
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 160 },
            '& .MuiOutlinedInput-root': { 
              borderRadius: 3, 
              bgcolor: 'background.paper',
              height: 56,
            },
          }}
        />

        <Box sx={{ display: 'flex', gap: 1.5, flex: 1 }}>
          <Button
            variant="contained"
            onClick={() => onCraneChange(craneId)}
            disabled={loading}
            sx={{
              flex: 1,
              borderRadius: 3,
              height: 56,
              fontWeight: 700,
              textTransform: 'none',
              boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}`,
            }}
          >
            {loading ? 'Processing...' : 'Run Analytics'}
          </Button>

          {craneId && (
            <Button
              variant="outlined"
              color="inherit"
              onClick={onClear}
              disabled={loading}
              sx={{
                borderRadius: 3,
                height: 56,
                minWidth: 56,
                borderColor: alpha(theme.palette.divider, 0.4),
                textTransform: 'none',
                fontWeight: 700
              }}
            >
              Clear
            </Button>
          )}
        </Box>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', px: 1 }}>
        Select a specific crane ID to view deep-dive asset metrics, or view global terminal benchmarks.
      </Typography>
    </Box>
  );
}
