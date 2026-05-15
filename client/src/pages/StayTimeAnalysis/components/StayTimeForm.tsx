import { Box, TextField, Button, alpha, useTheme, InputAdornment, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export default function StayTimeForm({
  value,
  onChange,
  loaded,
  onLoadedChange,
  discharged,
  onDischargedChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (val: string) => void;
  loaded: string;
  onLoadedChange: (val: string) => void;
  discharged: string;
  onDischargedChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
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
        Stay Time Analysis
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
          fullWidth
          placeholder="Search Vessel Service (e.g. VS-PEB-07)"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
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
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', ml: 1 }} />
                </InputAdornment>
              ),
            },
          }}
        />

        <TextField
          placeholder="Load Moves"
          type="number"
          value={loaded}
          onChange={(e) => onLoadedChange(e.target.value)}
          disabled={loading}
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 140 },
            '& .MuiOutlinedInput-root': { borderRadius: 3 },
          }}
        />

        <TextField
          placeholder="Discharge"
          type="number"
          value={discharged}
          onChange={(e) => onDischargedChange(e.target.value)}
          disabled={loading}
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 140 },
            '& .MuiOutlinedInput-root': { borderRadius: 3 },
          }}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={loading || !value.trim()}
          sx={{
            borderRadius: 3,
            px: 4,
            py: 1.5,
            fontWeight: 700,
            textTransform: 'none',
            boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}`,
            minWidth: { xs: '100%', lg: 160 },
            height: 56,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </Button>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', px: 1 }}>
        Leave Load/Discharge empty to use the service prediction, or enter values for a what-if estimate.
      </Typography>
    </Box>
  );
}