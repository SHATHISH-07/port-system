import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  LinearProgress,
  Skeleton,
  useTheme,
  Tooltip,
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

  const formatNum = (value?: number | null) =>
    typeof value === "number" ? value.toLocaleString() : "—";

  const load = async () => {
    try {
      const res = await api.get<RetrainingConfig>("/config/retraining");
      setCfg(res.data);
      setThreshold(String(res.data.retrain_threshold ?? ""));
    } catch {
      // silently ignore — server may not yet have responded
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    const val = parseInt(threshold, 10);
    if (isNaN(val) || val < 1) return;

    setSaving(true);
    try {
      const res = await api.patch<{ config: RetrainingConfig }>("/config/retraining", {
        retrain_threshold: val,
      });

      setCfg((prev) =>
        prev
          ? { ...prev, retrain_threshold: res.data.config.retrain_threshold }
          : prev
      );

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
    ? `${String(cfg.scheduled_hour ?? 0).padStart(2, "0")}:${String(
      cfg.scheduled_minute ?? 0
    ).padStart(2, "0")} (server time)`
    : "—";

  const progress =
    cfg && typeof cfg.retrain_threshold === "number" && cfg.retrain_threshold > 0
      ? Math.min(
        100,
        Math.round(
          ((cfg.new_records_since_training ?? 0) / cfg.retrain_threshold) * 100
        )
      )
      : 0;

  const lastTrainedDate = cfg?.last_trained_timestamp
    ? new Date(cfg.last_trained_timestamp)
    : null;

  return (
    <Box
      sx={{
        p: 3,
        bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.015)" : "rgba(0, 0, 0, 0.005)",
        border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)"}`,
        borderRadius: 3,
      }}
    >
      <Typography 
        variant="overline" 
        sx={{ 
          color: "text.secondary", 
          display: "block", 
          mb: 3, 
          letterSpacing: "0.1em",
          fontWeight: 700 
        }}
      >
        Retraining Trigger Configuration
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
        {/* ── Threshold ───────────────────────────────────────── */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
              Auto-Retrain Threshold
            </Typography>
            <Tooltip
              title="When the number of new records added since the last training reaches this value, retraining triggers automatically on the next upload."
              placement="top"
              arrow
            >
              <InfoOutlined sx={{ fontSize: 16, color: "text.disabled", cursor: "default" }} />
            </Tooltip>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <TextField
              type="number"
              size="small"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              slotProps={{ input: { inputProps: { min: 1, step: 100 } } }}
              sx={{ 
                width: 160,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                }
              }}
              disabled={saving}
            />
            <Button
              variant={saved ? "text" : "contained"}
              disableElevation
              size="small"
              disabled={!isDirty || saving}
              onClick={handleSave}
              sx={{ 
                minWidth: 80, 
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 600,
                px: 2,
                height: 38,
                bgcolor: saved ? "success.main" : undefined,
                color: saved ? "white" : undefined,
                transition: "all 0.2s"
              }}
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
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
              New Records Since Last Training
            </Typography>
            {cfg ? (
              <Typography
                variant="body2"
                sx={{
                  fontFamily: "monospace",
                  color: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
                  fontWeight: 700,
                }}
              >
                {formatNum(cfg.new_records_since_training)} / {formatNum(cfg.retrain_threshold)}
              </Typography>
            ) : (
              <Skeleton width={80} height={20} />
            )}
          </Box>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor:
                theme.palette.mode === "dark"
                  ? "rgba(255, 255, 255, 0.05)"
                  : "rgba(0, 0, 0, 0.04)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 4,
                background: progress >= 100
                  ? "linear-gradient(90deg, #10b981 0%, #059669 100%)"
                  : theme.palette.mode === "dark"
                    ? "linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%)"
                    : "linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)",
              },
            }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.75 }}>
            {progress}% of threshold reached
            {progress >= 100 ? " — retraining will trigger on next upload" : ""}
          </Typography>
        </Box>

        {/* ── Stats row ────────────────────────────────────────── */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2.5 }}>
          {[
            {
              label: "Total History Records",
              value: formatNum(cfg?.history_record_count),
            },
            {
              label: "Records at Last Training",
              value: formatNum(cfg?.last_trained_record_count),
            },
            {
              label: "Nightly Schedule",
              value: scheduledLabel,
              tooltip:
                "The nightly scheduled retraining runs at this time every day (server local time). Changing the hour requires a server restart.",
            },
          ].map(({ label, value, tooltip }) => (
            <Box 
              key={label}
              sx={{
                p: 2.5,
                borderRadius: 3,
                bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.015)",
                border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)"}`,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  transform: "translateY(-3px)",
                  bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.025)",
                  boxShadow: theme.palette.mode === "dark"
                    ? "0 4px 20px rgba(0, 0, 0, 0.15)"
                    : "0 4px 20px rgba(0, 0, 0, 0.02)",
                  borderColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
                }
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 600 }}>
                  {label}
                </Typography>
                {tooltip && (
                  <Tooltip title={tooltip} placement="top" arrow>
                    <InfoOutlined sx={{ fontSize: 13, color: "text.disabled", cursor: "default" }} />
                  </Tooltip>
                )}
              </Box>
              {value !== null ? (
                <Typography
                  variant="body1"
                  sx={{ fontWeight: 700, color: "text.primary", fontFamily: "monospace", fontSize: "1.1rem" }}
                >
                  {value}
                </Typography>
              ) : (
                <Skeleton width={60} height={24} />
              )}
            </Box>
          ))}
        </Box>

        {/* ── Last trained ─────────────────────────────────────── */}
        {lastTrainedDate && !Number.isNaN(lastTrainedDate.getTime()) && (
          <Typography variant="caption" sx={{ color: "text.disabled", mt: 1, display: "block" }}>
            Last training completed:{" "}
            <strong style={{ color: theme.palette.text.primary }}>{lastTrainedDate.toLocaleString()}</strong>
          </Typography>
        )}
      </Box>
    </Box>
  );
}