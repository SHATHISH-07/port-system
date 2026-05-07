import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Alert, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, Chip, Divider,
  CircularProgress,
} from '@mui/material';
import { CheckCircleOutlined as CheckCircleOutlineIcon } from '@mui/icons-material';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CANONICAL_FIELDS = [
  'canonical_unit_id', 'actual_outbound_carrier_visit_id', 'outbound_service',
  'move_complete_time', 'time_in', 'time_out', 'ctr_from_position', 'ctr_to_position',
  'verified_gross_mass_kg', 'unit_weight_in_kg', 'reefer', 'hazardous_flag',
  'oog_unit', 'port_of_discharge', 'inbound_service', 'actual_inbound_carrier_visit_id',
  'canonical_crane_id', 'carrier_visit', 'move_kind', 'from_position',
  'to_position', 'time_completed', 'line_op', 'excluded',
  '__ignore__',
];

const STEPS = ['Upload File', 'Review Mappings', 'Confirm & Save'];

interface Profile {
  id: number;
  name: string;
}

interface Mapping {
  raw_field: string;
  canonical_field: string | null;
  confidence: number;
  match_method: string;
  is_unmapped: boolean;
  already_confirmed?: boolean;
}

interface DetectionResult {
  dataset_type: string;
  columns: string[];
}

function getConfidenceColor(conf: number, method: string): 'success' | 'warning' | 'error' {
  if (method === 'alias_exact' || method === 'canonical_exact') return 'success';
  if (conf >= 80) return 'success';
  if (conf >= 60) return 'warning';
  return 'error';
}

/** Step indicator — minimal monospace number dots */
function StepBar({ active }: { active: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, mb: 4 }}>
      {STEPS.map((label, i) => (
        <Box key={label} sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: i === active ? 'primary.main' : i < active ? 'success.main' : 'text.disabled',
                letterSpacing: '-1px',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: i === active ? 'text.primary' : i < active ? 'text.secondary' : 'text.disabled',
                fontWeight: i === active ? 600 : 400,
              }}
            >
              {label}
            </Typography>
          </Box>
          {i < STEPS.length - 1 && (
            <Box sx={{ width: 32, height: 1, bgcolor: 'divider', mx: 1.5 }} />
          )}
        </Box>
      ))}
    </Box>
  );
}

export default function SchemaMapping() {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios
      .get<{ source_profiles: Profile[] }>(`${API_BASE}/source-profiles/`, { headers: authHeaders })
      .then(r => setProfiles(r.data.source_profiles || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  const handleDetectAndSuggest = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (profileId) fd.append('source_profile_id', String(profileId));

      const { data } = await axios.post<{ dataset_type: string; columns: string[]; suggestions: Mapping[] }>(
        `${API_BASE}/mapping/suggest`,
        fd,
        { headers: authHeaders },
      );
      setDetection({ dataset_type: data.dataset_type, columns: data.columns });
      setMappings(data.suggestions);
      setActiveStep(1);
    } catch (err: unknown) {
      let msg = 'Failed to get suggestions.';
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = typeof err.response.data.detail === "string" 
          ? err.response.data.detail 
          : JSON.stringify(err.response.data.detail);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (rawField: string, value: string) => {
    setMappings(prev =>
      prev.map(m =>
        m.raw_field === rawField
          ? { ...m, canonical_field: value === '__ignore__' ? null : value, is_unmapped: value === '__ignore__' }
          : m,
      ),
    );
  };

  const handleConfirm = async () => {
    if (!profileId) { setError('Please select a Source Profile to save mappings to.'); return; }
    setLoading(true);
    setError(null);
    try {
      await axios.post(
        `${API_BASE}/mapping/confirm`,
        { source_profile_id: profileId, mappings },
        { headers: authHeaders },
      );
      setActiveStep(2);
    } catch (err: unknown) {
      let msg = 'Failed to save mappings.';
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        msg = typeof err.response.data.detail === "string" 
          ? err.response.data.detail 
          : JSON.stringify(err.response.data.detail);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    setFile(null);
    setDetection(null);
    setMappings([]);
    setError(null);
  };

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box sx={{ mb: 4, pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ mb: 0.5, color: 'text.primary' }}>
          Schema Mapping
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 520 }}>
          Upload any operational dataset. PortSync will auto-detect the schema and suggest
          canonical field mappings using fuzzy matching. Confirm to save a reusable template.
        </Typography>
      </Box>

      {/* ── Step Indicator ── */}
      <StepBar active={activeStep} />

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
      {loading && <LinearProgress sx={{ mb: 3 }} />}

      {/* ──────────────────────────────────────────────
          STEP 0 — Upload
      ────────────────────────────────────────────── */}
      {activeStep === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Source profile selector */}
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
              Source Profile (optional)
            </Typography>
            <Select
              size="small"
              value={profileId ?? ''}
              onChange={e => setProfileId(Number(e.target.value) || null)}
              displayEmpty
              sx={{ minWidth: 280 }}
            >
              <MenuItem value=""><em>None — auto-detect</em></MenuItem>
              {profiles.map(p => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </Box>

          <Divider />

          {/* File drop zone — minimal inline style */}
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
              Dataset File
            </Typography>
            <Box
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              sx={{
                border: '1px dashed',
                borderColor: isDragging ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                cursor: 'pointer',
                transition: 'border-color 150ms',
                bgcolor: isDragging ? 'action.hover' : 'transparent',
                '&:hover': { borderColor: 'text.disabled' },
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json"
                hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
              />
              <Box
                sx={{
                  width: 40, height: 40, borderRadius: 1.5,
                  border: '1px solid', borderColor: 'divider',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.625rem', color: 'text.disabled', fontWeight: 700 }}>
                  CSV
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {file ? (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{file.name}</Typography>
                    <Typography variant="caption" color="text.disabled">
                      {(file.size / 1024).toFixed(1)} KB — click to change
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Drop a .csv or .json file here, or click to browse
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      Supports any schema — mappings are auto-detected
                    </Typography>
                  </>
                )}
              </Box>
              {file && <Chip label="Ready" size="small" color="success" variant="outlined" />}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              disabled={!file || loading}
              onClick={handleDetectAndSuggest}
            >
              Detect Schema &amp; Suggest Mappings
            </Button>
          </Box>
        </Box>
      )}

      {/* ──────────────────────────────────────────────
          STEP 1 — Review Mappings
      ────────────────────────────────────────────── */}
      {activeStep === 1 && detection && (
        <Box>
          {/* Summary row */}
          <Box
            sx={{
              mb: 3, pb: 2.5,
              borderBottom: '1px solid', borderColor: 'divider',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2,
            }}
          >
            <Box>
              <Typography variant="body2" color="text.secondary">
                Detected dataset type:&nbsp;
                <Typography component="span" variant="body2" color="text.primary" sx={{ fontWeight: 700 }}>
                  {detection.dataset_type}
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {detection.columns.length} columns · {mappings.filter(m => !m.is_unmapped).length} auto-mapped · {mappings.filter(m => m.is_unmapped).length} unmapped
              </Typography>
            </Box>
            {!profileId && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                Select a Source Profile to save this mapping template.
              </Alert>
            )}
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Raw Field</TableCell>
                  <TableCell>Canonical Field</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell>Method</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.map(m => (
                  <TableRow key={m.raw_field} hover>
                    <TableCell>
                      <Typography variant="body2" color={m.is_unmapped ? 'text.disabled' : 'text.primary'} sx={{ fontFamily: 'monospace' }}>
                        {m.raw_field}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={m.canonical_field ?? '__ignore__'}
                        onChange={e => handleMappingChange(m.raw_field, e.target.value)}
                        sx={{ minWidth: 240, fontSize: 13 }}
                      >
                        <MenuItem value="__ignore__"><em>— Ignore / Dynamic Attribute —</em></MenuItem>
                        {CANONICAL_FIELDS.filter(f => f !== '__ignore__').map(f => (
                          <MenuItem key={f} value={f} sx={{ fontSize: 13, fontFamily: 'monospace' }}>{f}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${m.confidence}%`}
                        color={getConfidenceColor(m.confidence, m.match_method)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {m.match_method}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', gap: 1.5, mt: 3, justifyContent: 'flex-end' }}>
            <Button variant="text" onClick={() => setActiveStep(0)}>Back</Button>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={14} /> : undefined}
              disabled={loading}
              onClick={handleConfirm}
            >
              Confirm &amp; Save Template
            </Button>
          </Box>
        </Box>
      )}

      {/* ──────────────────────────────────────────────
          STEP 2 — Done
      ────────────────────────────────────────────── */}
      {activeStep === 2 && (
        <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main' }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Mapping Template Saved</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 420 }}>
              Future uploads from this source will be automatically mapped using this template.
              No code changes required.
            </Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={handleReset} sx={{ mt: 1 }}>
            Map Another File
          </Button>
        </Box>
      )}
    </Box>
  );
}
