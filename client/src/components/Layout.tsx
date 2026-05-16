import React from "react";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";
import { useLocation } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
  const isFullScreenPage = location.pathname === "/operational-dashboard" || location.pathname === "/yard-planning";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      <Sidebar />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          minWidth: 0,
          p: isFullScreenPage ? 0 : { xs: "20px 16px", md: "32px 40px" },
        }}
      >
        <Box sx={{ width: "100%", maxWidth: isFullScreenPage ? "none" : 2000, mx: isFullScreenPage ? 0 : "auto", height: isFullScreenPage ? "100%" : "auto" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}