import React, { useState } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, useTheme,
  Paper, Grid,
  CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  CheckCircleOutlined,
  ErrorOutlined,
  HourglassEmptyOutlined,
} from "@mui/icons-material";
import { api } from "../../api/api";
import FileUpload from "./FileUpload";

interface UploadResponse {
  status: string;           // "success" | "partial" | "failed"
  dataset_type?: string;
  accepted_count?: number;
  rejected_count?: number;
  ingestion_id: string;
  message?: string;
  errors?: string[] | null;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { color: "success" | "error" | "warning" | "default"; icon: React.ReactElement }> = {
    success: { color: "success", icon: <CheckCircleOutlined fontSize="small" /> },
    partial: { color: "warning", icon: <CheckCircleOutlined fontSize="small" /> },
    failed: { color: "error", icon: <ErrorOutlined fontSize="small" /> },
    processing: { color: "default", icon: <HourglassEmptyOutlined fontSize="small" /> },
  };
  const { color, icon } = map[status] ?? map.processing;
  return (
    <Chip
      label={status.toUpperCase()}
      color={color}
      icon={icon}
      size="small"
      sx={{ fontWeight: 800, fontSize: "11px" }}
    />
  );
}

export default function DataIngestion() {
  const theme = useTheme();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusData, setStatusData] = useState<UploadResponse | null>(null);
  const [toast, setToast] = useState<{
    open: boolean; message: string; severity: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", severity: "success" });

  const showToast = (message: string, severity: typeof toast.severity) =>
    setToast({ open: true, message, severity });

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleIngest = async () => {
    if (!file) return;
    setUploading(true);
    setStatusData(null);

    try {
      const form = new FormData();
      form.append("file", file);

      // Unified upload endpoint — dataset type is auto-detected
      const res = await api.post<UploadResponse>(
        `/ingest/upload`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      let data = res.data;

      if (data.status === "processing" && data.ingestion_id) {
        showToast(`Ingestion queued and is processing in the background...`, "info");
        // Poll for completion
        while (data.status === "processing") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusRes = await api.get<UploadResponse>(`/ingest/status/${data.ingestion_id}`);
          data = statusRes.data;
        }
      }

      setStatusData(data);

      if (data.status === "failed") {
        showToast(data.message ?? "Ingestion failed.", "error");
      } else if (data.status === "partial") {
        showToast(`Partial success — ${data.accepted_count} accepted, ${data.rejected_count} rejected.`, "warning");
      } else {
        showToast(`Ingestion complete — ${data.accepted_count} rows processed.`, "success");
        setFile(null);
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail ?? "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  const isLoading = uploading;

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
              Data Ingestion
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Upload raw dataset files (History, Crane, or ITV). The system will automatically detect the dataset type.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, overflowY: 'auto', scrollBehavior: 'smooth', p: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 1000, mx: "auto", display: "flex", flexDirection: "column", gap: 4 }}>

          {/* Upload Area Card */}
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
                <Box sx={{ p: { xs: 3, md: 4 } }}>
                  <FileUpload
                    onFileSelect={(f) => {
                      setFile(f);
                      setStatusData(null);
                    }}
                    acceptedTypes=".csv,.xlsx,.xls,.json"
                    label={`Upload dataset (CSV, Excel, JSON)`}
                  />
                </Box>

                <Box sx={{ p: 3, display: "flex", justifyContent: "flex-end", bgcolor: alpha(theme.palette.background.default, 0.3) }}>
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={!file || isLoading}
                    onClick={handleIngest}
                    startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : undefined}
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
                    {uploading ? "Processing…" : "Start Ingestion"}
                  </Button>
                </Box>
                {uploading && <LinearProgress sx={{ height: 4 }} />}
              </Paper>
            </Grid>
          </Grid>


          {/* Status Result Card */}
          {statusData && (
            <Grid container spacing={2} sx={{ maxWidth: 750, mx: "auto", width: "100%" }}>
              <Grid size={{ xs: 12 }}>
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: alpha(theme.palette.success.main, 0.3),
                    background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
                    backdropFilter: "blur(20px)",
                    overflow: "hidden",
                    boxShadow: `0 8px 32px ${alpha(theme.palette.success.main, 0.05)}`,
                  }}
                >
                  <Box sx={{ p: { xs: 3, md: 4 } }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(5, 1fr)" }, gap: 3, mb: 3 }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, display: "block", mb: 1, letterSpacing: "0.1em" }}>
                          STATUS
                        </Typography>
                        <StatusChip status={statusData.status} />
                      </Box>

                      <Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, display: "block", mb: 1, letterSpacing: "0.1em" }}>
                          DATASET
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 800, textTransform: "uppercase", color: "text.primary" }}>
                          {statusData.dataset_type || "PROCESSING"}
                        </Typography>
                      </Box>

                      <Box sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.divider, 0.05), border: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, display: "block", mb: 0.5, letterSpacing: "0.1em" }}>
                          TOTAL ROWS
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900, fontFamily: "monospace", color: "text.primary" }}>
                          {((statusData.accepted_count || 0) + (statusData.rejected_count || 0)).toLocaleString()}
                        </Typography>
                      </Box>

                      <Box sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.success.main, 0.1), border: `1px solid ${alpha(theme.palette.success.main, 0.2)}` }}>
                        <Typography variant="caption" sx={{ color: "success.main", fontWeight: 800, display: "block", mb: 0.5, letterSpacing: "0.1em" }}>
                          ACCEPTED
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: "success.main", fontFamily: "monospace" }}>
                          {(statusData.accepted_count || 0).toLocaleString()}
                        </Typography>
                      </Box>

                      <Box sx={{ p: 2, borderRadius: 3, bgcolor: (statusData.rejected_count || 0) > 0 ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.divider, 0.05), border: `1px solid ${(statusData.rejected_count || 0) > 0 ? alpha(theme.palette.error.main, 0.2) : alpha(theme.palette.divider, 0.1)}` }}>
                        <Typography variant="caption" sx={{ color: (statusData.rejected_count || 0) > 0 ? "error.main" : "text.secondary", fontWeight: 800, display: "block", mb: 0.5, letterSpacing: "0.1em" }}>
                          REJECTED
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: (statusData.rejected_count || 0) > 0 ? "error.main" : "text.secondary", fontFamily: "monospace" }}>
                          {(statusData.rejected_count || 0).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Errors */}
                    {statusData.errors && statusData.errors.length > 0 && (
                      <Alert severity="error" variant="outlined" sx={{ borderRadius: 2, fontWeight: 600 }}>
                        {statusData.errors.join("; ")}
                      </Alert>
                    )}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          )}

        </Box>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={7000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%", borderRadius: 2.5, fontWeight: 600 }}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
