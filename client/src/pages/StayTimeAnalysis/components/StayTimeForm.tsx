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
        gap: 1.5,
        width: '100%',
      }}
    >
      <Box sx={{
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        Stay Time Analysis
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
          fullWidth
          size="small"
          placeholder="Search Vessel Service (e.g. VS-PEB-07)"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
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
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', ml: 0.5, fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
        />

        <TextField
          placeholder="Load Moves"
          type="number"
          size="small"
          value={loaded}
          onChange={(e) => onLoadedChange(e.target.value)}
          disabled={loading}
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 120 },
            '& .MuiOutlinedInput-root': { borderRadius: 2, height: 40, fontSize: '0.85rem' },
          }}
        />

        <TextField
          placeholder="Discharge"
          type="number"
          size="small"
          value={discharged}
          onChange={(e) => onDischargedChange(e.target.value)}
          disabled={loading}
          sx={{
            flex: 0.6,
            minWidth: { xs: '100%', lg: 120 },
            '& .MuiOutlinedInput-root': { borderRadius: 2, height: 40, fontSize: '0.85rem' },
          }}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={loading || !value.trim()}
          sx={{
            borderRadius: 2,
            px: 2.5,
            py: 0.75,
            fontWeight: 700,
            textTransform: 'none',
            fontSize: '0.8rem',
            boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}`,
            minWidth: { xs: '100%', lg: 140 },
            height: 40,
            whiteSpace: 'nowrap',
          }}
        >
          Run Analysis
        </Button>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5, fontSize: '0.7rem' }}>
        Leave Load/Discharge empty to use the service prediction, or enter values for a what-if estimate.
      </Typography>
    </Box>
  );
}