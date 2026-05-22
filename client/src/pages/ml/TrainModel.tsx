import { useState, useEffect } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Divider, Collapse, Checkbox, FormGroup,
  FormControlLabel, useTheme
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { api } from "../../api/api";
import TrainingStatusCard from "./TrainingStatusCard";
import ConfigPanel from "./ConfigPanel";
import FileUpload from "../ingestion/FileUpload";

export default function TrainModel() {
  const theme = useTheme();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [dataSource, setDataSource] = useState<"db" | "file">("db");
  const [file, setFile] = useState<File | null>(null);
  const [updateDb, setUpdateDb] = useState(false);

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
          px: { xs: 2, md: 4 },
          py: 2.5,
          bgcolor: "transparent",
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
          <Box sx={{ fontSize: '18px', fontWeight: 'bold' }}>
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
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, mr: 1, fontSize: '0.8rem' }}>
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
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 2,
                  py: 0.6,
                  height: 32,
                  fontSize: '0.75rem',
                  boxShadow: dataSource === "db" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}` : "none",
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
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 2,
                  py: 0.6,
                  height: 32,
                  fontSize: '0.75rem',
                  boxShadow: dataSource === "file" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}` : "none",
                }}
              >
                Upload CSV File
              </Button>
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5, fontSize: '0.7rem' }}>
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
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, flex: 1, width: "100%", maxWidth: 800, mx: "auto" }}>
          {/* Hero Header */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 0.25 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }}>
                {dataSource === "db" ? "Database Source" : "File Upload Source"}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Vessel Stay Predictor
              </Typography>
            </Box>
          </Box>

          {/* Config card */}
          <Box
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              mb: 2,
              overflow: "hidden",

            }}
          >
            {/* File dropzone (Only active when dataSource is file) */}
            <Collapse in={dataSource === "file"}>
              <Box sx={{ p: 2.5, pb: 1.5 }}>
                <FileUpload
                  onFileSelect={(f) => setFile(f)}
                  acceptedTypes=".csv"
                  label="Upload custom training dataset"
                />

                {/* Save to DB checkbox */}
                <FormGroup sx={{ mt: 1.5, ml: 0.5 }}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={updateDb} onChange={(e) => setUpdateDb(e.target.checked)} disabled={loading || isTraining} />}
                    label={
                      <Typography sx={{ color: "text.secondary", fontWeight: 500, fontSize: "0.75rem" }}>
                        Also save this file to the history database
                      </Typography>
                    }
                  />
                </FormGroup>
              </Box>
              <Divider sx={{ borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
            </Collapse>

            {/* Config panel */}
            <Box sx={{ p: 2.5 }}>
              <ConfigPanel />
            </Box>

            <Divider sx={{ borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />

            {/* Actions */}
            <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", bgcolor: "transparent" }}>
              <Button
                variant="contained"
                disableElevation
                disabled={!canTrain}
                onClick={() => handleTrain()}
                sx={{
                  minWidth: 150,
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 600,
                  px: 2,
                  py: 0.75,
                  height: 36,
                  fontSize: '0.8rem',
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
