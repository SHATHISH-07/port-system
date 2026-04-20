import { useState } from "react";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  IconButton,
  Tooltip
} from "@mui/material";
import {
  Menu,
  DashboardRounded,
  ModelTrainingRounded,
  MapRounded
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";

const Sidebar = () => {
  const [open, setOpen] = useState(true);
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Vessel Analysis", icon: <DashboardRounded /> },
    { path: "/heatmap", label: "Terminal Heatmap", icon: <MapRounded /> },
    { path: "/train", label: "Retrain Model", icon: <ModelTrainingRounded /> }
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? 270 : 72,
        "& .MuiDrawer-paper": {
          width: open ? 270 : 72,
          transition: "width 0.25s ease",
          bgcolor: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          overflowX: "hidden"
        }
      }}
    >
      {/* HEADER */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: open ? "space-between" : "center",
          px: 2,
          py: 2
        }}
      >
        {open && (
          <Typography sx={{ fontWeight: 600, color: "#111827" }}>
            Terminal
          </Typography>
        )}

        <IconButton onClick={() => setOpen(!open)}>
          {open ? <Menu /> : <Menu />}
        </IconButton>
      </Box>

      {/* NAV */}
      <List sx={{ mt: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Tooltip
              key={item.path}
              title={!open ? item.label : ""}
              placement="right"
            >
              <ListItemButton
                component={Link}
                to={item.path}
                sx={{
                  mx: 1,
                  my: 2,
                  borderRadius: "8px",
                  justifyContent: open ? "flex-start" : "center",
                  bgcolor: isActive ? "#f3f4f6" : "transparent",
                  "&:hover": { bgcolor: "#f9fafb" }
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: open ? 2 : 0,
                    justifyContent: "center",
                    color: "#374151"
                  }}
                >
                  {item.icon}
                </ListItemIcon>

                {open && (
                  <ListItemText
                    primary={
                      <Typography
                        sx={{
                          fontSize: "0.9rem",
                          fontWeight: isActive ? 600 : 500,
                          color: "#111827"
                        }}
                      >
                        {item.label}
                      </Typography>
                    }
                  />
                )}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Drawer>
  );
};

export default Sidebar;