import React, { useState } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, useTheme, Card, CardContent,
  Divider,
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

type IngestType = "history" | "crane";

interface UploadResponse {
  status: string;           // "success" | "partial" | "failed"
  dataset_type: string;
  accepted_count: number;
  rejected_count: number;
  ingestion_id: string;
  message?: string;
  errors?: string[] | null;
}

const SCHEMAS: Record<IngestType, string[]> = {
  history: [
    "unit_id", "actual_outbound_carrier_visit_id", "outbound_service",
    "move_complete_time", "time_in", "time_out",
    "ctr_from_position", "ctr_to_position",
    "unit_weight_in_kg", "verified_gross_mass_kg",
    "reefer", "hazardous_flag", "oog_unit", "port_of_discharge",
  ],
  crane: [
    "crane_id", "unit_id", "carrier_visit", "move_kind",
    "from_position", "to_position", "time_completed", "line_op",
  ],
};

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

  const [activeType, setActiveType] = useState<IngestType>("history");
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

      // Pass the explicit type as a query param so auto-detect is skipped
      const res = await api.post<UploadResponse>(
        `/ingest/upload?datasetType=${activeType}`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      const data = res.data;
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
      <Box
        sx={{
          px: { xs: 2, md: 4 },
          py: 2.5,
          bgcolor: "transparent",
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
          <Box sx={{ fontSize: '18px', fontWeight: 'bold' }}>
            Data Ingestion & Integration
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
              Select Ingestion Target:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant={activeType === "history" ? "contained" : "outlined"}
                onClick={() => {
                  if (isLoading) return;
                  setActiveType("history");
                  setFile(null);
                  setStatusData(null);
                }}
                disabled={isLoading}
                sx={{
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 2,
                  py: 0.6,
                  height: 32,
                  fontSize: '0.75rem',
                  boxShadow: activeType === "history" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}` : "none",
                }}
              >
                History Ingestion
              </Button>
              <Button
                variant={activeType === "crane" ? "contained" : "outlined"}
                onClick={() => {
                  if (isLoading) return;
                  setActiveType("crane");
                  setFile(null);
                  setStatusData(null);
                }}
                disabled={isLoading}
                sx={{
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 2,
                  py: 0.6,
                  height: 32,
                  fontSize: '0.75rem',
                  boxShadow: activeType === "crane" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}` : "none",
                }}
              >
                Crane Ingestion
              </Button>
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5, fontSize: '0.7rem' }}>
            Upload raw CSV or Excel dataset files to keep the history logs and crane operations database records fully updated.
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
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, flex: 1, width: "100%" }}>
          {/* Hero Header */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 0.25 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }}>
                {activeType === "history" ? "History Ingestion" : "Crane Ingestion"}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Terminal Database Updater
              </Typography>
            </Box>
          </Box>
          <Box sx={{ maxWidth: 800, mx: "auto" }}>
            <Box
              sx={{
                bgcolor: "transparent",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                mb: 2,
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(0,0,0,0.02)",
              }}
            >
              <Box sx={{ p: 2.5, pb: 1.5 }}>
                <FileUpload
                  onFileSelect={(f) => {
                    setFile(f);
                    setStatusData(null);
                  }}
                  acceptedTypes=".csv,.xlsx,.xls"
                  label={`Upload ${activeType === "history" ? "vessel stay history" : "crane operations"} dataset`}
                />
              </Box>

              <Divider sx={{ borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />

              <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 800, color: "text.secondary", letterSpacing: "0.05em", fontSize: "0.68rem" }}
                >
                  EXPECTED {activeType.toUpperCase()} HEADERS
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {SCHEMAS[activeType].map((h) => (
                    <Chip
                      key={h}
                      label={h}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: "9px",
                        height: "20px",
                        borderRadius: 1,
                        bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.015)",
                        borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        fontWeight: 500
                      }}
                    />
                  ))}
                </Box>
              </Box>

              <Divider sx={{ borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />

              {/* Actions */}
              <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.01)" : "rgba(0,0,0,0.005)" }}>
                <Button
                  variant="contained"
                  disableElevation
                  disabled={!file || isLoading}
                  onClick={handleIngest}
                  startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : undefined}
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
                  {uploading ? "Processing…" : "Start Ingestion"}
                </Button>
              </Box>

              {uploading && <LinearProgress sx={{ height: 3 }} />}
            </Box>


            {/* ── Status result card ── */}
            {statusData && (
              <Card
                sx={{
                  mt: 2,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.02)",
                  bgcolor: "background.paper"
                }}
              >
                <CardContent sx={{ p: "16px !important" }}>
                  {/* Summary row */}
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 2, mb: 2 }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25, fontSize: "0.68rem" }}>
                        STATUS
                      </Typography>
                      <StatusChip status={statusData.status} />
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25, fontSize: "0.68rem" }}>
                        DATASET TYPE
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.primary", fontSize: "0.75rem" }}>
                        {statusData.dataset_type}
                      </Typography>
                    </Box>

                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)", border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"}` }}>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25, fontSize: "0.68rem" }}>
                        TOTAL ROWS
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 800, fontFamily: "monospace", color: "text.primary", fontSize: "0.9rem" }}>
                        {(statusData.accepted_count + statusData.rejected_count).toLocaleString()}
                      </Typography>
                    </Box>

                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: theme.palette.mode === "dark" ? "rgba(16,185,129,0.03)" : "rgba(16,185,129,0.02)", border: `1px solid ${theme.palette.mode === "dark" ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.08)"}` }}>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25, fontSize: "0.68rem" }}>
                        ACCEPTED
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 800, color: "success.main", fontFamily: "monospace", fontSize: "0.9rem" }}>
                        {statusData.accepted_count.toLocaleString()}
                      </Typography>
                    </Box>

                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: statusData.rejected_count > 0 ? (theme.palette.mode === "dark" ? "rgba(239,68,68,0.03)" : "rgba(239,68,68,0.02)") : (theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)"), border: `1px solid ${statusData.rejected_count > 0 ? (theme.palette.mode === "dark" ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)") : (theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)")}` }}>
                      <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25, fontSize: "0.68rem" }}>
                        REJECTED
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 800,
                          color: statusData.rejected_count > 0 ? "error.main" : "text.secondary",
                          fontFamily: "monospace",
                          fontSize: "0.9rem"
                        }}
                      >
                        {statusData.rejected_count.toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Errors */}
                  {statusData.errors && statusData.errors.length > 0 && (
                    <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                      {statusData.errors.join("; ")}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </Box>
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
          sx={{ width: "100%", borderRadius: 2.5 }}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
