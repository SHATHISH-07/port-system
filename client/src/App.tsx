import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Layout from "./components/Layout";

// Code-split each page into its own JS chunk.
// TerminalMap imports Three.js (~600KB) — lazy loading prevents it from
// blocking the initial bundle parse and every subsequent route change.
const HistoryVesselAnalysis = lazy(() => import("./pages/HistoryVesselAnalysis"));
const CurrentVesselAnalysis  = lazy(() => import("./pages/CurrentVesselAnalysis"));
const TerminalMap            = lazy(() => import("./pages/TerminalMap"));

function PageLoader() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <CircularProgress size={32} sx={{ color: "#8ab4f8" }} />
    </Box>
  );
}

const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#202124", paper: "#292a2d" },
    primary: { main: "#8ab4f8", light: "#93bafa", dark: "#1a73e8", contrastText: "#202124" },
    secondary: { main: "#d7aefb" },
    success: { main: "#81c995" },
    warning: { main: "#fdd663" },
    error: { main: "#f28b82" },
    text: {
      primary: "#e8eaed",
      secondary: "#9aa0a6",
      disabled: "#5f6368",
    },
    divider: "rgba(255,255,255,0.08)",
    action: {
      hover: "rgba(255,255,255,0.05)",
      selected: "rgba(138,180,248,0.12)",
      focus: "rgba(138,180,248,0.15)",
    },
  },
  typography: {
    fontFamily: "'Roboto', 'Google Sans', -apple-system, sans-serif",
    h4: { fontWeight: 400, letterSpacing: "-0.2px", fontSize: "1.75rem" },
    h5: { fontWeight: 400, letterSpacing: "-0.1px", fontSize: "1.5rem" },
    h6: { fontWeight: 500, fontSize: "1.125rem" },
    subtitle1: { fontWeight: 500, color: "#9aa0a6" },
    subtitle2: { fontWeight: 500, fontSize: "0.8125rem", color: "#9aa0a6" },
    body1: { fontSize: "0.875rem" },
    body2: { fontSize: "0.8125rem", color: "#9aa0a6" },
    caption: { fontSize: "0.75rem", color: "#9aa0a6", letterSpacing: "0.025em" },
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 500,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "#9aa0a6",
      lineHeight: 1,
    },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: "#202124", color: "#e8eaed" } },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#292a2d",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 1px 2px rgba(0,0,0,.3), 0 2px 6px rgba(0,0,0,.15)",
          borderRadius: 12,
          transition: `box-shadow ${250}ms cubic-bezier(0.2, 0, 0, 1), border-color ${250}ms`,
          "&:hover": {
            boxShadow: "0 2px 6px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.19)",
            borderColor: "rgba(255,255,255,0.12)",
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { "&:last-child": { paddingBottom: 20 } } },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#292a2d",
          border: "1px solid rgba(255,255,255,0.08)",
        },
        elevation1: { boxShadow: "0 1px 2px rgba(0,0,0,.3), 0 2px 6px rgba(0,0,0,.15)" },
        elevation2: { boxShadow: "0 2px 6px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.19)" },
        elevation3: { boxShadow: "0 4px 12px rgba(0,0,0,.35), 0 12px 34px rgba(0,0,0,.25)" },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#35363a",
          borderRadius: 4,
          fontSize: "0.875rem",
          "& fieldset": { borderColor: "rgba(255,255,255,0.12)", transition: "border-color 150ms" },
          "&:hover fieldset": { borderColor: "rgba(255,255,255,0.22)" },
          "&.Mui-focused fieldset": { borderColor: "#8ab4f8", borderWidth: "1px" },
          color: "#e8eaed",
        },
        input: {
          color: "#e8eaed",
          "&::placeholder": { color: "#5f6368", opacity: 1 },
          padding: "8px 12px",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#9aa0a6",
          fontSize: "0.875rem",
          "&.Mui-focused": { color: "#8ab4f8" },
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          fontSize: "0.875rem",
          letterSpacing: "0.01em",
          borderRadius: 4,
          boxShadow: "none",
          transition: `background-color 150ms, box-shadow 150ms`,
          "&:hover": { boxShadow: "none" },
        },
        contained: {
          backgroundColor: "#1a73e8",
          color: "#fff",
          "&:hover": { backgroundColor: "#1557b0" },
          "&:disabled": { backgroundColor: "rgba(255,255,255,0.08)", color: "#5f6368" },
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.15)",
          color: "#8ab4f8",
          "&:hover": {
            backgroundColor: "rgba(138,180,248,0.08)",
            borderColor: "rgba(138,180,248,0.35)",
          },
        },
        text: {
          color: "#8ab4f8",
          "&:hover": { backgroundColor: "rgba(138,180,248,0.08)" },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          transition: "background-color 150ms",
          "&:hover": { backgroundColor: "rgba(255,255,255,0.06)" },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, fontWeight: 500, fontSize: "0.75rem", height: 22 },
        label: { padding: "0 8px" },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: "rgba(255,255,255,0.07)", fontSize: "0.8125rem", padding: "10px 12px" },
        head: {
          color: "#9aa0a6",
          background: "#202124",
          fontWeight: 500,
          fontSize: "0.6875rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "8px 12px",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 100ms",
          "&:hover": { backgroundColor: "rgba(255,255,255,0.04)" },
          "&:last-child td": { border: 0 },
        },
      },
    },

    MuiDivider: {
      styleOverrides: { root: { borderColor: "rgba(255,255,255,0.08)" } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#3c3d40",
          color: "#e8eaed",
          fontSize: "0.75rem",
          fontWeight: 400,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 2px 6px rgba(0,0,0,.3)",
          borderRadius: 4,
          padding: "6px 10px",
        },
        arrow: { color: "#3c3d40" },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: "0.875rem",
          minHeight: 36,
          "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
          "&.Mui-selected": { backgroundColor: "rgba(138,180,248,0.12)" },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 },
        bar: { borderRadius: 2 },
      },
    },
  },
});

export default function App() {
  // Prefetch the heavy TerminalMap (Three.js ~550KB) chunk silently in the
  // background 2 seconds after the app mounts. This ensures the chunk is
  // already browser-cached by the time the user clicks the nav link.
  useEffect(() => {
    const t = setTimeout(() => {
      import("./pages/TerminalMap");
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/history-analysis" />} />
              <Route path="/history-analysis" element={<HistoryVesselAnalysis />} />
              <Route path="/current-analysis" element={<CurrentVesselAnalysis />} />
              <Route path="/heatmap" element={<TerminalMap />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}
