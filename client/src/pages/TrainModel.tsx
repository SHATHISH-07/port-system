import { useState } from "react";
import {
  Box, Typography, Button, RadioGroup, FormControlLabel, Radio,
  Card, CardContent, Divider, Snackbar, Alert, Checkbox,
} from "@mui/material";
import { StorageOutlined, UploadFileOutlined, PlayArrowRounded } from "@mui/icons-material";
import FileUpload from "../components/FileUpload";
import TrainingStatusCard from "../components/TrainingStatusCard";
import { api } from "../api/api";

export default function TrainModel() {
  const [dataSource, setDataSource] = useState<"db" | "file">("db");
  const [file,       setFile]       = useState<File | null>(null);
  const [updateDb,   setUpdateDb]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [toast, setToast] = useState<{
    open: boolean; message: string; severity: "success" | "error" | "info" | "warning";
  }>({ open: false, message: "", severity: "info" });

  const showToast = (message: string, severity: typeof toast.severity = "info") =>
    setToast({ open: true, message, severity });

  const handleCloseToast = () => setToast((p) => ({ ...p, open: false }));

  const handleTrain = async () => {
    if (dataSource === "file" && !file) {
      showToast("Please upload a CSV file.", "warning");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("data_source", dataSource);
      form.append("update_db", String(updateDb));
      if (dataSource === "file" && file) form.append("file", file);

      const res = await api.post("/model/vessel-stay/training", form);
      if (res.data.status === "error") {
        showToast(res.data.message, "error");
      } else {
        showToast(res.data.message, "success");
        if (dataSource === "file") setFile(null);
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || err?.response?.data?.detail || "Failed to start training",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const radioSx = {
    color: "text.disabled",
    "&.Mui-checked": { color: "primary.main" },
  };

  return (
    <Box>
      {/* ─── Page Header ─── */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: "text.primary", mb: 0.5 }}>
          Train Vessel Stay Model
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Configure a new training run using historical database records or an uploaded CSV dataset.
        </Typography>
      </Box>

      {/* ─── Configuration Card ─── */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 2.5 }}>
            Data Source
          </Typography>

          <RadioGroup
            value={dataSource}
            onChange={(e) => {
              setDataSource(e.target.value as "db" | "file");
              if (e.target.value === "db") setUpdateDb(false);
            }}
            sx={{ gap: 0.5 }}
          >
            <FormControlLabel
              value="db"
              control={<Radio size="small" sx={radioSx} />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <StorageOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                      Use Database
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Load from the existing history table
                    </Typography>
                  </Box>
                </Box>
              }
              sx={{ mr: 0, py: 0.75 }}
            />
            <FormControlLabel
              value="file"
              control={<Radio size="small" sx={radioSx} />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <UploadFileOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                      Upload CSV File
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Train directly from an uploaded dataset
                    </Typography>
                  </Box>
                </Box>
              }
              sx={{ mr: 0, py: 0.75 }}
            />
          </RadioGroup>

          {/* File upload + DB option */}
          {dataSource === "file" && (
            <Box sx={{ mt: 3, ml: 0.5 }}>
              <FileUpload onFileSelect={setFile} label="Drop your CSV dataset here" />
              <Box sx={{ mt: 1.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={updateDb}
                      onChange={(e) => setUpdateDb(e.target.checked)}
                      sx={{ color: "text.disabled", "&.Mui-checked": { color: "primary.main" } }}
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Also save uploaded data to the history database
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="contained"
              size="medium"
              disabled={loading || (dataSource === "file" && !file)}
              onClick={handleTrain}
              startIcon={<PlayArrowRounded />}
              sx={{ px: 3 }}
            >
              {loading ? "Starting…" : "Start Training"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <TrainingStatusCard onRetry={handleTrain} />

      <Snackbar
        open={toast.open}
        autoHideDuration={6000}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseToast}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
