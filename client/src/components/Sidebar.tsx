import { useState } from "react";
import { Box, Typography, Tooltip, IconButton, useTheme } from "@mui/material";
import {
  AnalyticsOutlined,
  GridViewOutlined,
  HistoryOutlined,
  ModelTrainingOutlined,
  MenuRounded,
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";

const OPEN = 248;
const CLOSED = 56;

const NAV_ITEMS = [
  { path: "/history-analysis", label: "History Analysis",  icon: HistoryOutlined },
  { path: "/current-analysis", label: "Current Analysis",  icon: AnalyticsOutlined },
  { path: "/heatmap",          label: "Terminal Heatmap",  icon: GridViewOutlined },
  { path: "/train-model",      label: "Train Model",       icon: ModelTrainingOutlined },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const loc = useLocation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      component="nav"
      sx={{
        width: open ? OPEN : CLOSED,
        minHeight: "100vh",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        borderRight: `1px solid ${theme.palette.divider}`,
        transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        zIndex: 200,
      }}
    >
      {/* ─── Brand / Toggle ─── */}
      <Box
        sx={{
          height: 56,
          display: "flex",
          alignItems: "center",
          px: open ? 1.5 : 0.75,
          gap: 1,
          flexShrink: 0,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Tooltip title={open ? "Collapse sidebar" : "Expand sidebar"} placement="right">
          <IconButton
            onClick={() => setOpen((v) => !v)}
            size="small"
            sx={{ width: 36, height: 36, flexShrink: 0, color: "text.secondary" }}
          >
            <MenuRounded sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        {open && (
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              color: "text.primary",
              whiteSpace: "nowrap",
              letterSpacing: "-0.2px",
            }}
          >
            PortSync
          </Typography>
        )}
      </Box>

      {/* ─── Navigation Items ─── */}
      <Box sx={{ flex: 1, py: 1.5, overflowY: "auto", overflowX: "hidden" }}>
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = loc.pathname === path;
          return (
            <Tooltip key={path} title={!open ? label : ""} placement="right" arrow>
              <Box
                component={Link}
                to={path}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  height: 38,
                  px: open ? 1.75 : 0,
                  mx: 0.75,
                  mb: 0.5,
                  borderRadius: "8px",
                  textDecoration: "none",
                  justifyContent: open ? "flex-start" : "center",
                  transition: "background-color 150ms",
                  bgcolor: active
                    ? isDark
                      ? "rgba(110,168,254,0.12)"
                      : "rgba(26,115,232,0.08)"
                    : "transparent",
                  "&:hover": {
                    bgcolor: active
                      ? isDark ? "rgba(110,168,254,0.18)" : "rgba(26,115,232,0.12)"
                      : isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                  },
                }}
              >
                <Icon
                  sx={{
                    fontSize: 20,
                    flexShrink: 0,
                    color: active ? "primary.main" : "text.secondary",
                    transition: "color 150ms",
                  }}
                />
                {open && (
                  <Typography
                    sx={{
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 400,
                      color: active ? "primary.main" : "text.primary",
                      whiteSpace: "nowrap",
                      lineHeight: 1,
                      transition: "color 150ms",
                    }}
                  >
                    {label}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}