import { useState, useEffect, useRef } from "react";
import {
  Box, Typography, Button, LinearProgress, Radio, RadioGroup,
  FormControlLabel, FormControl, Alert, Snackbar, Divider,
  Collapse, Checkbox, FormGroup, useTheme,
} from "@mui/material";
import { UploadFileOutlined } from "@mui/icons-material";
import { api } from "../api/api";
import TrainingStatusCard from "../components/TrainingStatusCard";
import ConfigPanel from "../components/ConfigPanel";

export default function TrainModel() {
  const theme = useTheme();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [dataSource, setDataSource] = useState<"db" | "file">("db");
  const [file, setFile] = useState<File | null>(null);
  const [updateDb, setUpdateDb] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Training state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [hasTriggered, setHasTriggered] = useState(false);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    open: boolean; message: string; severity: "success" | "error" | "info" | "warning";
  }>({ open: false, message: "", severity: "info" });

  const showToast = (message: string, severity: typeof toast.severity) =>
    setToast({ open: true, message, severity });

  const startPolling = () => {
    // TrainingStatusCard handles its own polling — just refresh state indicator
    api.get("/model/vessel-stay/training/status").then((r) => setStatus(r.data)).catch(() => { });
  };

  useEffect(() => {
    api.get("/model/vessel-stay/training/status").then((r) => setStatus(r.data)).catch(() => { });
  }, []);

  // ── File handling ───────────────────────────────────────────────────────────
  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      showToast("Only CSV files are accepted.", "error");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  // ── Submit training ─────────────────────────────────────────────────────────
  const handleTrain = async () => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("data_source", dataSource);
      form.append("update_db", String(updateDb));
      if (dataSource === "file" && file) form.append("file", file);

      const res = await api.post("/model/vessel-stay/training", form);

      if (res.data.status === "error") {
        showToast(res.data.message, "error");
      } else {
        setHasTriggered(true);
        showToast(res.data.message, "success");
        startPolling();
      }
    } catch (err: any) {
      let errMsg = "Training request failed.";
      if (err?.response?.data?.detail) {
        errMsg = typeof err.response.data.detail === "string" 
          ? err.response.data.detail 
          : JSON.stringify(err.response.data.detail);
      } else if (err?.response?.data?.error) {
        errMsg = typeof err.response.data.error === "string"
          ? err.response.data.error
          : JSON.stringify(err.response.data.error);
      } else if (err?.message) {
        errMsg = err.message;
      }
      showToast(errMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const isTraining = status?.status === "training";
  const canTrain = !loading && !isTraining && (dataSource === "db" || !!file);

  return (
    <Box sx={{ mx: "auto" }}>

      {/* Header */}
      <Box sx={{ mb: 4, pb: 3, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="h5" sx={{ mb: 0.5, color: "text.primary" }}>
          Train Vessel Stay Model
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 480 }}>
          Configure a training run using historical database records or an uploaded CSV dataset.
        </Typography>
      </Box>

      {/* Config card */}
      <Box
        sx={{
          bgcolor: theme.palette.mode === "dark" ? "#2a2a2a" : "#e9eef6",
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          mb: 3,
          overflow: "hidden",
        }}
      >
        {/* Data source */}
        <Box sx={{ p: 3 }}>
          <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
            Data Source
          </Typography>
          <FormControl disabled={loading || isTraining}>
            <RadioGroup
              value={dataSource}
              onChange={(e) => { setDataSource(e.target.value as "db" | "file"); setFile(null); }}
            >
              <FormControlLabel
                value="db"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>Use Database</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Load from the existing history table
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="file"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>Upload CSV File</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Train directly from an uploaded dataset
                    </Typography>
                  </Box>
                }
                sx={{ mt: 1 }}
              />
            </RadioGroup>
          </FormControl>

          {/* File dropzone */}
          <Collapse in={dataSource === "file"} sx={{ mt: 2 }}>
            <Box
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              sx={{
                border: `2px dashed ${isDragging
                  ? (theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8")
                  : theme.palette.divider}`,
                borderRadius: 2,
                p: 3,
                display: "flex",
                alignItems: "center",
                gap: 2,
                cursor: "pointer",
                transition: "all 200ms",
                bgcolor: isDragging
                  ? (theme.palette.mode === "dark" ? "rgba(96,165,250,0.06)" : "rgba(26,115,232,0.04)")
                  : "transparent",
                "&:hover": {
                  borderColor: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
                },
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <UploadFileOutlined sx={{ color: "text.disabled", fontSize: 28, flexShrink: 0 }} />
              <Box>
                {file ? (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>{file.name}</Typography>
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>{(file.size / 1024).toFixed(1)} KB — click to change</Typography>
                  </>
                ) : (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Drop a CSV here or click to browse
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Save to DB checkbox */}
            <FormGroup sx={{ mt: 1.5, ml: 0.5 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={updateDb} onChange={(e) => setUpdateDb(e.target.checked)} disabled={loading || isTraining} />}
                label={
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Also save this file to the history database
                  </Typography>
                }
              />
            </FormGroup>
          </Collapse>
        </Box>

        <Divider />

        {/* Config panel */}
        <Box sx={{ p: 3 }}>
          <ConfigPanel />
        </Box>

        <Divider />

        {/* Actions */}
        <Box sx={{ px: 3, py: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            disabled={!canTrain}
            onClick={() => handleTrain()}
            sx={{ minWidth: 160 }}
          >
            {loading ? "Starting…" : "Start Training"}
          </Button>
        </Box>

        {loading && <LinearProgress />}
      </Box>

      {/* Training Status Card */}
      {hasTriggered && (
        <TrainingStatusCard onRetry={handleTrain} />
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
