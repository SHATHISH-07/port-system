import { useState, useEffect } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Divider, Collapse, Checkbox, FormGroup,
  FormControlLabel, useTheme, Paper, Grid
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
      <Paper
        elevation={0}
        sx={{
          px: { xs: 2.5, md: 4 },
          py: 2.5,
          bgcolor: alpha(theme.palette.background.default, 0.9),
          backdropFilter: 'blur(25px)',
          borderRadius: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, width: '100%' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', letterSpacing: '-0.5px', mb: 0.5 }}>
              ML Model Training Pipeline
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Configure and trigger model training runs using historical database records or uploaded datasets.
            </Typography>
          </Box>
          
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant={dataSource === "db" ? "contained" : "outlined"}
              onClick={() => {
                if (loading || isTraining) return;
                setDataSource("db");
                setFile(null);
              }}
              disabled={loading || isTraining}
              sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none", py: 0.75, px: 2, boxShadow: dataSource === "db" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}` : "none" }}
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
              sx={{ borderRadius: 2, fontWeight: 700, textTransform: "none", py: 0.75, px: 2, boxShadow: dataSource === "file" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}` : "none" }}
            >
              Upload CSV File
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, overflowY: 'auto', scrollBehavior: 'smooth', p: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 1000, mx: "auto", display: "flex", flexDirection: "column", gap: 4 }}>

          {/* Main Training & Config Card */}
          <Grid container spacing={2} sx={{ maxWidth: 750, mx: "auto", width: "100%" }}>
            <Grid size={{ xs: 12 }}>
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: alpha(theme.palette.primary.main, 0.15),
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.background.paper, 0.8)} 100%)`,
                  backdropFilter: "blur(20px)",
                  overflow: "hidden",
                  boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.05)}`,
                }}
              >
                {/* File dropzone (Only active when dataSource is file) */}
                <Collapse in={dataSource === "file"}>
                  <Box sx={{ p: { xs: 3, md: 4 }, pb: 2 }}>
                    <FileUpload
                      onFileSelect={(f) => setFile(f)}
                      acceptedTypes=".csv"
                      label="Upload custom training dataset"
                    />

                    {/* Save to DB checkbox */}
                    <FormGroup sx={{ mt: 2, ml: 1 }}>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={updateDb} onChange={(e) => setUpdateDb(e.target.checked)} disabled={loading || isTraining} sx={{ color: "primary.main" }} />}
                        label={
                          <Typography sx={{ color: "text.secondary", fontWeight: 600, fontSize: "0.85rem" }}>
                            Also save this file to the history database
                          </Typography>
                        }
                      />
                    </FormGroup>
                  </Box>
                  <Divider sx={{ borderColor: alpha(theme.palette.divider, 0.5) }} />
                </Collapse>

                {/* Config panel */}
                <Box sx={{ p: { xs: 3, md: 4 } }}>
                  <ConfigPanel />
                </Box>

                {/* Actions */}
                <Box sx={{ p: 3, display: "flex", justifyContent: "flex-end", bgcolor: alpha(theme.palette.background.default, 0.3) }}>
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={!canTrain}
                    onClick={() => handleTrain()}
                    sx={{
                      minWidth: 160,
                      borderRadius: 2,
                      textTransform: "none",
                      fontWeight: 700,
                      px: 3,
                      py: 1,
                      fontSize: '0.9rem',
                    }}
                  >
                    {loading ? "Starting Retrain…" : "Start Model Retrain"}
                  </Button>
                </Box>

                {loading && <LinearProgress sx={{ height: 4 }} />}
              </Paper>
            </Grid>
          </Grid>

          {/* Training Status Card */}
          {(hasTriggered || (status && status.status !== "idle")) && (
            <Grid container spacing={2} sx={{ maxWidth: 750, mx: "auto", width: "100%" }}>
              <Grid size={{ xs: 12 }}>
                <TrainingStatusCard onRetry={handleTrain} />
              </Grid>
            </Grid>
          )}

        </Box>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))} sx={{ borderRadius: 2.5, fontWeight: 600 }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
