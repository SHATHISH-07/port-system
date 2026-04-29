import { useState } from "react";
import { Box, Typography, Tooltip, IconButton } from "@mui/material";
import {
  AnalyticsOutlined,
  GridViewOutlined,
  HistoryOutlined,
  MenuRounded,
  ChevronLeftRounded,
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";

const OPEN = 220;
const CLOSED = 56;

const navItems = [
  { path: "/history-analysis", label: "History Analysis", icon: HistoryOutlined },
  { path: "/current-analysis", label: "Current Analysis", icon: AnalyticsOutlined },
  { path: "/heatmap", label: "Terminal Heatmap", icon: GridViewOutlined },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const loc = useLocation();

  return (
    <Box
      component="nav"
      sx={{
        width: open ? OPEN : CLOSED,
        minHeight: "100vh",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#1f2023",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        transition: "width 280ms cubic-bezier(0.2,0,0,1)",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        zIndex: 200,
      }}
    >
      <Box
        sx={{
          height: 64,
          display: "flex",
          alignItems: "center",
          px: 1,
          gap: 1,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <Tooltip title={open ? "Collapse" : "Expand"} placement="right">
          <IconButton
            onClick={() => setOpen(v => !v)}
            size="small"
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              color: "#9aa0a6",
              flexShrink: 0,
              "&:hover": { bgcolor: "rgba(255,255,255,0.07)", color: "#e8eaed" },
            }}
          >
            {open
              ? <ChevronLeftRounded sx={{ fontSize: 22 }} />
              : <MenuRounded sx={{ fontSize: 22 }} />}
          </IconButton>
        </Tooltip>

        {open && (
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: "#e8eaed",
              whiteSpace: "nowrap",
              letterSpacing: 0,
              fontFamily: "'Google Sans', Roboto, sans-serif",
            }}
          >
            PortSync
          </Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, py: 1.5, overflowY: "auto", overflowX: "hidden" }}>
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = loc.pathname === path;
          return (
            <Tooltip
              key={path}
              title={!open ? label : ""}
              placement="right"
              arrow
            >
              <Box
                component={Link}
                to={path}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  height: 40,
                  px: open ? 2 : 0,
                  mx: 1,
                  mb: 0.5,
                  borderRadius: "20px",
                  textDecoration: "none",
                  cursor: "pointer",
                  justifyContent: open ? "flex-start" : "center",
                  transition: "background-color 150ms",
                  bgcolor: active ? "rgba(138,180,248,0.14)" : "transparent",
                  "&:hover": {
                    bgcolor: active
                      ? "rgba(138,180,248,0.18)"
                      : "rgba(255,255,255,0.06)",
                  },
                }}
              >
                <Icon
                  sx={{
                    fontSize: 20,
                    flexShrink: 0,
                    color: active ? "#8ab4f8" : "#9aa0a6",
                    transition: "color 150ms",
                  }}
                />
                {open && (
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      color: active ? "#8ab4f8" : "#bdc1c6",
                      whiteSpace: "nowrap",
                      lineHeight: 1,
                      fontFamily: "'Google Sans', Roboto, sans-serif",
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