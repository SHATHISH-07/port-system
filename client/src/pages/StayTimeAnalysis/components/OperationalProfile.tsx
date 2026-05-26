// src/pages/components/OperationalProfile.tsx
import {
  Card,
  Box,
  Typography,
  Grid,
  Chip,
  Stack,
  useTheme,
  alpha,
  Divider,
} from '@mui/material';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers & Reusable UI
// ─────────────────────────────────────────────────────────────────────────────

function formatNumber(value?: number | null, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

function MetricTile({ label, value, accent = 'default' }: { label: string; value: string | number; accent?: string }) {
  const colorMap: Record<string, string> = {
    primary: 'primary.main', success: 'success.main',
    warning: 'warning.main', error: 'error.main', info: 'info.main',
  };

  return (
    <Box sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.1, fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 800, lineHeight: 1.25, fontSize: '0.8rem', color: colorMap[accent] || 'text.primary' }}>
        {value}
      </Typography>
    </Box>
  );
}

function SectionWrapper({ title, children, isAltColor = false }: { title: string; children: React.ReactNode; isAltColor?: boolean }) {
  const theme = useTheme();
  const bg = theme.palette.mode === 'light'
    ? alpha(isAltColor ? theme.palette.info.main : theme.palette.primary.main, 0.02)
    : alpha(theme.palette.background.default, 0.35);

  return (
    <Box sx={{ p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: bg, height: '100%' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', fontSize: '0.68rem' }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panels
// ─────────────────────────────────────────────────────────────────────────────

interface OpData {
  total_operations?: number;
  effective_mph_used?: number;
  load_discharge_ratio?: number;
}

interface TopVisitData {
  stay_hours?: number;
  predicted_stay_hours?: number;
  loaded?: number;
  discharged?: number;
  hazardous?: number;
  reefer?: number;
  oog?: number;
  total_units?: number;
}

interface DelayData {
  impact?: string;
  factor?: string;
  reason?: string;
}

interface ProfileData {
  operational_predictions?: { operational_rules_applied?: string[] } & OpData;
  top_visit_stats?: TopVisitData;
  delay_analysis?: DelayData[];
  actual?: { avg_hours?: number };
  predicted?: { avg_hours?: number; visits?: number };
}

function ExecutionPanel({ op, rules }: { op: OpData; rules: string[] }) {
  const theme = useTheme();
  const totalOps = op?.total_operations ?? '-';
  const effectiveMph = op?.effective_mph_used ?? null;
  const ratio = op?.load_discharge_ratio ?? null;
  const formattedRatio = ratio === null ? '-' : formatNumber(Number(ratio), 3);

  return (
    <SectionWrapper title="Execution Summary">
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1, p: 1, borderRadius: 2, border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.12), bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
        <Chip label={`Total Ops: ${totalOps}`} color="primary" size="small" sx={{ fontWeight: 800, fontSize: '0.7rem', height: '22px' }} />
        <Chip label={`Effective MPH: ${formatNumber(Number(effectiveMph))}`} color="success" size="small" sx={{ fontWeight: 800, fontSize: '0.7rem', height: '22px' }} />
        <Chip label={`L/D Ratio: ${formattedRatio}`} color="warning" size="small" sx={{ fontWeight: 800, fontSize: '0.7rem', height: '22px' }} />
      </Stack>

      <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary', lineHeight: 1.4 }}>
        This panel uses only the values actually returned by the backend, so the UI stays aligned with the current response shape.
      </Typography>

      <Grid container spacing={1} sx={{ mt: 0.5, mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}><MetricTile label="Load / Discharge Ratio" value={formattedRatio} accent="success" /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><MetricTile label="Effective MPH Used" value={`${formatNumber(Number(effectiveMph))} MPH`} accent="primary" /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><MetricTile label="Total Operations" value={totalOps} accent="info" /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><MetricTile label="Rules Applied" value={rules.length} accent="warning" /></Grid>
      </Grid>

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', mb: 0.75, fontSize: '0.68rem' }}>
        Operational Rules
      </Typography>
      <Stack spacing={0.75}>
        {rules.length > 0 ? rules.map((rule, i) => (
          <Box key={i} sx={{ p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.4, fontSize: '0.8rem' }}>{rule}</Typography>
          </Box>
        )) : (
          <Typography variant="caption" color="text.secondary">No operational rules were returned.</Typography>
        )}
      </Stack>
    </SectionWrapper>
  );
}

function TopVisitPanel({ topVisit, actualAvg, predictedAvg, predictedVisits, delays }: { topVisit: TopVisitData; actualAvg: number | null; predictedAvg: number | null; predictedVisits: number | string | null; delays: DelayData[] }) {
  return (
    <SectionWrapper title="Top Visit Snapshot" isAltColor>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1, mb: 1.5 }}>
        <Chip label={`Visit Stay: ${formatNumber(topVisit.stay_hours)}h`} size="small" variant="outlined" sx={{ fontWeight: 800, fontSize: '0.7rem', height: '22px' }} />
        <Chip label={`Predicted Stay: ${formatNumber(topVisit.predicted_stay_hours)}h`} size="small" variant="outlined" sx={{ fontWeight: 800, fontSize: '0.7rem', height: '22px' }} />
        <Chip label={`Predicted Visits: ${predictedVisits ?? '-'}`} size="small" variant="outlined" sx={{ fontWeight: 800, fontSize: '0.7rem', height: '22px' }} />
      </Stack>

      <Grid container spacing={1}>
        <Grid size={{ xs: 6 }}><MetricTile label="Loaded" value={topVisit.loaded ?? '-'} /></Grid>
        <Grid size={{ xs: 6 }}><MetricTile label="Discharged" value={topVisit.discharged ?? '-'} /></Grid>
        <Grid size={{ xs: 6 }}><MetricTile label="Hazardous" value={topVisit.hazardous ?? '-'} accent="error" /></Grid>
        <Grid size={{ xs: 6 }}><MetricTile label="Reefer" value={topVisit.reefer ?? '-'} accent="info" /></Grid>
        <Grid size={{ xs: 6 }}><MetricTile label="OOG" value={topVisit.oog ?? '-'} accent="warning" /></Grid>
        <Grid size={{ xs: 6 }}><MetricTile label="Actual Avg Stay" value={`${formatNumber(actualAvg)}h`} accent="success" /></Grid>
        <Grid size={{ xs: 6 }}><MetricTile label="Predicted Avg Stay" value={`${formatNumber(predictedAvg)}h`} accent="warning" /></Grid>
      </Grid>

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', mb: 0.75, fontSize: '0.68rem' }}>
        Delay Analysis
      </Typography>
      <Stack spacing={0.75}>
        {delays.length > 0 ? delays.map((delay, i) => (
          <Box key={i} sx={{ p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ width: 6, height: 6, mt: 0.5, borderRadius: '50%', bgcolor: delay.impact === 'High' ? 'error.main' : 'warning.main', flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.25, fontSize: '0.8rem' }}>{delay.factor}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4, fontSize: '0.7rem' }}>{delay.reason}</Typography>
            </Box>
          </Box>
        )) : (
          <Typography variant="caption" color="text.secondary">No delay analysis was returned.</Typography>
        )}
      </Stack>
    </SectionWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OperationalProfile({ data }: { data: ProfileData }) {
  const theme = useTheme();

  // Safely extract data
  const op = data?.operational_predictions || {};
  const topVisit = data?.top_visit_stats || {};
  const delays = Array.isArray(data?.delay_analysis) ? data.delay_analysis : [];
  const rules = Array.isArray(op?.operational_rules_applied) ? op.operational_rules_applied : [];
  const actualAvg = data?.actual?.avg_hours ?? null;
  const predictedAvg = data?.predicted?.avg_hours ?? null;
  const predictedVisits = data?.predicted?.visits ?? null;

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper', width: '100%', overflow: 'hidden', borderColor: alpha(theme.palette.divider, 0.9), boxShadow: '0 4px 16px rgba(0,0,0,0.02)' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>Operational Profile</Typography>
        <Typography variant="caption" color="text.secondary">Clean summary of the latest vessel analysis response</Typography>
      </Box>

      <Box sx={{ p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 7 }}>
            <ExecutionPanel op={op} rules={rules} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TopVisitPanel topVisit={topVisit} actualAvg={actualAvg} predictedAvg={predictedAvg} predictedVisits={predictedVisits} delays={delays} />
          </Grid>
        </Grid>
      </Box>
    </Card>
  );
}