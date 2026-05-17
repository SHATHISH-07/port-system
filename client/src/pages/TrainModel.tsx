import { useState, useEffect, useRef } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Divider, Collapse, Checkbox, FormGroup,
  FormControlLabel, useTheme, Paper,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
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
    api.get("/model/status").then((r) => setStatus(r.data?.training || null)).catch(() => { });
  };

  useEffect(() => {
    api.get("/model/status").then((r) => setStatus(r.data?.training || null)).catch(() => { });
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

      const res = await api.post("/model/training", form);

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
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top Header Control Bar */}
      <Box
        sx={{
          px: { xs: 3, md: 6 },
          py: 4,
          bgcolor: "transparent",
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%' }}>
          <Box sx={{ fontSize: '25px', fontWeight: 'bold' }}>
            ML Model Training & Retraining Dashboard
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, mr: 1 }}>
              Select Data Ingest Source:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant={dataSource === "db" ? "contained" : "outlined"}
                onClick={() => {
                  if (loading || isTraining) return;
                  setDataSource("db");
                  setFile(null);
                }}
                disabled={loading || isTraining}
                sx={{
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  boxShadow: dataSource === "db" ? `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}` : "none",
                }}
              >
                Use Database
              </Button>
              <Button
                variant={dataSource === "file" ? "contained" : "outlined"}
                onClick={() => {
                  if (loading || isTraining) return;
                  setDataSource("file");
                }}
                disabled={loading || isTraining}
                sx={{
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  boxShadow: dataSource === "file" ? `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}` : "none",
                }}
              >
                Upload CSV File
              </Button>
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5 }}>
            Configure and trigger model training runs using historical database records or an uploaded custom CSV dataset.
          </Typography>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          scrollBehavior: 'smooth',
        }}
      >
        <Box sx={{ p: { xs: 2, sm: 3, md: 6 }, flex: 1, maxWidth: 1000, mx: "auto" }}>
          {/* Hero Header */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.15em' }}>
              Machine Learning Retraining
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 0.5 }}>
              <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
                {dataSource === "db" ? "Database Source" : "File Upload Source"}
              </Typography>
              <Typography variant="h5" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                Vessel Stay Predictor
              </Typography>
            </Box>
          </Box>

          {/* Config card */}
          <Box
            sx={{
              bgcolor: "background.paper",
              border: "1px solid", 
              borderColor: "divider",
              borderRadius: 4,
              mb: 4,
              overflow: "hidden",
              boxShadow: "0 6px 24px rgba(0,0,0,0.03)",
            }}
          >
            {/* File dropzone (Only active when dataSource is file) */}
            <Collapse in={dataSource === "file"}>
              <Box sx={{ p: 4, pb: 2 }}>
                <Box
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  sx={{
                    border: `2px dashed ${isDragging
                      ? (theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8")
                      : theme.palette.divider}`,
                    borderRadius: 3,
                    p: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    gap: 1.5,
                    cursor: "pointer",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    bgcolor: isDragging
                      ? (theme.palette.mode === "dark" ? "rgba(96,165,250,0.08)" : "rgba(26,115,232,0.06)")
                      : "background.default",
                    "&:hover": {
                      borderColor: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
                      bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.02)",
                      transform: "scale(1.005)",
                    },
                  }}
                >
                  <input ref={fileRef} type="file" accept=".csv" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  <UploadFileOutlined sx={{ color: "text.disabled", fontSize: 32, mb: 1 }} />
                  <Box sx={{ maxWidth: 280 }}>
                    {file ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>{file.name}</Typography>
                        <Typography variant="caption" sx={{ color: "text.disabled", mt: 0.5, display: "block" }}>{(file.size / 1024).toFixed(1)} KB — click to change</Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                          Drop a CSV here or click to browse
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
                          Requires headers matching standard vessel stay schemas
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>

                {/* Save to DB checkbox */}
                <FormGroup sx={{ mt: 2, ml: 0.5 }}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={updateDb} onChange={(e) => setUpdateDb(e.target.checked)} disabled={loading || isTraining} />}
                    label={
                      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
                        Also save this file to the history database
                      </Typography>
                    }
                  />
                </FormGroup>
              </Box>
              <Divider sx={{ borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
            </Collapse>

            {/* Config panel */}
            <Box sx={{ p: 4 }}>
              <ConfigPanel />
            </Box>

            <Divider sx={{ borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />

            {/* Actions */}
            <Box sx={{ px: 4, py: 3, display: "flex", justifyContent: "flex-end", bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.01)" : "rgba(0,0,0,0.005)" }}>
              <Button
                variant="contained"
                disableElevation
                disabled={!canTrain}
                onClick={() => handleTrain()}
                sx={{ 
                  minWidth: 180,
                  borderRadius: 2.5,
                  textTransform: "none",
                  fontWeight: 600,
                  px: 3,
                  py: 1.25,
                  boxShadow: theme.palette.mode === "dark"
                    ? "0 4px 12px rgba(29, 78, 216, 0.2)"
                    : "0 4px 12px rgba(29, 78, 216, 0.1)",
                }}
              >
                {loading ? "Starting Retrain…" : "Start Model Retrain"}
              </Button>
            </Box>

            {loading && <LinearProgress />}
          </Box>

          {/* Training Status Card */}
          {(hasTriggered || (status && status.status !== "idle")) && (
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
      </Box>
    </Box>
  );
}
