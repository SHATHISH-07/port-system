import { useState, useRef } from "react";
import { api } from "../api/api";
import {
  Container, Paper, Typography, Box, Button, Alert,
  CircularProgress
} from "@mui/material";
import { CloudUpload, InsertDriveFile } from "@mui/icons-material";

const TrainModel = () => {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ ONLY STAY MODEL (matches backend)
  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/model/train-stay", formData);

      setMessage({
        text: res.data.message || "Training started successfully.",
        type: "success"
      });

      setTraining(true); // start polling
      pollStatus();

    } catch (error) {
      setMessage({
        text: "Failed to start training. Please check the file.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ POLL TRAINING STATUS
  const pollStatus = async () => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get("/model/status");

        if (res.data.status === "completed") {
          setMessage({ text: "Model training completed successfully.", type: "success" });
          setTraining(false);
          clearInterval(interval);
        }

        if (res.data.status === "failed") {
          setMessage({ text: res.data.message || "Training failed.", type: "error" });
          setTraining(false);
          clearInterval(interval);
        }

      } catch (err) {
        console.error("Status check failed");
        clearInterval(interval);
      }
    }, 3000);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={0} sx={{ p: 5, border: "1px solid #e0e0e0", borderRadius: 2 }}>

        {/* HEADER */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            Model Training Hub
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            Upload historical CSV data to retrain the stay prediction model.
          </Typography>
        </Box>

        {/* FILE UPLOAD */}
        <Box
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: "2px dashed #ccc",
            borderRadius: 2,
            p: 6,
            textAlign: "center",
            bgcolor: "#fafafa",
            cursor: "pointer",
            "&:hover": { bgcolor: "#f0f0f0", borderColor: "primary.main" },
            mb: 4
          }}
        >
          <input
            type="file"
            accept=".csv"
            hidden
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {file ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <InsertDriveFile color="primary" sx={{ fontSize: 48 }} />
              <Typography sx={{ fontWeight: "bold" }}>
                {file.name}
              </Typography>
              <Typography variant="caption">
                Ready to train
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <CloudUpload sx={{ fontSize: 48, color: "text.secondary" }} />
              <Typography sx={{ fontWeight: "bold" }}>
                Click to upload CSV file
              </Typography>
              <Typography variant="caption">
                Only CSV files supported
              </Typography>
            </Box>
          )}
        </Box>

        {/* ACTION */}
        <Button
          fullWidth
          variant="contained"
          disableElevation
          size="large"
          disabled={!file || loading || training}
          onClick={handleUpload}
          sx={{ py: 1.5, fontWeight: "bold", mb: 3 }}
        >
          {loading
            ? <CircularProgress size={24} color="inherit" />
            : training
              ? "Training in progress..."
              : "Train Stay Time Model"}
        </Button>

        {/* MESSAGE */}
        {message && (
          <Alert severity={message.type} variant="outlined">
            {message.text}
          </Alert>
        )}

      </Paper>
    </Container>
  );
};

export default TrainModel;