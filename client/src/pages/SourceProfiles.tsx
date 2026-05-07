import { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Alert, TextField, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Skeleton, Divider, Select, MenuItem,
} from '@mui/material';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ProfileFormState {
  name: string;
  description: string;
  dataset_type: string;
  alias_map: string;
  datetime_formats: string;
  detection_rules: string;
}

interface SourceProfile {
  id: number;
  name: string;
  description: string | null;
  dataset_type: string | null;
  alias_map: Record<string, string>;
  datetime_formats: string[];
  detection_rules: Record<string, unknown>;
  terminal_name: string | null;
  updated_at: string | null;
}

const EMPTY_FORM: ProfileFormState = {
  name: '',
  description: '',
  dataset_type: '',
  alias_map: '{}',
  datetime_formats: '[]',
  detection_rules: '{}',
};

/** JsonField must be declared OUTSIDE the component to avoid "component created during render" errors. */
interface JsonFieldProps {
  label: string;
  field: keyof ProfileFormState;
  form: ProfileFormState;
  jsonErrors: Record<string, string>;
  onChange: (field: keyof ProfileFormState, value: string) => void;
}

function JsonField({ label, field, form, jsonErrors, onChange }: JsonFieldProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <TextField
        fullWidth
        multiline
        minRows={3}
        value={form[field]}
        onChange={e => onChange(field, e.target.value)}
        error={!!jsonErrors[field]}
        helperText={jsonErrors[field] || 'Valid JSON'}
        inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
        size="small"
        sx={{ mt: 0.5 }}
      />
    </Box>
  );
}

export default function SourceProfiles() {
  const [profiles, setProfiles] = useState<SourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const load = () => {
    setLoading(true);
    axios
      .get<{ source_profiles: SourceProfile[] }>(`${API_BASE}/source-profiles/`, { headers })
      .then(r => setProfiles(r.data.source_profiles || []))
      .catch(() => setError('Failed to load source profiles'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const validateJson = (key: keyof ProfileFormState, value: string) => {
    try {
      JSON.parse(value);
      setJsonErrors(p => ({ ...p, [key]: '' }));
    } catch {
      setJsonErrors(p => ({ ...p, [key]: 'Invalid JSON' }));
    }
  };

  const handleFieldChange = (field: keyof ProfileFormState, value: string) => {
    setForm(p => ({ ...p, [field]: value }));
    if (['alias_map', 'datetime_formats', 'detection_rules'].includes(field)) {
      validateJson(field, value);
    }
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setJsonErrors({});
    setEditId(null);
    setDialogOpen(true);
  };

  const openEdit = (profile: SourceProfile) => {
    setForm({
      name:             profile.name,
      description:      profile.description || '',
      dataset_type:     profile.dataset_type || '',
      alias_map:        JSON.stringify(profile.alias_map || {}, null, 2),
      datetime_formats: JSON.stringify(profile.datetime_formats || [], null, 2),
      detection_rules:  JSON.stringify(profile.detection_rules || {}, null, 2),
    });
    setJsonErrors({});
    setEditId(profile.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (Object.values(jsonErrors).some(Boolean)) {
      setError('Fix JSON errors before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name:             form.name,
        description:      form.description,
        dataset_type:     form.dataset_type || null,
        alias_map:        JSON.parse(form.alias_map) as Record<string, string>,
        datetime_formats: JSON.parse(form.datetime_formats) as string[],
        detection_rules:  JSON.parse(form.detection_rules) as Record<string, unknown>,
      };
      if (editId) {
        await axios.put(`${API_BASE}/source-profiles/${editId}`, payload, { headers });
        setSuccess('Source profile updated.');
      } else {
        await axios.post(`${API_BASE}/source-profiles/`, payload, { headers });
        setSuccess('Source profile created.');
      }
      setDialogOpen(false);
      load();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail : null;
      setError(msg || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Deactivate this source profile?')) return;
    try {
      await axios.delete(`${API_BASE}/source-profiles/${id}`, { headers });
      setSuccess('Source profile deactivated.');
      load();
    } catch {
      setError('Failed to deactivate.');
    }
  };

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box
        sx={{
          mb: 4,
          pb: 3,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ mb: 0.5, color: 'text.primary' }}>
            Source Profiles
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 460 }}>
            Configure per-source schema aliases, datetime formats, and detection rules.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={openCreate}
          sx={{ height: 36, mt: 0.5 }}
        >
          New Profile
        </Button>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* ── Data Table ── */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Dataset Type</TableCell>
              <TableCell>Aliases</TableCell>
              <TableCell>Terminal</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              : profiles.length === 0
              ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                      <Typography variant="body2" color="text.secondary">
                        No source profiles yet.
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        Create one to configure schema mapping behaviour for a data source.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
              : profiles.map(p => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                        {p.description && (
                          <Typography variant="caption" color="text.disabled">
                            {p.description}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {p.dataset_type
                        ? <Chip label={p.dataset_type} size="small" variant="outlined" />
                        : <Typography color="text.disabled" variant="caption">auto-detect</Typography>
                      }
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace">
                        {Object.keys(p.alias_map || {}).length} aliases
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {p.terminal_name || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => openEdit(p)} sx={{ mr: 0.5 }}>
                        Edit
                      </Button>
                      <Button size="small" color="error" onClick={() => handleDelete(p.id)}>
                        Deactivate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
            }
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {editId ? 'Edit Source Profile' : 'New Source Profile'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="Profile Name"
              fullWidth
              required
              size="small"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
            <TextField
              label="Description"
              fullWidth
              size="small"
              multiline
              rows={2}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">Dataset Type (optional)</Typography>
              <Select
                fullWidth
                size="small"
                value={form.dataset_type}
                displayEmpty
                onChange={e => setForm(p => ({ ...p, dataset_type: e.target.value }))}
                sx={{ mt: 0.5 }}
              >
                <MenuItem value=""><em>Auto-detect</em></MenuItem>
                <MenuItem value="container_inventory">Container Inventory</MenuItem>
                <MenuItem value="crane_moves">Crane Moves</MenuItem>
              </Select>
            </Box>

            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Alias Map</Typography>
              <Typography variant="caption" color="text.secondary">
                Map source field names to canonical names.{' '}
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {`{"Unit Nbr": "canonical_unit_id"}`}
                </span>
              </Typography>
            </Box>
            <JsonField
              label='alias_map (JSON object)'
              field="alias_map"
              form={form}
              jsonErrors={jsonErrors}
              onChange={handleFieldChange}
            />
            <JsonField
              label="datetime_formats (JSON array of format strings)"
              field="datetime_formats"
              form={form}
              jsonErrors={jsonErrors}
              onChange={handleFieldChange}
            />
            <JsonField
              label="detection_rules (JSON object)"
              field="detection_rules"
              form={form}
              jsonErrors={jsonErrors}
              onChange={handleFieldChange}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
