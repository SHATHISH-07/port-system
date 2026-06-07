import { useState } from "react";
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  useTheme,
  Button,
  Collapse,
  useMediaQuery,
} from "@mui/material";
import {
  HistoryOutlined,
  ViewSidebarOutlined,
  LogoutOutlined,
  ExpandLess,
  ExpandMore,
  DarkModeOutlined,
  LightModeOutlined,
  SettingsOutlined,
  AssignmentOutlined,
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useColorMode } from "../theme/ThemeContext";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import WidgetsOutlinedIcon from "@mui/icons-material/WidgetsOutlined";

const OPEN = 260;
const CLOSED = 60;

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
      path: "/requests",
      label: "Request",
      icon: AssignmentOutlined,
      userOnly: true,
    },
  ];

const ADMIN_ITEMS = [
  { path: "/requests", label: "Requests" },
  { path: "/ingest", label: "Data Ingestion" },
  { path: "/train-model", label: "Train Model" },
  { path: "/user-management", label: "User Management" },
  { path: "/system-logs", label: "System Logs" },
];

export default function Sidebar() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [open, setOpen] = useState(!isMobile);
  const [adminOpen, setAdminOpen] = useState(false);
  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);

  if (isMobile !== prevIsMobile) {
    setPrevIsMobile(isMobile);
    if (isMobile) {
      setOpen(false);
    }
  }

  const loc = useLocation();
  const { user, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();

  const isDark = mode === "dark";

  // Hardened Color Palette for better Light Mode visibility
  const textColor = isDark ? "#ffffff" : "#000000";
  const textActiveColor = isDark
    ? "rgba(255,255,255,0.65)"
    : "rgba(0,0,0,0.65)";
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
            onClick={() => {
              if (isMobile) {
                setOpen(false);
                setAdminOpen(false);
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.2,
              height: isSubItem ? 32 : open ? 40 : 38,
              px: open ? (isSubItem ? 4 : 1.5) : 0,
              mx: open ? 1.5 : "auto",
              width: open ? "auto" : 38,
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
                  fontSize: 22,
                  flexShrink: 0,
                  color: "inherit",
                  transition: "color 150ms",
                }}
              />
            ) : (
              !open && (
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: "inherit" }}
                >
                  {label.charAt(0)}
                </Typography>
              )
            )}

            {open && (
              <Typography
                sx={{
                  fontSize: isSubItem ? 13 : 15,
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
    <>
      {/* Mobile Top Bar */}
      {isMobile && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: "12px 16px",
            bgcolor: theme.palette.background.default,
            width: "100%",
            position: "sticky",
            top: 0,
            zIndex: 198,
          }}
        >
          <Box
            onClick={() => {
              setOpen(true);
              setAdminOpen(false);
            }}
            sx={{
              width: 34,
              height: 34,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              "&:hover": { bgcolor: menuIconHover },
              "& .menu-icon": { display: "none" },
              "&:hover .logo-icon": { display: "none" },
              "&:hover .menu-icon": {
                display: "block",
              },
            }}
          >
            <Box
              className="logo-icon"
              sx={{
                width: 30,
                height: 30,
                bgcolor: isDark ? "#ffffff" : "#000000",
                borderRadius: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
            <ViewSidebarOutlined
              className="menu-icon"
              sx={{ fontSize: 24, color: menuIconColor }}
            />
          </Box>
          <Typography
            sx={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: textColor,
              textAlign: "right"
            }}
          >
            Deck Optimizer
          </Typography>
        </Box>
      )}

      {/* Mobile Backdrop */}
      {isMobile && open && (
        <Box
          onClick={() => setOpen(false)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "rgba(0,0,0,0.4)",
            zIndex: 199,
          }}
        />
      )}

      {/* Sidebar Drawer */}
      <Box
        component="nav"
        onClick={() => {
          if (!open && !isMobile) setOpen(true);
        }}
        sx={{
          width: isMobile ? OPEN : (open ? OPEN : CLOSED),
          minHeight: "100dvh",
          height: "100dvh",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: theme.palette.background.default,
          transition: "transform 300ms, width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          position: isMobile ? "fixed" : "sticky",
          top: 0,
          left: 0,
          zIndex: 200,
          boxShadow: (isMobile && open) ? 24 : 0,
          transform: isMobile ? (open ? "translateX(0)" : "translateX(-100%)") : "none",
          cursor: (!open && !isMobile) ? "e-resize" : "default",
          "&:hover .logo-icon": { display: "none" },
          "&:hover .menu-icon": {
            display: "block",
          },
        }}
      >
        {/* ─── Brand / Title / Toggle ─── */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: (!isMobile && !open) ? "center" : "space-between",
            p: (open || isMobile) ? "16px 20px" : "12px 16px",
            pt: (open || isMobile) ? 2.5 : 2,
            gap: 1.5,
            flexShrink: 0,
            mb: 0.5,
          }}
        >
          {(open || isMobile) ? (
            <>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    bgcolor: isDark ? "#ffffff" : "#000000",
                    borderRadius: 1.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                />
              </Box>

              <Tooltip title="Collapse sidebar" placement="right">
                <IconButton
                  onClick={() => {
                    setOpen(false);
                    if (isMobile) setAdminOpen(false);
                  }}
                  size="small"
                  sx={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    color: menuIconColor,
                    "&:hover": { bgcolor: menuIconHover },
                  }}
                >
                  <ViewSidebarOutlined sx={{ fontSize: 22 }} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Expand sidebar" placement="right">
              <Box
                onClick={() => setOpen(true)}
                sx={{
                  width: 38,
                  height: 38,
                  cursor: "e-resize",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  "&:hover": { bgcolor: menuIconHover },
                  "& .menu-icon": { display: "none" },
                }}
              >
                <Box
                  className="logo-icon"
                  sx={{
                    width: 30,
                    height: 30,
                    bgcolor: isDark ? "#ffffff" : "#000000",
                    borderRadius: 1.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
                <ViewSidebarOutlined
                  className="menu-icon"
                  sx={{ fontSize: 22, color: menuIconColor }}
                />
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
                  height: open ? 40 : 38,
                  px: open ? 1.5 : 0,
                  mx: open ? 1.5 : "auto",
                  width: open ? "auto" : 38,
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
                <SettingsOutlined sx={{ fontSize: 22, color: "inherit" }} />
                {(open || isMobile) && (
                  <>
                    <Typography
                      sx={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "inherit",
                      }}
                    >
                      Operations
                    </Typography>
                    {adminOpen ? (
                      <ExpandLess sx={{ fontSize: 22 }} />
                    ) : (
                      <ExpandMore sx={{ fontSize: 22 }} />
                    )}
                  </>
                )}
              </Box>

              <Collapse
                in={adminOpen && (open || isMobile)}
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
            p: (open || isMobile) ? "12px 16px" : "8px 12px",
            pb: 2,
            display: "flex",
            flexDirection: "column",
            gap: (open || isMobile) ? 0.75 : 0.1,
            alignItems: (open || isMobile) ? "stretch" : "center",
            width: "100%",
          }}
        >
          {(open || isMobile) ? (
            <>
              <Button
                onClick={toggleColorMode}
                startIcon={
                  isDark ? (
                    <LightModeOutlined sx={{ fontSize: 22 }} />
                  ) : (
                    <DarkModeOutlined sx={{ fontSize: 22 }} />
                  )
                }
                sx={{
                  justifyContent: "flex-start",
                  height: 40,
                  color: isDark ? "#ffffff" : "#000000",
                  fontSize: "15px",
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
                startIcon={<LogoutOutlined sx={{ fontSize: 22 }} />}
                sx={{
                  justifyContent: "flex-start",
                  height: 40,
                  color: isDark ? "#ffffff" : "#000000",
                  fontSize: "15px",
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
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    borderRadius: "8px",
                    color: isDark ? "#ffffff" : "#000000",
                    "&:hover": { bgcolor: menuIconHover, color: textActiveColor },
                  }}
                >
                  {isDark ? (
                    <LightModeOutlined sx={{ fontSize: 22 }} />
                  ) : (
                    <DarkModeOutlined sx={{ fontSize: 22 }} />
                  )}
                </IconButton>
              </Tooltip>

              <Tooltip title="Logout" placement="right" arrow>
                <IconButton
                  onClick={logout}
                  sx={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    borderRadius: "8px",
                    color: isDark ? "#ffffff" : "#000000",
                    "&:hover": {
                      bgcolor: "transparent",
                      color: textActiveColor,
                    },
                  }}
                >
                  <LogoutOutlined sx={{ fontSize: 22 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>
    </>
  );
}
