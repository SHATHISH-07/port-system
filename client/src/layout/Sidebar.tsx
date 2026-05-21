import { useState } from "react";
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  useTheme,
  Button,
  Collapse,
} from "@mui/material";
import {
  HistoryOutlined,
  ViewSidebarOutlined,
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
import WhatshotIcon from '@mui/icons-material/Whatshot';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';

const OPEN = 250;
const CLOSED = 54;

const USER_ITEMS: {
  path: string;
  label: string;
  icon?: React.ElementType;
  userOnly?: boolean;
}[] = [
    {
      path: "/stay-analysis",
      label: "Stay Time Analysis",
      icon: HistoryOutlined,
    },
    {
      path: "/heatmap",
      label: "Port Heatmap",
      icon: WhatshotIcon,
    },
    {
      path: "/stowage-planning",
      label: "Stowage Planning",
      icon: WidgetsOutlinedIcon,
    },
    {
      path: "/crane-analytics",
      label: "Crane Analytics",
      icon: PrecisionManufacturingOutlined,
    },
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
  const textColor = isDark ? "#ffffff" : "#000000";
  const textActiveColor = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)";
  const menuIconColor = isDark ? "#ffffff" : "#000000";
  const menuIconHover = "transparent";
  const menuIconActive = "transparent";
  const menuIconHoverActive = "transparent";

  const renderNavItems = (
    items: {
      path: string;
      label: string;
      icon?: React.ElementType;
      userOnly?: boolean;
    }[],
    isSubItem = false,
  ) => {
    return items.map(({ path, label, icon: Icon }) => {
      const active = loc.pathname === path;
      return (
        <Tooltip
          key={path}
          title={!open && !isSubItem ? label : ""}
          placement="right"
          arrow
        >
          <Box
            component={Link}
            to={path}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.2,
              height: isSubItem ? 30 : (open ? 38 : 34),
              px: open ? (isSubItem ? 4 : 1.5) : 0,
              mx: open ? 1.5 : "auto",
              width: open ? "auto" : 34,
              mb: open ? 0.25 : 0.5,
              borderRadius: "8px",
              textDecoration: "none",
              justifyContent: open ? "flex-start" : "center",
              transition: "all 0.2s ease-in-out",
              bgcolor: active ? menuIconActive : "transparent",
              color: active ? textActiveColor : textColor,
              "&:hover": {
                bgcolor: active ? menuIconHoverActive : menuIconHover,
                transform: open ? "translateX(2px)" : "none",
                color: textActiveColor,
                textDecoration: "none",
              },
            }}
          >
            {Icon ? (
              <Icon
                sx={{
                  fontSize: 19,
                  flexShrink: 0,
                  color: "inherit",
                  transition: "color 150ms",
                }}
              />
            ) : (
              !open && (
                <Typography
                  sx={{ fontSize: 11, fontWeight: 700, color: "inherit" }}
                >
                  {label.charAt(0)}
                </Typography>
              )
            )}

            {open && (
              <Typography
                sx={{
                  fontSize: isSubItem ? 11.5 : 12.5,
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
        bgcolor: theme.palette.background.default,
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
          flexDirection: "row",
          alignItems: "center",
          justifyContent: open ? "space-between" : "center",
          p: open ? "16px 20px" : "12px 16px",
          pt: open ? 2.5 : 2,
          gap: 1.5,
          flexShrink: 0,
          mb: 0.5,
        }}
      >
        {open ? (
          <>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Box sx={{ width: 26, height: 26, bgcolor: isDark ? '#e0e0e0' : '#333333', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} />
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "primary",
                    lineHeight: 1.2,
                    letterSpacing: "0.02em",
                  }}
                >
                  Deck Optimiser
                </Typography>
              </Box>
            </Box>

            <Tooltip title="Collapse sidebar" placement="right">
              <IconButton
                onClick={() => setOpen(false)}
                size="small"
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  color: menuIconColor,
                  "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
                }}
              >
                <ViewSidebarOutlined sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Tooltip title="Expand sidebar" placement="right">
            <Box
              onClick={() => setOpen(true)}
              sx={{
                width: 34,
                height: 34,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                "&:hover": { bgcolor: menuIconHover },
                "& .menu-icon": { display: "none" },
                "&:hover .logo-icon": { display: "none" },
                "&:hover .menu-icon": { display: "block", color: textActiveColor }
              }}
            >
              <Box className="logo-icon" sx={{ width: 26, height: 26, bgcolor: isDark ? '#e0e0e0' : '#333333', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
              <ViewSidebarOutlined className="menu-icon" sx={{ fontSize: 20, color: menuIconColor }} />
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* ─── Navigation Items ─── */}
      <Box sx={{ flex: 1, py: 1, overflowY: "auto", overflowX: "hidden" }}>
        {renderNavItems(
          USER_ITEMS.filter(
            (item) => !(user?.role === "admin" && item.userOnly),
          ),
        )}

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
                gap: 1.2,
                height: open ? 38 : 34,
                px: open ? 1.5 : 0,
                mx: open ? 1.5 : "auto",
                width: open ? "auto" : 34,
                mt: open ? 1.5 : 0.5,
                mb: open ? 0.25 : 0.5,
                borderRadius: "8px",
                cursor: "pointer",
                justifyContent: open ? "flex-start" : "center",
                transition: "all 0.2s ease-in-out",
                color: adminOpen ? textActiveColor : textColor,
                bgcolor: adminOpen && !open ? menuIconActive : "transparent",
                "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
              }}
            >
              <SettingsOutlined sx={{ fontSize: 19, color: "inherit" }} />
              {open && (
                <>
                  <Typography
                    sx={{
                      flex: 1,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "inherit",
                    }}
                  >
                    Operations
                  </Typography>
                  {adminOpen ? (
                    <ExpandLess sx={{ fontSize: 18 }} />
                  ) : (
                    <ExpandMore sx={{ fontSize: 18 }} />
                  )}
                </>
              )}
            </Box>

            <Collapse
              in={adminOpen && open}
              timeout="auto"
              unmountOnExit={false}
            >
              <Box sx={{ mt: 0.5 }}>{renderNavItems(ADMIN_ITEMS, true)}</Box>
            </Collapse>
          </>
        )}
      </Box>

      {/* ─── Bottom Actions (Stacked) ─── */}
      <Box
        sx={{
          p: open ? "12px 16px" : "8px 12px",
          pb: 2,
          display: "flex",
          flexDirection: "column",
          gap: open ? 0.75 : 0.1,
          alignItems: open ? "stretch" : "center",
          width: "100%",
        }}
      >
        {open ? (
          <>
            <Button
              onClick={toggleColorMode}
              startIcon={isDark ? <LightModeOutlined sx={{ fontSize: 18 }} /> : <DarkModeOutlined sx={{ fontSize: 18 }} />}
              sx={{
                justifyContent: "flex-start",
                height: 38,
                color: isDark ? "#ffffff" : "#000000",
                fontSize: "12.5px",
                px: 1.5,
                borderRadius: "8px",
                textTransform: "none",
                "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {isDark ? "Light Mode" : "Dark Mode"}
              </span>
            </Button>

            <Button
              onClick={logout}
              startIcon={<LogoutOutlined sx={{ fontSize: 18 }} />}
              sx={{
                justifyContent: "flex-start",
                height: 38,
                color: isDark ? "#ffffff" : "#000000",
                fontSize: "12.5px",
                px: 1.5,
                borderRadius: "8px",
                textTransform: "none",
                "&:hover": {
                  bgcolor: "transparent",
                  color: textActiveColor,
                },
              }}
            >
              <span style={{ fontWeight: 600 }}>Logout</span>
            </Button>
          </>
        ) : (
          <>
            <Tooltip
              title={isDark ? "Light Mode" : "Dark Mode"}
              placement="right"
              arrow
            >
              <IconButton
                onClick={toggleColorMode}
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: "8px",
                  color: isDark ? "#ffffff" : "#000000",
                  "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
                }}
              >
                {isDark ? (
                  <LightModeOutlined sx={{ fontSize: 18 }} />
                ) : (
                  <DarkModeOutlined sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>

            <Tooltip title="Logout" placement="right" arrow>
              <IconButton
                onClick={logout}
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: "8px",
                  color: isDark ? "#ffffff" : "#000000",
                  "&:hover": {
                    bgcolor: "transparent",
                    color: textActiveColor,
                  },
                }}
              >
                <LogoutOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>
    </Box>
  );
}
