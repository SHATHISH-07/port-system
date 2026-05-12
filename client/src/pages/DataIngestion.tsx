import { useState, useRef, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, Divider, useTheme, Card, CardContent,
  Grid, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, CircularProgress,
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
  status: string;           // "processing" | "success" | "partial" | "failed"
  dataset_type: string;
  accepted_count: number;
  rejected_count: number;
  ingestion_id: string;     // UUID string — NOT a number
  message?: string;
  rejections?: Array<{ row: any; reason: string }>;
}

interface StatusResponse {
  id: string;
  filename: string;
  dataset_type: string;
  status: string;           // "processing" | "success" | "partial" | "failed"
  records_total: number;
  records_accepted: number;
  records_rejected: number;
  completed_at: string | null;
  error_summary: string | null;
}

interface RejectionRow {
  row_data: any;
  reason: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 60;   // 60 × 2.5s = 2.5 min timeout

const SCHEMAS: Record<IngestType, string[]> = {
  history: [
    "Unit ID", "Actual Outbound Carrier visit ID", "Outbound Service",
    "Move Complete Time", "Time In", "Time Out",
    "Ctr From Position", "Ctr To Position",
    "Unit Weight in kg", "Verified Gross Mass (Kg)",
    "Reefer", "Hazardous Flag", "OOG Unit", "Port of Discharge",
  ],
  current: [
    "Unit ID", "Actual Outbound Carrier visit ID", "Outbound Service",
    "Current Position", "Ctr From Position", "Ctr To Position",
    "Move Complete Time", "Reefer", "Hazardous Flag", "Port of Discharge",
  ],
  crane: [
    "Crane CHE", "Unit Nbr", "Carrier Visit", "Move Kind",
    "From Position", "To Position", "Time Completed", "Line Op",
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
  const [polling, setPolling] = useState(false);
  const [ingestionId, setIngestionId] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [rejections, setRejections] = useState<RejectionRow[]>([]);
  const [toast, setToast] = useState<{
    open: boolean; message: string; severity: "success" | "error" | "warning" | "info";
  }>({ open: false, message: "", severity: "success" });

  const showToast = (message: string, severity: typeof toast.severity) =>
    setToast({ open: true, message, severity });

  // ── Polling logic ──────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async (id: string) => {
    const res = await api.get<StatusResponse>(`/ingest/status/${id}`);
    return res.data;
  }, []);

  const fetchRejections = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ rejections: RejectionRow[] }>(`/ingest/rejections/${id}`);
      setRejections(res.data.rejections ?? []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (!ingestionId || !polling) return;

    let polls = 0;
    const interval = setInterval(async () => {
      polls += 1;
      try {
        const data = await fetchStatus(ingestionId);
        setStatusData(data);

        const done = data.status !== "processing";
        if (done || polls >= MAX_POLLS) {
          clearInterval(interval);
          setPolling(false);
          if (done) {
            await fetchRejections(ingestionId);
            if (data.status === "success") {
              showToast(`Ingestion complete — ${data.records_accepted.toLocaleString()} rows accepted.`, "success");
              setFile(null);
            } else if (data.status === "partial") {
              showToast(`Partially ingested — ${data.records_accepted.toLocaleString()} accepted, ${data.records_rejected.toLocaleString()} rejected.`, "warning");
            } else {
              showToast(data.error_summary ?? "Ingestion failed.", "error");
            }
          } else {
            showToast("Ingestion timed out waiting for completion.", "warning");
          }
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
        showToast("Lost connection while polling ingestion status.", "error");
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [ingestionId, polling, fetchStatus, fetchRejections]);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      showToast("Only CSV files are accepted.", "error");
      return;
    }
    setFile(f);
    setStatusData(null);
    setRejections([]);
    setIngestionId(null);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleIngest = async () => {
    if (!file) return;
    setUploading(true);
    setStatusData(null);
    setRejections([]);
    setIngestionId(null);

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

      if (data.status === "failed") {
        showToast(data.rejections?.[0]?.reason ?? "Upload rejected.", "error");
        setUploading(false);
        return;
      }

      // Backend accepted the file and is processing in the background
      setIngestionId(data.ingestion_id);

      // Seed status display immediately with what we know
      setStatusData({
        id: data.ingestion_id,
        filename: file.name,
        dataset_type: data.dataset_type,
        status: "processing",
        records_total: 0,
        records_accepted: 0,
        records_rejected: 0,
        completed_at: null,
        error_summary: null,
      });

      setPolling(true);
      showToast("File uploaded. Processing in background…", "info");
    } catch (err: any) {
      showToast(err.response?.data?.detail ?? "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  const isLoading = uploading || polling;

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
        <Grid item xs={12} md={4}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TYPE_META.map((t) => (
              <Card
                key={t.id}
                onClick={() => {
                  if (isLoading) return;
                  setActiveType(t.id);
                  setFile(null);
                  setStatusData(null);
                  setRejections([]);
                  setIngestionId(null);
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
        <Grid item xs={12} md={8}>
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
                accept=".csv"
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
                    Click or drag to upload {activeType} CSV
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    File headers are auto-mapped — exact match not required.
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
                {uploading ? "Uploading…" : polling ? "Processing…" : "Start Ingestion"}
              </Button>
            </Box>
          </Paper>

          {/* Progress bar shown while polling */}
          {(uploading || polling) && (
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
                      {statusData.records_total.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      ACCEPTED
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: "success.main" }}>
                      {statusData.records_accepted.toLocaleString()}
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
                        color: statusData.records_rejected > 0 ? "error.main" : "text.secondary",
                      }}
                    >
                      {statusData.records_rejected.toLocaleString()}
                    </Typography>
                  </Box>

                  {polling && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Waiting for background task…
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Error summary */}
                {statusData.error_summary && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {statusData.error_summary}
                  </Alert>
                )}

                {/* Rejection samples */}
                {rejections.length > 0 && (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: "error.main", mb: 1 }}
                    >
                      Rejection Samples (first {rejections.length})
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={{ fontWeight: 700 }}>Row Data</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rejections.map((rej, idx) => (
                            <TableRow key={idx}>
                              <TableCell
                                sx={{ fontSize: "11px", fontFamily: "monospace", maxWidth: 300, wordBreak: "break-all" }}
                              >
                                {typeof rej.row_data === "string"
                                  ? rej.row_data
                                  : JSON.stringify(rej.row_data)}
                              </TableCell>
                              <TableCell
                                sx={{ fontSize: "11px", color: "error.main", fontWeight: 600 }}
                              >
                                {rej.reason}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
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