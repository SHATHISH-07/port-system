import { useState, useRef } from "react";
import {
  Box, Typography, Button, LinearProgress,
  Alert, Snackbar, Chip, Divider, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { UploadFileOutlined, CheckCircleOutlined, ErrorOutlined, } from "@mui/icons-material";
import { api } from "../api/api";

interface IngestResult {
  status: string;
  records_processed: number;
  history_rows_saved: number;
  current_rows_saved: number;
  errors: string[];
  message: string;
}

export default function DataIngestion() {
  const theme = useTheme();

  const [file, setFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [mode, setMode] = useState<"file" | "json">("file");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" | "warning" }>({
    open: false, message: "", severity: "success",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      setToast({ open: true, message: "Only CSV files are accepted.", severity: "error" });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleIngest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      if (mode === "file" && file) {
        form.append("file", file);
      } else if (mode === "json" && jsonText.trim()) {
        form.append("json_data", jsonText.trim());
      } else {
        setToast({ open: true, message: "Please provide a CSV file or JSON data.", severity: "error" });
        setLoading(false);
        return;
      }
      const res = await api.post<IngestResult>("/ingest/vessel-data", form);
      setResult(res.data);
      if (res.data.status === "ok") {
        setToast({ open: true, message: res.data.message, severity: "success" });
        setFile(null);
        setJsonText("");
      } else {
        setToast({ open: true, message: res.data.message, severity: "warning" });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Ingestion failed. Please try again.";
      setToast({ open: true, message: msg, severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  const isReady = mode === "file" ? !!file : jsonText.trim().length > 0;

  return (
    <Box sx={{ maxWidth: 760, mx: "auto" }}>

      {/* Page description */}
      <Box sx={{ mb: 4, pb: 3, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="h5" sx={{ mb: 0.5, color: "text.primary" }}>
          Data Ingestion
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 520 }}>
          Upload container movement records via CSV file or JSON. Data is automatically saved
          to both the history (training) table and the current (live) table.
        </Typography>
      </Box>

      {/* Mode toggle */}
      <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
        {(["file", "json"] as const).map((m) => (
          <Chip
            key={m}
            label={m === "file" ? "CSV File" : "JSON"}
            variant={mode === m ? "filled" : "outlined"}
            color={mode === m ? "primary" : "default"}
            onClick={() => { setMode(m); setResult(null); }}
            sx={{ fontWeight: 600, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}
          />
        ))}
      </Box>

      {/* Main card */}
      <Box
        sx={{
          bgcolor: "background.paper",
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {/* CSV file mode */}
        {mode === "file" && (
          <Box sx={{ p: 3 }}>
            <Box
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              sx={{
                border: `2px dashed ${isDragging ? theme.palette.primary.main : theme.palette.divider}`,
                borderRadius: 2,
                p: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 200ms ease",
                bgcolor: isDragging
                  ? alpha(theme.palette.primary.main, 0.04)
                  : "transparent",
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                  bgcolor: alpha(theme.palette.primary.main, 0.03),
                },
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <UploadFileOutlined sx={{ fontSize: 40, color: "text.disabled", mb: 1.5 }} />
              {file ? (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.disabled", mt: 0.5 }}>
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                    Drop a CSV file here or click to browse
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.disabled", mt: 0.5 }}>
                    Required columns: vessel_id, move_complete_time, time_in, time_out, …
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        )}

        {/* JSON mode */}
        {mode === "json" && (
          <Box sx={{ p: 3 }}>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
              Paste JSON array or single object
            </Typography>
            <Box
              component="textarea"
              value={jsonText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJsonText(e.target.value)}
              placeholder={`[\n  {\n    "outbound_service": "SERVICE_A",\n    "actual_outbound_carrier_visit_id": "VISIT_001",\n    ...\n  }\n]`}
              sx={{
                width: "100%",
                minHeight: 200,
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: "0.8125rem",
                p: 1.5,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1.5,
                bgcolor: theme.palette.mode === "dark"
                  ? alpha(theme.palette.common.white, 0.04)
                  : alpha(theme.palette.common.black, 0.02),
                color: "text.primary",
                outline: "none",
                "&:focus": { borderColor: "primary.main" },
                boxSizing: "border-box",
              }}
            />
          </Box>
        )}

        {loading && <LinearProgress />}

        <Divider />

        {/* Footer actions */}
        <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1.5 }}>
          {file && mode === "file" && (
            <Button variant="text" size="small" sx={{ color: "text.secondary" }}
              onClick={() => { setFile(null); setResult(null); }}>
              Clear
            </Button>
          )}
          <Button
            variant="contained"
            disabled={loading || !isReady}
            onClick={handleIngest}
            sx={{ minWidth: 140 }}
          >
            {loading ? "Ingesting…" : "Ingest Data"}
          </Button>
        </Box>

        {/* Result summary */}
        {result && (
          <Box sx={{ px: 3, pb: 3, pt: 0 }}>
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                bgcolor: result.status === "ok"
                  ? alpha(theme.palette.success.main, 0.06)
                  : alpha(theme.palette.warning.main, 0.06),
                border: `1px solid ${result.status === "ok"
                  ? alpha(theme.palette.success.main, 0.2)
                  : alpha(theme.palette.warning.main, 0.2)}`,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                {result.status === "ok"
                  ? <CheckCircleOutlined sx={{ color: "success.main", fontSize: 20 }} />
                  : <ErrorOutlined sx={{ color: "warning.main", fontSize: 20 }} />}
                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                  {result.message}
                </Typography>
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                {[
                  { label: "Records Processed", value: result.records_processed },
                  { label: "History Rows Saved", value: result.history_rows_saved },
                  { label: "Current Rows Saved", value: result.current_rows_saved },
                ].map(({ label, value }) => (
                  <Box key={label}>
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>{label}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary", fontFamily: "monospace" }}>
                      {value.toLocaleString()}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {result.errors.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {result.errors.map((e, i) => (
                    <Typography key={i} variant="caption" sx={{ display: "block", color: "error.main", fontFamily: "monospace" }}>
                      • {e}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Schema reference */}
      <Box
        sx={{
          mt: 3, p: 2.5,
          bgcolor: theme.palette.mode === "dark"
            ? alpha(theme.palette.common.white, 0.03)
            : alpha(theme.palette.common.black, 0.02),
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
        }}
      >
        <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
          Required CSV Columns
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {["move_complete_time", "time_in", "time_out", "outbound_service",
            "actual_outbound_carrier_visit_id", "unit_id"].map((col) => (
              <Chip key={col} label={col} size="small"
                sx={{ fontFamily: "monospace", fontSize: "0.75rem", bgcolor: "background.paper" }} />
            ))}
        </Box>
        <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 1.5 }}>
          Extra columns are accepted and ignored. Rows with null primary keys are dropped automatically.
        </Typography>
      </Box>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
