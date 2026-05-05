import { useState, useEffect } from "react";
import {
  Box, Typography, TextField, Button, LinearProgress,
  Skeleton, useTheme, Tooltip,
} from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { api } from "../api/api";

interface RetrainingConfig {
  retrain_threshold: number;
  scheduled_hour: number;
  scheduled_minute: number;
  history_record_count: number;
  last_trained_record_count: number;
  new_records_since_training: number;
  last_trained_timestamp: string | null;
}

export default function ConfigPanel() {
  const theme = useTheme();

  const [cfg, setCfg] = useState<RetrainingConfig | null>(null);
  const [threshold, setThreshold] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<RetrainingConfig>("/config/retraining");
      setCfg(res.data);
      setThreshold(String(res.data.retrain_threshold));
    } catch {
      // silently ignore — server may not yet have responded
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const val = parseInt(threshold, 10);
    if (isNaN(val) || val < 1) return;
    setSaving(true);
    try {
      const res = await api.patch<{ config: RetrainingConfig }>("/config/retraining", {
        retrain_threshold: val,
      });
      setCfg((prev) => prev ? { ...prev, retrain_threshold: res.data.config.retrain_threshold } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // could add an error toast here
    } finally {
      setSaving(false);
    }
  };

  const isDirty = cfg ? parseInt(threshold, 10) !== cfg.retrain_threshold : false;

  const scheduledLabel = cfg
    ? `${String(cfg.scheduled_hour).padStart(2, "0")}:${String(cfg.scheduled_minute).padStart(2, "0")} (server time)`
    : "—";

  const progress = cfg && cfg.retrain_threshold > 0
    ? Math.min(100, Math.round((cfg.new_records_since_training / cfg.retrain_threshold) * 100))
    : 0;

  return (
    <Box
      sx={{
        p: 3,
        bgcolor: theme.palette.mode === "dark"
          ? "rgba(96,165,250,0.05)"
          : "rgba(29,78,216,0.04)",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
      }}
    >
      <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 3 }}>
        Retraining Trigger Configuration
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

        {/* ── Threshold ───────────────────────────────────────── */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
              Auto-Retrain Threshold
            </Typography>
            <Tooltip
              title="When the number of new records added since the last training reaches this value, retraining triggers automatically on the next upload."
              placement="top"
              arrow
            >
              <InfoOutlined sx={{ fontSize: 15, color: "text.disabled", cursor: "default" }} />
            </Tooltip>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <TextField
              type="number"
              size="small"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              slotProps={{ input: { inputProps: { min: 1, step: 100 } } }}
              sx={{ width: 160 }}
              disabled={saving}
            />
            <Button
              variant={saved ? "text" : "outlined"}
              size="small"
              disabled={!isDirty || saving}
              onClick={handleSave}
              sx={{ minWidth: 80, color: saved ? "success.main" : undefined }}
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Apply"}
            </Button>
          </Box>

          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.75 }}>
            Default: 1,000 records. Takes effect immediately — no server restart needed.
          </Typography>
        </Box>

        {/* ── Live progress bar ────────────────────────────────── */}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
              New Records Since Last Training
            </Typography>
            {cfg ? (
              <Typography variant="body2" sx={{
                fontFamily: "monospace",
                color: theme.palette.mode === "dark" ? "#60a5fa" : "#1d4ed8",
                fontWeight: 600,
              }}>
                {cfg.new_records_since_training.toLocaleString()} / {cfg.retrain_threshold.toLocaleString()}
              </Typography>
            ) : (
              <Skeleton width={80} height={20} />
            )}
          </Box>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: theme.palette.mode === "dark" ? "rgba(96,165,250,0.12)" : "rgba(29,78,216,0.10)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 3,
                bgcolor: progress >= 100
                  ? "success.main"
                  : theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
              },
            }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
            {progress}% of threshold reached
            {progress >= 100 ? " — retraining will trigger on next upload" : ""}
          </Typography>
        </Box>

        {/* ── Stats row ────────────────────────────────────────── */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
          {[
            {
              label: "Total History Records",
              value: cfg ? cfg.history_record_count.toLocaleString() : null,
            },
            {
              label: "Records at Last Training",
              value: cfg ? cfg.last_trained_record_count.toLocaleString() : null,
            },
            {
              label: "Nightly Schedule",
              value: scheduledLabel,
              tooltip: "The nightly scheduled retraining runs at this time every day (server local time). Changing the hour requires a server restart.",
            },
          ].map(({ label, value, tooltip }) => (
            <Box key={label}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  {label}
                </Typography>
                {tooltip && (
                  <Tooltip title={tooltip} placement="top" arrow>
                    <InfoOutlined sx={{ fontSize: 12, color: "text.disabled", cursor: "default" }} />
                  </Tooltip>
                )}
              </Box>
              {value !== null ? (
                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary", fontFamily: "monospace" }}>
                  {value}
                </Typography>
              ) : (
                <Skeleton width={60} height={20} />
              )}
            </Box>
          ))}
        </Box>

        {/* ── Last trained ─────────────────────────────────────── */}
        {cfg?.last_trained_timestamp && (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            Last training completed:{" "}
            <strong>
              {new Date(cfg.last_trained_timestamp).toLocaleString()}
            </strong>
          </Typography>
        )}

      </Box>
    </Box>
  );
}
