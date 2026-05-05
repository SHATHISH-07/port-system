import React from "react";
import { Box, Typography, IconButton, Tooltip, useTheme } from "@mui/material";
import { DarkModeOutlined, LightModeOutlined } from "@mui/icons-material";
import Sidebar from "./Sidebar";
import { useLocation } from "react-router-dom";
import { useColorMode } from "../theme/ThemeContext";

interface LayoutProps { children: React.ReactNode; }

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/history-analysis": { title: "History Analysis",   subtitle: "Vessel stay time patterns from historical records" },
  "/current-analysis": { title: "Current Analysis",   subtitle: "Live vessel status and predictions" },
  "/heatmap":          { title: "Terminal Heatmap",   subtitle: "Yard block container concentration" },
  "/train-model":      { title: "Train Model",        subtitle: "Configure and trigger model training runs" },
};

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const { mode, toggleColorMode } = useColorMode();
  const theme = useTheme();
  const page = PAGE_TITLES[pathname] ?? { title: "PortSync", subtitle: "" };

  const isDark = mode === "dark";

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      <Sidebar />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minWidth: 0 }}>
        {/* ─── Top Header Bar ─── */}
        <Box
          component="header"
          sx={{
            height: 56,
            px: { xs: 3, md: 4 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: "background.paper",
            borderBottom: `1px solid ${theme.palette.divider}`,
            flexShrink: 0,
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          {/* Page title */}
          <Box>
            <Typography
              sx={{
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: "text.primary",
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
              }}
            >
              {page.title}
            </Typography>
            {page.subtitle && (
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.3 }}>
                {page.subtitle}
              </Typography>
            )}
          </Box>

          {/* Right-side actions */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Tooltip title={isDark ? "Switch to Light mode" : "Switch to Dark mode"} placement="bottom">
              <IconButton
                onClick={toggleColorMode}
                size="small"
                sx={{
                  width: 34,
                  height: 34,
                  color: "text.secondary",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {isDark
                  ? <LightModeOutlined sx={{ fontSize: 18 }} />
                  : <DarkModeOutlined  sx={{ fontSize: 18 }} />
                }
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* ─── Page Content ─── */}
        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: "20px 16px", md: "28px 32px" },
          }}
        >
          <Box sx={{ maxWidth: 1280, width: "100%", mx: "auto" }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}