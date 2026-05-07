import { useState } from "react";
import { Box, Typography, Tooltip, IconButton, useTheme, Button, Collapse } from "@mui/material";
import {
  AnalyticsOutlined,
  GridViewOutlined,
  HistoryOutlined,
  MenuRounded,
  AssignmentOutlined,
  LogoutOutlined,
  ExpandLess,
  ExpandMore,
  DarkModeOutlined,
  LightModeOutlined,
  PrecisionManufacturingOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useColorMode } from "../theme/ThemeContext";

const OPEN = 280;
const CLOSED = 80;

const USER_ITEMS = [
  { path: "/history-analysis", label: "History Analysis", icon: HistoryOutlined },
  { path: "/current-analysis", label: "Current Analysis", icon: AnalyticsOutlined },
  { path: "/crane-analytics", label: "Crane Analytics", icon: PrecisionManufacturingOutlined },
  { path: "/heatmap", label: "Terminal Heatmap", icon: GridViewOutlined },
  { path: "/requests", label: "Requests", icon: AssignmentOutlined },
];

const ADMIN_ITEMS = [
  { path: "/ingest", label: "Data Ingestion" },
  { path: "/train-model", label: "Train Model" },
  { path: "/user-management", label: "User Management" },
  { path: "/system-logs", label: "System Logs" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);

  const loc = useLocation();
  const theme = useTheme();
  const { user, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();

  const isDark = mode === "dark";

  // Hardened Color Palette for better Light Mode visibility
  const textColor = isDark ? "rgba(255,255,255,0.7)" : "#475569";
  const textActiveColor = isDark ? "#ffffff" : "#0f172a";
  const menuIconColor = isDark ? "rgba(255,255,255,0.5)" : "#64748b";
  const menuIconHover = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)";
  const menuIconActive = isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)";
  const menuIconHoverActive = isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.12)";

  const renderNavItems = (items: { path: string; label: string; icon?: React.ElementType; userOnly?: boolean }[], isSubItem = false) => {
    return items.map(({ path, label, icon: Icon }) => {
      const active = loc.pathname === path;
      return (
        <Tooltip key={path} title={!open && !isSubItem ? label : ""} placement="right" arrow>
          <Box
            component={Link}
            to={path}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              height: isSubItem ? 36 : 44,
              px: open ? (isSubItem ? 5 : 2) : 0,
              mx: open ? 2 : "auto",
              width: open ? "auto" : 48,
              mb: 0.5,
              borderRadius: "10px",
              textDecoration: "none",
              justifyContent: open ? "flex-start" : "center",
              transition: "all 0.2s ease-in-out",
              bgcolor: active ? menuIconActive : "transparent",
              color: active ? textActiveColor : textColor,
              "&:hover": {
                bgcolor: active ? menuIconHoverActive : menuIconHover,
                transform: open ? "translateX(2px)" : "none",
                color: textActiveColor,
              },
            }}
          >
            {Icon ? (
              <Icon sx={{ fontSize: 22, flexShrink: 0, color: "inherit", transition: "color 150ms" }} />
            ) : (
              !open && (
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: "inherit" }}>
                  {label.charAt(0)}
                </Typography>
              )
            )}

            {open && (
              <Typography
                sx={{
                  fontSize: isSubItem ? 13 : 14,
                  fontWeight: active ? 600 : 500,
                  color: "inherit",
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
    });
  };

  return (
    <Box
      component="nav"
      sx={{
        width: open ? OPEN : CLOSED,
        minHeight: "100vh",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: theme.palette.background.paper,
        boxShadow: isDark
          ? "4px 0 24px rgba(0,0,0,0.3)"
          : "4px 0 24px rgba(0,0,0,0.03)",
        transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        zIndex: 200,
      }}
    >
      {/* ─── Brand / Title / Toggle ─── */}
      <Box
        sx={{
          display: "flex",
          flexDirection: open ? "row" : "column",
          alignItems: open ? "flex-start" : "center",
          justifyContent: open ? "space-between" : "center",
          p: open ? 2.5 : 2,
          pt: 3.5,
          gap: 2,
          flexShrink: 0,
          mb: 1,
        }}
      >
        {open && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, mt: 0.5 }}>
            <Typography
              sx={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: textActiveColor,
                lineHeight: 1.3,
                letterSpacing: "0.03em",
              }}
            >
              BERTH OPTIMIZATION &
              <br />
              YARD PREPARATION
            </Typography>
            <Typography
              sx={{
                fontSize: "0.65rem",
                fontWeight: 700,
                color: textColor,
                textTransform: "uppercase",
                mt: 0.5,
                letterSpacing: "0.05em",
              }}
            >
              {user?.role || "User"}
            </Typography>
          </Box>
        )}

        <Tooltip title={open ? "Collapse sidebar" : "Expand sidebar"} placement="right">
          <IconButton
            onClick={() => setOpen((v) => !v)}
            size="small"
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              color: menuIconColor,
              "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
            }}
          >
            <MenuRounded sx={{ fontSize: 24 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ─── Navigation Items ─── */}
      <Box sx={{ flex: 1, py: 1, overflowY: "auto", overflowX: "hidden" }}>
        {renderNavItems(USER_ITEMS.filter((item) => !(user?.role === "admin" && item.userOnly)))}

        {user?.role === "admin" && (
          <>
            <Box
              onClick={() => {
                if (!open) {
                  setOpen(true);
                  setAdminOpen(true);
                } else {
                  setAdminOpen(!adminOpen);
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                height: 44,
                px: open ? 2 : 0,
                mx: open ? 2 : "auto",
                width: open ? "auto" : 48,
                mt: 3,
                mb: 0.5,
                borderRadius: "10px",
                cursor: "pointer",
                justifyContent: open ? "flex-start" : "center",
                transition: "all 0.2s ease-in-out",
                color: adminOpen ? textActiveColor : textColor,
                bgcolor: adminOpen && !open ? menuIconActive : "transparent",
                "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
              }}
            >
              <SettingsOutlined sx={{ fontSize: 22, color: "inherit" }} />
              {open && (
                <>
                  <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: "inherit" }}>
                    Operations
                  </Typography>
                  {adminOpen ? <ExpandLess sx={{ fontSize: 20 }} /> : <ExpandMore sx={{ fontSize: 20 }} />}
                </>
              )}
            </Box>

            <Collapse in={adminOpen && open} timeout="auto" unmountOnExit={false}>
              <Box sx={{ mt: 0.5 }}>
                {renderNavItems(ADMIN_ITEMS, true)}
              </Box>
            </Collapse>
          </>
        )}
      </Box>

      {/* ─── Bottom Actions (Stacked) ─── */}
      <Box
        sx={{
          p: open ? 2 : 1.5,
          pb: 3,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          alignItems: open ? "stretch" : "center", // Stretch items to full width when open
          width: "100%",
        }}
      >
        {open ? (
          <>
            <Button
              onClick={toggleColorMode}
              startIcon={isDark ? <LightModeOutlined /> : <DarkModeOutlined />}
              sx={{
                justifyContent: "flex-start",
                height: 44,
                color: textColor,
                px: 2,
                borderRadius: "10px",
                "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
              }}
            >
              <span style={{ fontWeight: 600 }}>{isDark ? "Light Mode" : "Dark Mode"}</span>
            </Button>

            <Button
              onClick={logout}
              startIcon={<LogoutOutlined />}
              sx={{
                justifyContent: "flex-start",
                height: 44,
                color: textColor,
                px: 2,
                borderRadius: "10px",
                "&:hover": {
                  bgcolor: isDark ? "rgba(255,70,70,0.1)" : "rgba(255,0,0,0.05)",
                  color: isDark ? "#ff6b6b" : "#d32f2f",
                },
              }}
            >
              <span style={{ fontWeight: 600 }}>Logout</span>
            </Button>
          </>
        ) : (
          <>
            <Tooltip title={isDark ? "Light Mode" : "Dark Mode"} placement="right" arrow>
              <IconButton
                onClick={toggleColorMode}
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: "10px",
                  color: textColor,
                  "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
                }}
              >
                {isDark ? <LightModeOutlined sx={{ fontSize: 20 }} /> : <DarkModeOutlined sx={{ fontSize: 20 }} />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Logout" placement="right" arrow>
              <IconButton
                onClick={logout}
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: "10px",
                  color: textColor,
                  "&:hover": {
                    bgcolor: isDark ? "rgba(255,70,70,0.1)" : "rgba(255,0,0,0.05)",
                    color: isDark ? "#ff6b6b" : "#d32f2f",
                  },
                }}
              >
                <LogoutOutlined sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>
    </Box>
  );
}