import React from "react";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#faf9f6" }}>
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          p: { xs: 4, md: 6 }
        }}
      >
        <Box sx={{ maxWidth: "1200px", width: "100%", mx: "auto" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;