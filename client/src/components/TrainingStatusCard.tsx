import { useState, useEffect } from "react";
import { Box, Card, CardContent, Typography, CircularProgress, Chip, Button, Divider } from "@mui/material";
import { CheckCircleOutlined, ErrorOutlined, InfoOutlined, ReplayOutlined } from "@mui/icons-material";
import { api } from "../api/api";

interface TrainingStatusData {
  status: "idle" | "training" | "completed" | "error";
  message: string;
  records_count?: number;
  data_source?: string;
  training_type?: string;
}

interface Props {
  onRetry?: () => void;
}

export default function TrainingStatusCard({ onRetry }: Props) {
  const [statusData, setStatusData] = useState<TrainingStatusData>({
    status: "idle",
    message: "No training in progress.",
  });

  const fetchStatus = async () => {
    try {
      const res = await api.get<TrainingStatusData>("/model/vessel-stay/training/status");
      setStatusData(res.data);
    } catch {
      // Silently ignore polling errors
    }
  };

  useEffect(() => {
    fetchStatus();
    let id: ReturnType<typeof setInterval> | undefined;
    if (statusData.status === "training") {
      id = setInterval(fetchStatus, 3000);
    }
    return () => { if (id) clearInterval(id); };
  }, [statusData.status]);

  const chipColor = {
    idle:      "default",
    training:  "warning",
    completed: "success",
    error:     "error",
  }[statusData.status] as "default" | "warning" | "success" | "error";

  const chipIcon = {
    idle:      <InfoOutlined sx={{ fontSize: "16px !important" }} />,
    training:  <CircularProgress size={12} color="inherit" />,
    completed: <CheckCircleOutlined sx={{ fontSize: "16px !important" }} />,
    error:     <ErrorOutlined sx={{ fontSize: "16px !important" }} />,
  }[statusData.status];

  const hasMetadata = statusData.records_count || statusData.data_source || statusData.training_type;

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", display: "block", mb: 2 }}
        >
          Training Status
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <Chip
              label={statusData.status.toUpperCase()}
              color={chipColor}
              size="small"
              icon={chipIcon}
              sx={{ fontWeight: 600, letterSpacing: "0.04em", flexShrink: 0 }}
            />
            <Typography variant="body2" sx={{ color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {statusData.message}
            </Typography>
          </Box>

          {statusData.status === "error" && onRetry && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<ReplayOutlined />}
              onClick={onRetry}
              sx={{ flexShrink: 0, fontSize: "0.75rem" }}
            >
              Retry
            </Button>
          )}
        </Box>

        {hasMetadata && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {statusData.records_count ? (
                <Box>
                  <Typography variant="overline" sx={{ color: "text.secondary", display: "block" }}>
                    Records
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 600 }}>
                    {statusData.records_count.toLocaleString()}
                  </Typography>
                </Box>
              ) : null}

              {statusData.data_source && (
                <Box>
                  <Typography variant="overline" sx={{ color: "text.secondary", display: "block" }}>
                    Source
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 600 }}>
                    {statusData.data_source === "db" ? "Database" : "Uploaded File"}
                  </Typography>
                </Box>
              )}

              {statusData.training_type && (
                <Box>
                  <Typography variant="overline" sx={{ color: "text.secondary", display: "block" }}>
                    Trigger
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 600, textTransform: "capitalize" }}>
                    {statusData.training_type}
                  </Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
