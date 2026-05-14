import { useState, useRef } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, useTheme, Card, CardContent,
  Grid, Paper, CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  HistoryOutlined,
  SettingsInputComponentOutlined,
  PrecisionManufacturingOutlined,
  UploadFileOutlined,
  CheckCircleOutlined,
  ErrorOutlined,
  HourglassEmptyOutlined,
} from "@mui/icons-material";
import { api } from "../api/api";

type IngestType = "history" | "current" | "crane";

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
  current: [
    "unit_id", "actual_outbound_carrier_visit_id", "outbound_service",
    "current_position", "ctr_from_position", "ctr_to_position",
    "reefer", "hazardous_flag", "port_of_discharge",
  ],
  crane: [
    "crane_id", "unit_id", "carrier_visit", "move_kind",
    "from_position", "to_position", "time_completed", "line_op",
  ],
};

const TYPE_META = [
  {
    id: "history" as IngestType,
    label: "History Ingestion",
    icon: <HistoryOutlined />,
    desc: "Historical container moves for ML training.",
  },
  {
    id: "current" as IngestType,
    label: "Current Ingestion",
    icon: <SettingsInputComponentOutlined />,
    desc: "Live yard snapshot for operational analysis.",
  },
  {
    id: "crane" as IngestType,
    label: "Crane Ingestion",
    icon: <PrecisionManufacturingOutlined />,
    desc: "Crane move events for productivity tracking.",
  },
];

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary" }}>
          Data Ingestion
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Upload raw CSV data for History, Current inventory, or Crane movements.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* ── Sidebar ── */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TYPE_META.map((t) => (
              <Card
                key={t.id}
                onClick={() => {
                  if (isLoading) return;
                  setActiveType(t.id);
                  setFile(null);
                  setStatusData(null);
                }}
                sx={{
                  cursor: isLoading ? "not-allowed" : "pointer",
                  border: `2px solid ${activeType === t.id ? theme.palette.primary.main : "transparent"
                    }`,
                  bgcolor:
                    activeType === t.id
                      ? alpha(theme.palette.primary.main, 0.05)
                      : "background.paper",
                  transition: "all 0.2s",
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <CardContent
                  sx={{ display: "flex", alignItems: "flex-start", gap: 2, p: "16px !important" }}
                >
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: activeType === t.id ? "primary.main" : "action.hover",
                      color: activeType === t.id ? "white" : "text.secondary",
                    }}
                  >
                    {t.icon}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {t.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {t.desc}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Grid>

        {/* ── Upload area ── */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: "center" }}>
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
                borderColor: file ? "primary.main" : "divider",
                borderRadius: 2,
                p: 6,
                cursor: isLoading ? "not-allowed" : "pointer",
                bgcolor: file
                  ? alpha(theme.palette.primary.main, 0.02)
                  : "transparent",
                "&:hover": !isLoading
                  ? { bgcolor: alpha(theme.palette.primary.main, 0.05), borderColor: "primary.main" }
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
                sx={{ fontSize: 48, color: file ? "primary.main" : "text.disabled", mb: 2 }}
              />
              {file ? (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {file.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Click or drag to upload {activeType} data
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    CSV and Excel formats supported — headers are auto-mapped.
                  </Typography>
                </>
              )}
            </Box>

            {/* Schema hint + action */}
            <Box
              sx={{
                mt: 3,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <Box sx={{ textAlign: "left", flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "text.secondary", display: "block" }}
                >
                  EXPECTED HEADERS ({activeType.toUpperCase()}):
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                  {SCHEMAS[activeType].map((h) => (
                    <Chip
                      key={h}
                      label={h}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "10px", height: "20px" }}
                    />
                  ))}
                </Box>
              </Box>

              <Button
                variant="contained"
                size="large"
                disabled={!file || isLoading}
                onClick={handleIngest}
                startIcon={
                  uploading ? <CircularProgress size={16} color="inherit" /> : undefined
                }
                sx={{ px: 4, borderRadius: 2, alignSelf: "flex-end", whiteSpace: "nowrap" }}
              >
                {uploading ? "Uploading & Processing…" : "Start Ingestion"}
              </Button>
            </Box>
          </Paper>

          {/* Progress bar shown while uploading */}
          {uploading && (
            <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />
          )}

          {/* ── Status result card ── */}
          {statusData && (
            <Card
              sx={{ mt: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
            >
              <CardContent>
                {/* Summary row */}
                <Box sx={{ display: "flex", gap: 4, mb: 2, alignItems: "center", flexWrap: "wrap" }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      STATUS
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <StatusChip status={statusData.status} />
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      DATASET TYPE
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, textTransform: "uppercase" }}>
                      {statusData.dataset_type}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      TOTAL
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {(statusData.accepted_count + statusData.rejected_count).toLocaleString()}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      ACCEPTED
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: "success.main" }}>
                      {statusData.accepted_count.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      REJECTED
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        color: statusData.rejected_count > 0 ? "error.main" : "text.secondary",
                      }}
                    >
                      {statusData.rejected_count.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>

                {/* Errors */}
                {statusData.errors && statusData.errors.length > 0 && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {statusData.errors.join("; ")}
                  </Alert>
                )}

                {/* Rejection info is returned in error_summary in this mode */}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Snackbar
        open={toast.open}
        autoHideDuration={7000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}