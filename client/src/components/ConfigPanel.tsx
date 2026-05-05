import { Box, Typography, Slider, TextField, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

export interface TrainingConfig {
  min_hours: number;
  max_hours: number;
  min_visit_rows: number;
}

interface Props {
  config: TrainingConfig;
  onChange: (c: TrainingConfig) => void;
  disabled?: boolean;
}

const DEFAULTS: TrainingConfig = {
  min_hours: 2,
  max_hours: 240,
  min_visit_rows: 5,
};

export default function ConfigPanel({ config, onChange, disabled = false }: Props) {
  const theme = useTheme();

  const set = <K extends keyof TrainingConfig>(key: K, value: TrainingConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <Box
      sx={{
        p: 3,
        bgcolor: theme.palette.mode === "dark"
          ? alpha(theme.palette.primary.main, 0.04)
          : alpha(theme.palette.primary.main, 0.03),
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
      }}
    >
      <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 3 }}>
        Training Parameters
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3.5 }}>

        {/* Min stay hours */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.25 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
              Minimum Stay (hours)
            </Typography>
            <Typography variant="body2" sx={{ color: "primary.main", fontWeight: 600, fontFamily: "monospace" }}>
              {config.min_hours}h
            </Typography>
          </Box>
          <Slider
            value={config.min_hours}
            min={0}
            max={24}
            step={1}
            disabled={disabled}
            onChange={(_, v) => set("min_hours", v as number)}
            size="small"
            sx={{ color: "primary.main" }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            Visits shorter than this are excluded as noise (default: {DEFAULTS.min_hours}h)
          </Typography>
        </Box>

        {/* Max stay hours */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.25 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
              Maximum Stay (hours)
            </Typography>
            <Typography variant="body2" sx={{ color: "primary.main", fontWeight: 600, fontFamily: "monospace" }}>
              {config.max_hours}h
            </Typography>
          </Box>
          <Slider
            value={config.max_hours}
            min={24}
            max={720}
            step={24}
            disabled={disabled}
            onChange={(_, v) => set("max_hours", v as number)}
            size="small"
            sx={{ color: "primary.main" }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            Visits longer than this are excluded as outliers (default: {DEFAULTS.max_hours}h)
          </Typography>
        </Box>

        {/* Min visit rows */}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary", mb: 1 }}>
            Minimum Container Records per Visit
          </Typography>
          <TextField
            type="number"
            size="small"
            value={config.min_visit_rows}
            disabled={disabled}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1) set("min_visit_rows", v);
            }}
            slotProps={{ input: { inputProps: { min: 1, max: 100 } } }}
            sx={{ width: 140 }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.75 }}>
            Visits with fewer container records are skipped (default: {DEFAULTS.min_visit_rows})
          </Typography>
        </Box>

      </Box>
    </Box>
  );
}
