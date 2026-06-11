import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  InputAdornment,
  Typography,
  MenuItem,
  Chip,
  Paper,
  Divider,
  Collapse
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../../../api/api';

export default function StayTimeForm({
  value,
  onChange,
  loaded,
  onLoadedChange,
  discharged,
  onDischargedChange,
  craneCount,
  onCraneCountChange,
  equipmentBreakdown,
  onEquipmentBreakdownChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (val: string) => void;
  loaded: string;
  onLoadedChange: (val: string) => void;
  discharged: string;
  onDischargedChange: (val: string) => void;
  craneCount: string;
  onCraneCountChange: (val: string) => void;
  equipmentBreakdown: Record<string, number>;
  onEquipmentBreakdownChange: (val: Record<string, number>) => void;
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [selectedEqType, setSelectedEqType] = useState('');
  const [eqCount, setEqCount] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    api.get('/equipment-types')
      .then(res => setEquipmentTypes(res.data || []))
      .catch(err => console.error("Failed to load equipment types", err));
  }, []);

  const handleAddEquipment = () => {
    if (selectedEqType && eqCount) {
      onEquipmentBreakdownChange({
        ...equipmentBreakdown,
        [selectedEqType]: Number(eqCount)
      });
      setSelectedEqType('');
      setEqCount('');
    }
  };

  const handleRemoveEquipment = (type: string) => {
    const newBreakdown = { ...equipmentBreakdown };
    delete newBreakdown[type];
    onEquipmentBreakdownChange(newBreakdown);
  };

  return (
    <Paper
      elevation={0}
      component="form"
      onSubmit={onSubmit}
      sx={{
        p: 3,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          Stay Time Predictor
        </Typography>
      </Box>

      {/* Main Input Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, width: '100%' }}>
        <TextField
          size="small"
          placeholder="Search Vessel Service (e.g. AA7)"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={loading}
          variant="outlined"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
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
        <Button
          variant="outlined"
          color={advancedOpen ? "primary" : "inherit"}
          onClick={() => setAdvancedOpen(!advancedOpen)}
          sx={{ borderRadius: 2, px: 2, py: { xs: 1.5, sm: 1 }, fontSize: '0.95rem', fontWeight: 600, textTransform: 'none', borderColor: advancedOpen ? 'primary.main' : 'divider' }}
          startIcon={<TuneIcon />}
          fullWidth
        >
          Advanced Analysis
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={loading || !value.trim()}
          sx={{ borderRadius: 2, px: 2, py: { xs: 1.5, sm: 1 }, fontSize: '0.95rem', fontWeight: 700, textTransform: 'none' }}
          fullWidth
        >
          Analyze
        </Button>
      </Box>

      {/* Advanced Analysis Collapse */}
      <Collapse in={advancedOpen}>
        <Box sx={{ pt: 1 }}>
          <Divider sx={{ mb: 2.5 }} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            <TextField
              label="Load"
              type="number"
              size="small"
              value={loaded}
              onChange={(e) => onLoadedChange(e.target.value)}
              disabled={loading}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Discharge"
              type="number"
              size="small"
              value={discharged}
              onChange={(e) => onDischargedChange(e.target.value)}
              disabled={loading}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Crane Count"
              type="number"
              size="small"
              value={craneCount}
              onChange={(e) => {
                let val = e.target.value;
                if (val !== '') {
                  const num = parseInt(val, 10);
                  if (num <= 0) val = '1';
                }
                onCraneCountChange(val);
              }}
              disabled={loading}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>

          {/* Equipment Types Builder */}
          <Box sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.default' }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>Equipment Breakdown Profile</Typography>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2 }}>
              <TextField
                select
                size="small"
                label="Equipment Type"
                value={selectedEqType}
                onChange={(e) => setSelectedEqType(e.target.value)}
                sx={{ flex: 2, bgcolor: 'background.paper', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                <MenuItem value="">
                  <em>Clear Selection</em>
                </MenuItem>
                {equipmentTypes.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </TextField>
              <TextField
                type="number"
                size="small"
                label="Count"
                value={eqCount}
                onChange={(e) => setEqCount(e.target.value)}
                sx={{ flex: 1, bgcolor: 'background.paper', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Button
                variant="outlined"
                onClick={handleAddEquipment}
                disabled={!selectedEqType || !eqCount}
                startIcon={<AddIcon />}
                sx={{ borderRadius: 2, px: 3, bgcolor: 'background.paper' }}
              >
                Add
              </Button>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {Object.entries(equipmentBreakdown).map(([type, count]) => (
                <Chip
                  key={type}
                  label={`${type}: ${count}`}
                  onDelete={() => handleRemoveEquipment(type)}
                  deleteIcon={<DeleteIcon />}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 500 }}
                />
              ))}
              {Object.keys(equipmentBreakdown).length === 0 && (
                <Typography variant="body2" color="text.secondary">No explicit equipment types added. The historical vessel profile will be used.</Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}