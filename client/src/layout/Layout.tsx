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

  // Pages that manage their own layout/scrolling internally
  const isSelfContainedPage = ["/heatmap"].includes(location.pathname);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <Box
      sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}
    >
      <Sidebar />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: isSelfContainedPage ? "hidden" : "auto",
          minWidth: 0,
          p: isSelfContainedPage ? 0 : { xs: "20px 16px", md: "32px 40px" },
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: isSelfContainedPage ? "none" : 1350,
            mx: isSelfContainedPage ? 0 : "auto",
            height: isSelfContainedPage ? "100%" : "auto",
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
