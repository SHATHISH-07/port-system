import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Divider,
  LinearProgress,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { api } from "../../api/api";

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
      // keep quiet if the server is still booting
    }
  };

  useEffect(() => {
    load();
  }, []);

  const isDirty = useMemo(() => {
    if (!cfg) return false;
    const parsed = parseInt(threshold, 10);
    return !Number.isNaN(parsed) && parsed !== cfg.retrain_threshold;
  }, [cfg, threshold]);

  const handleSave = async () => {
    const val = parseInt(threshold, 10);
    if (Number.isNaN(val) || val < 1) return;

    setSaving(true);
    try {
      const res = await api.patch<{ config: RetrainingConfig }>(
        "/config/retraining",
        { retrain_threshold: val }
      );

      setCfg((prev) =>
        prev ? { ...prev, retrain_threshold: res.data.config.retrain_threshold } : prev
      );

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      // add a toast here if you want
    } finally {
      setSaving(false);
    }
  };

  const scheduledLabel = cfg
    ? `${String(cfg.scheduled_hour ?? 0).padStart(2, "0")}:${String(
      cfg.scheduled_minute ?? 0
    ).padStart(2, "0")} (server time)`
    : "—";

  const progress =
    cfg && cfg.retrain_threshold > 0
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

  const statCards = [
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
        "The nightly retraining runs at this time every day using server local time.",
    },
  ];

  return (
    <Box sx={{ width: "100%" }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography
            sx={{
              mt: 0.5,
              color: "text.primary",
              fontWeight: 700,
              fontSize: "0.95rem",
            }}
          >
            Keep the retraining threshold aligned with your data growth.
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: "text.primary" }}
            >
              Auto-Retrain Threshold
            </Typography>
            <Tooltip
              title="When the number of new records since the last training reaches this value, retraining will trigger automatically on the next upload."
              placement="top"
              arrow
            >
              <InfoOutlined sx={{ fontSize: 15, color: "text.disabled" }} />
            </Tooltip>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              alignItems: "center",
            }}
          >
            <TextField
              type="number"
              size="small"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={saving}
              slotProps={{ htmlInput: { min: 1, step: 100 } }}
              sx={{
                width: 140,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2.5,
                  backgroundColor: "transparent",
                },
              }}
            />

            <Button
              variant={saved ? "contained" : "outlined"}
              color={saved ? "success" : "primary"}
              disableElevation
              size="medium"
              disabled={!isDirty || saving}
              onClick={handleSave}
              sx={{
                minWidth: 110,
                borderRadius: 2.5,
                textTransform: "none",
                fontWeight: 700,
                height: 40,
                px: 2,
              }}
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Apply"}
            </Button>
          </Box>

          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mt: 1 }}
          >
            Default: 1,000 records. Takes effect immediately.
          </Typography>
        </Box>

        <Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: 2,
              mb: 1,
              alignItems: "baseline",
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: "text.primary" }}
            >
              New Records Since Last Training
            </Typography>
            {cfg ? (
              <Typography
                variant="body2"
                sx={{
                  fontFamily: "monospace",
                  color: "primary.main",
                  fontWeight: 700,
                }}
              >
                {formatNum(cfg.new_records_since_training)} /{" "}
                {formatNum(cfg.retrain_threshold)}
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
              borderRadius: 999,
              bgcolor:
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 999,
                background:
                  progress >= 100
                    ? "linear-gradient(90deg, #10b981 0%, #059669 100%)"
                    : "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mt: 0.75 }}
          >
            {progress}% of threshold reached
            {progress >= 100 ? " — retraining will trigger on the next upload" : ""}
          </Typography>
        </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(3, 1fr)",
              },
            gap: 1.5,
          }}
        >
          {statCards.map(({ label, value, tooltip }) => (
            <Box
              key={label}
              sx={{
                p: 1.75,
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, mb: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {label}
                </Typography>
                {tooltip && (
                  <Tooltip title={tooltip} placement="top" arrow>
                    <InfoOutlined sx={{ fontSize: 12, color: "text.disabled" }} />
                  </Tooltip>
                )}
              </Box>

              <Typography
                sx={{
                  fontWeight: 700,
                  color: "text.primary",
                  fontFamily: label === "Nightly Schedule" ? "inherit" : "monospace",
                  fontSize: label === "Nightly Schedule" ? "0.9rem" : "0.95rem",
                  lineHeight: 1.35,
                  wordBreak: "break-word",
                }}
              >
                {value}
              </Typography>
            </Box>
          ))}
        </Box>

        {lastTrainedDate && !Number.isNaN(lastTrainedDate.getTime()) && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2.5,
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Last training completed:{" "}
              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                {lastTrainedDate.toLocaleString()}
              </Box>
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}