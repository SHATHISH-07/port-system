import { useState } from "react";
import { Box, Typography, Tooltip, IconButton, useTheme, Button, Collapse } from "@mui/material";
import {
  AnalyticsOutlined,
  GridViewOutlined,
  HistoryOutlined,
  MenuRounded,
  AssignmentOutlined,
  LogoutOutlined,
  SettingsOutlined,
  ExpandLess,
  ExpandMore
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const OPEN = 248;
const CLOSED = 70;

const USER_ITEMS = [
  { path: "/history-analysis", label: "History Analysis", icon: HistoryOutlined },
  { path: "/current-analysis", label: "Current Analysis", icon: AnalyticsOutlined },
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
  const isDark = theme.palette.mode === "dark";

  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.10)";
  const textColor = isDark ? "rgba(255,255,255,0.65)" : "#585858";
  const textActiveColor = isDark ? "#ffffff" : "#0f172a";
  const menuIconColor = isDark ? "rgba(255,255,255,0.45)" : "#585858";
  const menuIconHover = isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.06)";
  const menuIconActive = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.10)";
  const menuIconHoverActive = isDark ? "rgba(255,255,255,0.17)" : "rgba(15,23,42,0.14)";

  const renderNavItems = (items: any[], isSubItem = false) => {
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
              gap: 1.25,
              height: isSubItem ? 32 : 38,
              px: open ? (isSubItem ? 4.5 : 1.75) : 0,
              mx: 0.75,
              mb: 0.5,
              borderRadius: "8px",
              textDecoration: "none",
              justifyContent: open ? "flex-start" : "center",
              transition: "background-color 150ms",
              bgcolor: active ? menuIconActive : "transparent",
              "&:hover": {
                bgcolor: active ? menuIconHoverActive : menuIconHover,
              },
            }}
          >
            {Icon && (
              <Icon
                sx={{
                  fontSize: 22,
                  flexShrink: 0,
                  color: active ? textActiveColor : textColor,
                  transition: "color 150ms",
                }}
              />
            )}

            {open && (
              <Typography
                sx={{
                  fontSize: isSubItem ? 12.5 : 13.5,
                  fontWeight: active ? 600 : 400,
                  color: active ? textActiveColor : textColor,
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
        borderRight: `1px solid ${dividerColor}`,
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
          justifyContent: "space-between",
          px: open ? 1.5 : 2,
          gap: 1,
          flexShrink: 0,
          borderBottom: `1px solid ${dividerColor}`,
        }}
      >
        <Tooltip title={open ? "Collapse sidebar" : "Expand sidebar"} placement="right">
          <IconButton
            onClick={() => setOpen((v) => !v)}
            size="small"
            sx={{
              width: 36, height: 36, flexShrink: 0,
              color: menuIconColor,
              "&:hover": {
                bgcolor: menuIconHover,
                color: textActiveColor,
              },
            }}
          >
            <MenuRounded sx={{ fontSize: 23 }} />
          </IconButton>
        </Tooltip>
        {open && (
          <Typography variant="subtitle1" sx={{ color: textActiveColor, ml: 1, fontWeight: "bold", textTransform: "capitalize" }}>
            {user?.role || "User"}
          </Typography>
        )}
      </Box>

      {/* ─── Navigation Items ─── */}
      <Box sx={{ flex: 1, py: 1.5, overflowY: "auto", overflowX: "hidden" }}>
        {renderNavItems(USER_ITEMS)}

        {user?.role === "admin" && (
          <>
            <Box
              onClick={() => {
                if (!open) setOpen(true);
                setAdminOpen(!adminOpen);
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                height: 38,
                px: open ? 1.75 : 0,
                mx: 0.75,
                mt: 2,
                mb: 0.5,
                borderRadius: "8px",
                cursor: "pointer",
                justifyContent: open ? "flex-start" : "center",
                transition: "background-color 150ms",
                "&:hover": {
                  bgcolor: menuIconHover,
                },
              }}
            >
              <SettingsOutlined sx={{ fontSize: 22, color: textColor }} />
              {open && (
                <>
                  <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: textColor }}>
                    Operations Center
                  </Typography>
                  {adminOpen ? <ExpandLess sx={{ fontSize: 18, color: textColor }} /> : <ExpandMore sx={{ fontSize: 18, color: textColor }} />}
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

      {/* ─── Bottom Actions ─── */}
      <Box sx={{ p: 1, borderTop: `1px solid ${dividerColor}` }}>
        <Tooltip title={!open ? "Logout" : ""} placement="right" arrow>
          <Button
            fullWidth
            onClick={logout}
            startIcon={<LogoutOutlined />}
            sx={{
              justifyContent: open ? "flex-start" : "center",
              color: textColor,
              "& .MuiButton-startIcon": { mr: open ? 1 : 0, ml: open ? 0 : 0.5 },
              "&:hover": { bgcolor: menuIconHover, color: textActiveColor }
            }}
          >
            {open && "Logout"}
          </Button>
        </Tooltip>
      </Box>
    </Box>
  );
}