import * as React from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  Paper,
  Stack,
  useTheme,
} from "@mui/material";
import {
  UploadFileOutlined,
  ClearRounded,
  SearchRounded,
  CloseRounded,
} from "@mui/icons-material";

export interface HeatmapControlsProps {
  yardInput: string;
  setYardInput: (val: string) => void;
  vesselInput: string;
  setVesselInput: (val: string) => void;
  loadMovesInput: number | "";
  setLoadMovesInput: (val: number | "") => void;
  dischargeMovesInput: number | "";
  setDischargeMovesInput: (val: number | "") => void;
  containerFile: File | null;
  setContainerFile: (val: File | null) => void;
  loading: boolean;
  onAnalyze: () => void;
  inputsOpen: boolean;
  setInputsOpen: (val: boolean) => void;
  mapView: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function HeatmapControls({
  yardInput,
  setYardInput,
  vesselInput,
  setVesselInput,
  loadMovesInput,
  setLoadMovesInput,
  dischargeMovesInput,
  setDischargeMovesInput,
  containerFile,
  setContainerFile,
  loading,
  onAnalyze,
  inputsOpen,
  setInputsOpen,
  mapView,
  fileInputRef,
}: HeatmapControlsProps) {
  const theme = useTheme();

  return (
    <Paper
      elevation={6}
      sx={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 10,
        bgcolor: "background.paper",
        borderRadius: 1,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        width: inputsOpen ? { xs: 200, md: 240, lg: 220 } : "auto",
        border: "1px solid",
        borderColor: theme.palette.divider,
        boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
        display: mapView === "CONTAINERS" ? { xs: "none", md: "block" } : "block",
      }}
    >
      {!inputsOpen ? (
        <Box
          sx={{
            px: { xs: 1, md: 1.2 },
            py: { xs: 0.6, md: 0.8 },
            display: "flex",
            alignItems: "center",
            gap: 1,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
          onClick={() => setInputsOpen(true)}
        >
          <SearchRounded sx={{ fontSize: { xs: 16, md: 18 }, color: "primary.main" }} />
          <Typography
            variant="body2"
            sx={{
              fontSize: { xs: "0.65rem", md: "0.7rem" },
              fontWeight: 800,
              letterSpacing: 0.5,
            }}
          >
            Heatmap Input
          </Typography>
        </Box>
      ) : (
        <Box sx={{ p: { xs: 1, md: 1.2 } }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: { xs: 0.8, md: 1 },
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontSize: { xs: "0.7rem", md: "0.75rem" },
                fontWeight: 600,
                letterSpacing: "0.05em",
              }}
            >
              Heatmap Analysis
            </Typography>
            <IconButton
              size="small"
              onClick={() => setInputsOpen(false)}
              sx={{ mr: -0.5 }}
            >
              <CloseRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Stack spacing={{ xs: 0.6, md: 1 }}>
            <TextField
              size="small"
              fullWidth
              label="Vessel ID / Visit ID"
              value={vesselInput}
              onChange={(e) => setVesselInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  height: { xs: 30, md: 32 },
                },
              }}
              slotProps={{
                htmlInput: { style: { fontSize: "0.75rem" } },
                inputLabel: { style: { fontSize: "0.75rem" } },
              }}
            />
            <TextField
              size="small"
              fullWidth
              label="Yard ID"
              value={yardInput}
              onChange={(e) => setYardInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  height: { xs: 30, md: 32 },
                },
              }}
              slotProps={{
                htmlInput: { style: { fontSize: "0.75rem" } },
                inputLabel: { style: { fontSize: "0.75rem" } },
              }}
            />

            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                fullWidth
                type="number"
                label="Load"
                value={loadMovesInput}
                onChange={(e) => setLoadMovesInput(e.target.value === "" ? "" : Number(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    height: { xs: 30, md: 32 },
                  },
                }}
                slotProps={{
                  htmlInput: { style: { fontSize: "0.75rem" } },
                  inputLabel: { style: { fontSize: "0.75rem" } },
                }}
              />
              <TextField
                size="small"
                fullWidth
                type="number"
                label="Discharge"
                value={dischargeMovesInput}
                onChange={(e) => setDischargeMovesInput(e.target.value === "" ? "" : Number(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    height: { xs: 30, md: 32 },
                  },
                }}
                slotProps={{
                  htmlInput: { style: { fontSize: "0.75rem" } },
                  inputLabel: { style: { fontSize: "0.75rem" } },
                }}
              />
            </Stack>

            <Box>
              <Button
                fullWidth
                component="label"
                variant="outlined"
                startIcon={<UploadFileOutlined sx={{ fontSize: { xs: 14, md: 16 } }} />}
                sx={{
                  borderRadius: 2,
                  fontSize: { xs: "0.65rem", md: "0.7rem" },
                  py: { xs: 0.2, md: 0.4 },
                  fontWeight: 500,
                  textTransform: "none",
                  justifyContent: "flex-start",
                  color: "text.primary",
                  borderColor: "divider",
                }}
              >
                <Typography
                  noWrap
                  sx={{
                    fontSize: { xs: "0.65rem", md: "0.7rem" },
                    maxWidth: { xs: 140, md: 160 },
                  }}
                >
                  {containerFile ? containerFile.name : "Upload Container List"}
                </Typography>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept=".txt,.csv,.json"
                  onChange={(e) => setContainerFile(e.target.files?.[0] || null)}
                />
              </Button>
              {containerFile && (
                <Button
                  size="small"
                  onClick={() => {
                    setContainerFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  startIcon={<ClearRounded sx={{ fontSize: 12 }} />}
                  sx={{ mt: 0.25, py: 0, fontSize: "0.65rem" }}
                >
                  Clear File
                </Button>
              )}
            </Box>
            <Button
              variant="contained"
              fullWidth
              onClick={onAnalyze}
              disabled={loading}
              sx={{
                borderRadius: 2,
                fontWeight: 800,
                py: { xs: 0.4, md: 0.6 },
                fontSize: { xs: "0.65rem", md: "0.75rem" },
              }}
            >
              {loading ? "Analyzing..." : "Analyze"}
            </Button>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
