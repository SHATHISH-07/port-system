import React from "react";
import { Box, IconButton, Tooltip, useTheme } from "@mui/material";
import { DarkModeOutlined, LightModeOutlined } from "@mui/icons-material";
import Sidebar from "./Sidebar";
import { useColorMode } from "../theme/ThemeContext";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { mode, toggleColorMode } = useColorMode();
  const theme = useTheme();
  const location = useLocation();

  const isDark = mode === "dark";
  const isLoginPage = location.pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      <Sidebar />

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          minWidth: 0,
        }}
      >
        {/* ─── Header ─── */}
        <Box
          component="header"
          sx={{
            height: 56,
            px: { xs: 3, md: 4 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme.palette.divider}`,
            flexShrink: 0,
          }}
        >
          {/* Page title */}
          <Box
            sx={{
              fontSize: "0.9375rem",
              fontWeight: 700,
              color: "text.primary",
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            BERTH OPTIMIZATION & YARD
            PREPARATION FRAMEWORK
          </Box>

          {/* Right-side actions */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Tooltip
              title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
              placement="bottom"
            >
              <IconButton
                onClick={toggleColorMode}
                size="small"
                sx={{
                  width: 34,
                  height: 34,
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: "rgba(0,0,0,0.04)",
                    color: "text.primary",
                  },
                }}
              >
                {isDark ? (
                  <LightModeOutlined sx={{ fontSize: 18 }} />
                ) : (
                  <DarkModeOutlined sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* ─── Page Content ─── */}
        <Box
          component="main"
          sx={{
            flex: 1,
            bgcolor: "background.default",
            p: { xs: "20px 16px", md: "28px 32px" },
          }}
        >
          <Box sx={{ width: "100%", mx: "auto" }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}