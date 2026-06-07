import React, { useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  alpha,
  useTheme,
  Popover,
  ButtonGroup,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

interface StowageHeaderProps {
  vesselId: string;
  setVesselId: (val: string) => void;
  yardId: string;
  setYardId: (val: string) => void;
  visitId: string;
  setVisitId: (val: string) => void;
  activeTab: number;
  handleTabChange: (e: React.SyntheticEvent, next: number) => void;
  globalFile: File | null;
  setGlobalFile: (file: File | null) => void;
  globalContainerText: string;
  setGlobalContainerText: (val: string) => void;
  loading: boolean;
  handleSearchSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
}

export default function StowageHeader({
  vesselId,
  setVesselId,
  yardId,
  setYardId,
  visitId,
  setVisitId,
  activeTab,
  handleTabChange,
  globalFile,
  setGlobalFile,
  globalContainerText,
  setGlobalContainerText,
  loading,
  handleSearchSubmit,
}: StowageHeaderProps) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  return (
    <Paper
      elevation={0}
      sx={{
        px: { xs: 2.5, md: 4 },
        py: 2.5,
        bgcolor: alpha(theme.palette.background.default, 0.9),
        backdropFilter: "blur(25px)",
        borderRadius: 0,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSearchSubmit}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          width: "100%",
        }}
      >
        {/* Title row */}
        <Box sx={{ mb: 0.5 }}>
          <Box
            sx={{
              fontSize: "18px",
              fontWeight: "bold",
            }}
          >
            Stowage and Yard Planning
          </Box>
        </Box>

        {/* Inputs row */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(5, 1fr)",
              md: "repeat(5, 1fr)",
              lg:
                activeTab === 0
                  ? "2fr 1fr 1fr auto"
                  : "1fr auto 2fr auto",
            },
            gap: 1.5,
            alignItems: "center",
            width: "100%",
          }}
        >
          {/* Vessel ID search */}
          {activeTab === 0 ? (
            <TextField
              size="small"
              placeholder="Search Vessel ID"
              value={vesselId}
              onChange={(e) => setVesselId(e.target.value.toUpperCase())}
              disabled={loading}
              variant="outlined"
              sx={{
                width: "100%",
                gridColumn: { xs: "span 3", lg: "auto" },
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: "background.paper",
                  height: 36,
                  fontSize: "0.8rem",
                  "& fieldset": {
                    borderColor: alpha(theme.palette.divider, 0.8),
                  },
                  "&:hover fieldset": {
                    borderColor: theme.palette.primary.main,
                  },
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon
                        sx={{ color: "text.secondary", ml: 0.5, fontSize: 20 }}
                      />
                    </InputAdornment>
                  ),
                },
              }}
            />
          ) : null}

          {/* Yard ID input */}
          <TextField
            placeholder="Yard ID"
            size="small"
            value={yardId}
            onChange={(e) => setYardId(e.target.value.toUpperCase())}
            disabled={loading}
            sx={{
              width: "100%",
              gridColumn: { xs: "span 2", lg: "auto" },
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                height: 36,
                fontSize: "0.8rem",
              },
            }}
          />

          {/* Visit ID input */}
          {activeTab === 0 && (
            <TextField
              placeholder="Visit ID (Opt)"
              size="small"
              value={visitId}
              onChange={(e) => setVisitId(e.target.value.toUpperCase())}
              disabled={loading}
              sx={{
                width: "100%",
                gridColumn: { xs: "span 2", lg: "auto" },
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  height: 36,
                  fontSize: "0.8rem",
                },
              }}
            />
          )}

          {/* Upload Button */}
          {activeTab >= 1 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
                gridColumn: { xs: "span 2", lg: "auto" },
              }}
            >
              <ButtonGroup
                variant="outlined"
                sx={{
                  width: "100%",
                  height: 40,
                  borderRadius: 2,
                  "& .MuiButtonGroup-firstButton": {
                    borderTopLeftRadius: "inherit",
                    borderBottomLeftRadius: "inherit",
                  },
                  "& .MuiButtonGroup-lastButton": {
                    borderTopRightRadius: "inherit",
                    borderBottomRightRadius: "inherit",
                  },
                  "& .MuiButton-root": {
                    borderColor: globalFile ? "success.main" : "divider",
                  },
                }}
              >
                <Button
                  component="label"
                  startIcon={<CloudUploadIcon />}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    textTransform: "none",
                    fontWeight: 700,
                    color: globalFile ? "success.main" : "text.primary",
                    "&:hover": {
                      borderColor: globalFile ? "success.dark" : "primary.main",
                      bgcolor: alpha(theme.palette.primary.main, 0.04),
                    },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {globalFile ? globalFile.name : "Upload List"}
                  </Box>
                  <input
                    type="file"
                    accept=".txt,.json"
                    hidden
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setGlobalFile(e.target.files[0]);
                      }
                    }}
                  />
                </Button>

                {globalFile && (
                  <Button
                    onClick={() => setGlobalFile(null)}
                    sx={{
                      minWidth: 32,
                      px: 0,
                      color: "error.main",
                    }}
                  >
                    ×
                  </Button>
                )}

                <Button
                  onClick={(e) => setAnchorEl(e.currentTarget)}
                  sx={{
                    minWidth: 40,
                    px: 0,
                  }}
                >
                  <KeyboardArrowDownIcon sx={{ color: "text.secondary" }} />
                </Button>
              </ButtonGroup>

              <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "right",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                slotProps={{
                  paper: {
                    sx: {
                      p: 1.5,
                      mt: 0.5,
                      borderRadius: 2,
                      minWidth: 240,
                      bgcolor: "background.paper",
                    },
                  },
                }}
              >
                <TextField
                  placeholder="Or paste Container IDs..."
                  size="small"
                  multiline
                  maxRows={4}
                  value={globalContainerText}
                  onChange={(e) => setGlobalContainerText(e.target.value)}
                  sx={{
                    width: "100%",
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      fontSize: "0.85rem",
                      bgcolor: "background.paper",
                      "& fieldset": {
                        borderColor: alpha(theme.palette.divider, 0.8),
                      },
                      "&:hover fieldset": {
                        borderColor: theme.palette.primary.main,
                      },
                    },
                  }}
                />
              </Popover>
            </Box>
          )}

          {/* Action Submit Button */}
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !vesselId.trim()}
            sx={{
              borderRadius: 2,
              px: 2.5,
              py: 0.75,
              fontWeight: 700,
              textTransform: "none",
              fontSize: "0.8rem",
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}`,
              width: "100%",
              gridColumn: { xs: "span 3", lg: "auto" },
              height: 40,
              whiteSpace: "nowrap",
            }}
          >
            Analyze
          </Button>
        </Box>

        {/* View Switcher Toggles Row */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            mt: 0.5,
            mb: 0.5,
          }}
        >
          <ToggleButtonGroup
            value={activeTab}
            exclusive
            onChange={handleTabChange}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.divider, 0.05),
              borderRadius: 2.5,
              p: 0.3,
              border: "1px solid",
              borderColor: theme.palette.divider,
              height: 40,
              display: "flex",
              width: { xs: "100%", sm: "auto" },
              boxSizing: "border-box",
              "& .MuiToggleButton-root": {
                flex: 1,
                borderRadius: 2,
                px: { xs: 1, md: 4 },
                py: 0,
                height: "100%",
                border: "none",
                fontWeight: 700,
                textTransform: "none",
                color: "text.secondary",
                fontSize: { xs: "0.65rem", sm: "0.75rem" },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: { xs: 0.5, md: 1 },
                whiteSpace: "nowrap",
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": {
                    bgcolor: "primary.dark",
                  },
                },
                "&:hover": {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: "primary.main",
                },
              },
            }}
          >
            <ToggleButton value={0}>Historical Analysis</ToggleButton>
            <ToggleButton value={1}>Current Planning</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Paper>
  );
}
