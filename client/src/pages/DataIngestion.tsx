import { useState, useRef } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, Divider, useTheme, Card, CardContent, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  HistoryOutlined,
  SettingsInputComponentOutlined,
  PrecisionManufacturingOutlined,
  UploadFileOutlined
} from "@mui/icons-material";
import { api } from "../api/api";

type IngestType = "history" | "current" | "crane";

interface IngestResult {
  status: string;
  dataset_type: string;
  accepted_count: number;
  rejected_count: number;
  ingestion_id: number;
  rejections: Array<{ row: any; reason: string }>;
}

export default function DataIngestion() {
  const theme = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeType, setActiveType] = useState<IngestType>("history");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" | "warning" }>({
    open: false, message: "", severity: "success",
  });

  const SCHEMAS = {
    history: [
      "unit_id", "actual_outbound_carrier_visit_id", "outbound_service",
      "move_complete_time", "time_in", "time_out", "ctr_from_position",
      "ctr_to_position", "verified_gross_mass_kg", "unit_weight_in_kg",
      "reefer", "hazardous_flag", "oog_unit", "port_of_discharge"
    ],
    current: [
      "unit_id", "actual_outbound_carrier_visit_id", "outbound_service",
      "ctr_from_position", "ctr_to_position", "move_complete_time",
      "reefer", "hazardous_flag", "port_of_discharge"
    ],
    crane: [
      "crane_id", "unit_id", "carrier_visit", "move_kind",
      "from_position", "to_position", "time_completed", "line_op"
    ]
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      setToast({ open: true, message: "Only CSV files are accepted.", severity: "error" });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleIngest = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await api.post<IngestResult>("/ingest/upload", form);
      setResult(res.data);

      if (res.data.status === "success" || res.data.status === "partial") {
        setToast({
          open: true,
          message: `Ingestion completed with ${res.data.accepted_count} rows accepted.`,
          severity: res.data.status === "success" ? "success" : "warning"
        });
        if (res.data.status === "success") setFile(null);
      }
    } catch (err: any) {
      setToast({
        open: true,
        message: err.response?.data?.detail || "Ingestion failed.",
        severity: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", p: 2 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary" }}>
          Data Ingestion
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Upload raw CSV data using fixed schemas for History, Current, and Crane movements.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Sidebar Selection */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { id: "history", label: "History Ingestion", icon: <HistoryOutlined />, desc: "Historical container moves for ML training." },
              { id: "current", label: "Current Ingestion", icon: <SettingsInputComponentOutlined />, desc: "Live yard snapshot for operational analysis." },
              { id: "crane", label: "Crane Ingestion", icon: <PrecisionManufacturingOutlined />, desc: "Crane move events for productivity tracking." }
            ].map((t) => (
              <Card
                key={t.id}
                onClick={() => { setActiveType(t.id as IngestType); setFile(null); setResult(null); }}
                sx={{
                  cursor: "pointer",
                  border: `2px solid ${activeType === t.id ? theme.palette.primary.main : "transparent"}`,
                  bgcolor: activeType === t.id ? alpha(theme.palette.primary.main, 0.05) : "background.paper",
                  transition: "all 0.2s"
                }}
              >
                <CardContent sx={{ display: "flex", alignItems: "flex-start", gap: 2, p: "16px !important" }}>
                  <Box sx={{
                    p: 1, borderRadius: 1,
                    bgcolor: activeType === t.id ? "primary.main" : "action.hover",
                    color: activeType === t.id ? "white" : "text.secondary"
                  }}>
                    {t.icon}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t.label}</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>{t.desc}</Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Grid>

        {/* Upload Area */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: "center" }}>
            <Box
              onClick={() => fileRef.current?.click()}
              sx={{
                border: "2px dashed",
                borderColor: file ? "primary.main" : "divider",
                borderRadius: 2,
                p: 6,
                cursor: "pointer",
                bgcolor: file ? alpha(theme.palette.primary.main, 0.02) : "transparent",
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05), borderColor: "primary.main" }
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <UploadFileOutlined sx={{ fontSize: 48, color: file ? "primary.main" : "text.disabled", mb: 2 }} />
              {file ? (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{file.name}</Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>{(file.size / 1024).toFixed(1)} KB</Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Click to upload {activeType} CSV</Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>File must exactly match the required headers.</Typography>
                </>
              )}
            </Box>

            <Box sx={{ mt: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ textAlign: "left" }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block" }}>REQUIRED HEADERS:</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                  {SCHEMAS[activeType].map(h => <Chip key={h} label={h} size="small" variant="outlined" sx={{ fontSize: "10px", height: "20px" }} />)}
                </Box>
              </Box>
              <Button
                variant="contained"
                size="large"
                disabled={!file || loading}
                onClick={handleIngest}
                sx={{ px: 4, borderRadius: 2 }}
              >
                {loading ? "Processing..." : "Start Ingestion"}
              </Button>
            </Box>
          </Paper>

          {loading && <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />}

          {/* Results section */}
          {result && (
            <Card sx={{ mt: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Box sx={{ display: "flex", gap: 4, mb: 3 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>STATUS</Typography>
                    <Typography variant="h6" color={result.status === "success" ? "success.main" : "warning.main"} sx={{ fontWeight: 800, color: result.status }}>
                      {result.status.toUpperCase()}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>ACCEPTED</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{result.accepted_count}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>REJECTED</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: "error.main" }}>{result.rejected_count}</Typography>
                  </Box>
                </Box>

                {result.rejections.length > 0 && (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "error.main", mb: 1 }}>Rejection Samples (First 10)</Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={{ fontWeight: 700 }}>Row Content</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {result.rejections.map((rej, idx) => (
                            <TableRow key={idx}>
                              <TableCell sx={{ fontSize: "11px", fontFamily: "monospace" }}>{JSON.stringify(rej.row)}</TableCell>
                              <TableCell sx={{ fontSize: "11px", color: "error.main", fontWeight: 600 }}>{rej.reason}</TableCell>
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

      <Snackbar open={toast.open} autoHideDuration={6000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} sx={{ width: "100%" }} variant="filled" onClose={() => setToast(t => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
