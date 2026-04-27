import React from "react";
import { Box, Typography } from "@mui/material";
import Sidebar from "./Sidebar";
import { useLocation } from "react-router-dom";

interface LayoutProps { children: React.ReactNode; }

const PAGE: Record<string, { title: string; sub: string }> = {
  "/": { title: "Vessel Analysis", sub: "Performance monitoring & predictive stay-time modeling" },
  "/heatmap": { title: "Terminal Heatmap", sub: "Container yard block & berth utilization" },
};

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
  const page = PAGE[pathname] ?? { title: "PortSync", sub: "" };

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      <Sidebar />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <Box
          component="header"
          sx={{
            height: 64,
            px: { xs: 3, md: 4 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: "#292a2d",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            zIndex: 100,
            flexShrink: 0,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: "1rem",
                fontWeight: 500,
                color: "#e8eaed",
                lineHeight: 1.25,
                fontFamily: "'Google Sans', Roboto, sans-serif",
              }}
            >
              {page.title}
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#9aa0a6", lineHeight: 1.3 }}>
              {page.sub}
            </Typography>
          </Box>
        </Box>

        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 3, md: "24px 32px" },
            '& > div': {
              maxWidth: 1320,
              width: "100%",
              mx: "auto",
            }
          }}
        >
          <Box sx={{ maxWidth: 1320, width: "100%", mx: "auto" }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}