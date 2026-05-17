import { useState, useRef } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, useTheme, Card, CardContent,
  Paper, CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  UploadFileOutlined,
  CheckCircleOutlined,
  ErrorOutlined,
  HourglassEmptyOutlined,
} from "@mui/icons-material";
import { api } from "../api/api";

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
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeType, setActiveType] = useState<IngestType>("history");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusData, setStatusData] = useState<UploadResponse | null>(null);
  const [toast, setToast] = useState<{
    open: boolean; message: string; severity: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", severity: "success" });

  const showToast = (message: string, severity: typeof toast.severity) =>
    setToast({ open: true, message, severity });

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = (f: File) => {
    const valid = [".csv", ".xlsx", ".xls"].some(ext => f.name.toLowerCase().endsWith(ext));
    if (!valid) {
      showToast("Only CSV or Excel files are accepted.", "error");
      return;
    }
    setFile(f);
    setStatusData(null);
  };

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
          px: { xs: 3, md: 6 },
          py: 4,
          bgcolor: "transparent",
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%' }}>
          <Box sx={{ fontSize: '25px', fontWeight: 'bold' }}>
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
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, mr: 1 }}>
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
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  boxShadow: activeType === "history" ? `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}` : "none",
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
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: "none",
                  px: 3,
                  py: 1,
                  boxShadow: activeType === "crane" ? `0 8px 16px ${alpha(theme.palette.primary.main, 0.25)}` : "none",
                }}
              >
                Crane Ingestion
              </Button>
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5 }}>
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
        <Box sx={{ p: { xs: 2, sm: 3, md: 6 }, flex: 1, maxWidth: 1000, mx: "auto" }}>
          {/* Hero Header */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.15em' }}>
              Operational Integration
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 0.5 }}>
              <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
                {activeType === "history" ? "History Ingestion" : "Crane Ingestion"}
              </Typography>
              <Typography variant="h5" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                Terminal Database Updater
              </Typography>
            </Box>
          </Box>

          <Paper 
            variant="outlined" 
            sx={{ 
              p: 4, 
              borderRadius: 4, 
              textAlign: "center",
              bgcolor: "background.paper",
              border: "1px solid", 
              borderColor: "divider",
              boxShadow: "0 6px 24px rgba(0,0,0,0.03)"
            }}
          >
            {/* Drop zone */}
            <Box
              onClick={() => !isLoading && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              sx={{
                border: "2px dashed",
                borderColor: file ? "primary.main" : theme.palette.divider,
                borderRadius: 3,
                p: 6,
                cursor: isLoading ? "not-allowed" : "pointer",
                bgcolor: file
                  ? (theme.palette.mode === "dark" ? "rgba(96,165,250,0.02)" : "rgba(26,115,232,0.01)")
                  : "transparent",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": !isLoading
                  ? { 
                      bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0, 0, 0, 0.01)", 
                      borderColor: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
                      transform: "scale(1.005)"
                    }
                  : {},
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                hidden
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <UploadFileOutlined
                sx={{ fontSize: 52, color: file ? "primary.main" : "text.disabled", mb: 2, transition: "all 0.3s" }}
              />
              {file ? (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
                    {file.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                    {(file.size / 1024).toFixed(1)} KB — click to choose a different file
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
                    Click or drag to upload {activeType === "history" ? "vessel stay history" : "crane operations"} data
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                    CSV and Excel formats supported — headers are automatically parsed and normalized.
                  </Typography>
                </>
              )}
            </Box>

            {/* Schema hint + action */}
            <Box
              sx={{
                mt: 4,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 3,
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ textAlign: "left", flex: 1, minWidth: 280 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 800, color: "text.secondary", display: "block", letterSpacing: "0.05em", mb: 1 }}
                >
                  EXPECTED HEADERS ({activeType.toUpperCase()}):
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {SCHEMAS[activeType].map((h) => (
                    <Chip
                      key={h}
                      label={h}
                      size="small"
                      variant="outlined"
                      sx={{ 
                        fontSize: "11px", 
                        height: "24px",
                        borderRadius: 1.5,
                        bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.015)",
                        borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        fontWeight: 500
                      }}
                    />
                  ))}
                </Box>
              </Box>

              <Button
                variant="contained"
                size="large"
                disableElevation
                disabled={!file || isLoading}
                onClick={handleIngest}
                startIcon={
                  uploading ? <CircularProgress size={16} color="inherit" /> : undefined
                }
                sx={{ 
                  px: 4, 
                  py: 1.25,
                  borderRadius: 2.5, 
                  alignSelf: "flex-end", 
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                  textTransform: "none",
                  boxShadow: theme.palette.mode === "dark"
                    ? "0 4px 12px rgba(29, 78, 216, 0.2)"
                    : "0 4px 12px rgba(29, 78, 216, 0.1)",
                }}
              >
                {uploading ? "Uploading & Processing…" : "Start Ingestion"}
              </Button>
            </Box>
          </Paper>

          {/* Progress bar shown while uploading */}
          {uploading && (
            <LinearProgress sx={{ mt: 1.5, height: 6, borderRadius: 3 }} />
          )}

          {/* ── Status result card ── */}
          {statusData && (
            <Card
              sx={{ 
                mt: 4, 
                borderRadius: 4, 
                border: "1px solid", 
                borderColor: "divider",
                boxShadow: "0 6px 24px rgba(0,0,0,0.03)",
                bgcolor: "background.paper"
              }}
            >
              <CardContent sx={{ p: "24px !important" }}>
                {/* Summary row */}
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 3, mb: 3 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.5 }}>
                      STATUS
                    </Typography>
                    <StatusChip status={statusData.status} />
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.5 }}>
                      DATASET TYPE
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.primary" }}>
                      {statusData.dataset_type}
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)", border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"}` }}>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25 }}>
                      TOTAL ROWS
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: "monospace", color: "text.primary" }}>
                      {(statusData.accepted_count + statusData.rejected_count).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: theme.palette.mode === "dark" ? "rgba(16,185,129,0.03)" : "rgba(16,185,129,0.02)", border: `1px solid ${theme.palette.mode === "dark" ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.08)"}` }}>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25 }}>
                      ACCEPTED
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: "success.main", fontFamily: "monospace" }}>
                      {statusData.accepted_count.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: statusData.rejected_count > 0 ? (theme.palette.mode === "dark" ? "rgba(239,68,68,0.03)" : "rgba(239,68,68,0.02)") : (theme.palette.mode === "dark" ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.01)"), border: `1px solid ${statusData.rejected_count > 0 ? (theme.palette.mode === "dark" ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)") : (theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)")}` }}>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 700, display: "block", mb: 0.25 }}>
                      REJECTED
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        color: statusData.rejected_count > 0 ? "error.main" : "text.secondary",
                        fontFamily: "monospace"
                      }}
                    >
                      {statusData.rejected_count.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>

                {/* Errors */}
                {statusData.errors && statusData.errors.length > 0 && (
                  <Alert severity="error" variant="outlined" sx={{ borderRadius: 2.5 }}>
                    {statusData.errors.join("; ")}
                  </Alert>
                )}
              </CardContent>
            </Card>
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
          sx={{ width: "100%", borderRadius: 2.5 }}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}