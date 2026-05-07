import { createContext, useContext, useState, useMemo } from "react";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider,
  alpha,
} from "@mui/material/styles";
import type { PaletteMode } from "@mui/material";

// ─── Context ─────────────────────────────────────────────────────────────────
interface ColorModeContextType {
  mode: PaletteMode;
  toggleColorMode: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ColorModeContext = createContext<ColorModeContextType>({
  mode: "dark",
  toggleColorMode: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useColorMode = () => useContext(ColorModeContext);

// ─── Theme Builder ────────────────────────────────────────────────────────────
// We use the TWO-STEP approach:
//   1. Build the palette-only base theme first.
//   2. Pass it into a second createTheme() call so styleOverrides can reference
//      the live palette via the callback form `({ theme }) => ({...})`.
//   This guarantees Light ↔ Dark toggling works for EVERY component override.

function buildTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  // ── Step 1: palette ──────────────────────────────────────────────────────
  const baseTheme = createTheme({
    palette: {
      mode,
      background: {
        default: isDark ? "#202020" : "#ffffff",
        paper:   isDark ? "#252525" : "#e9eef6",
      },
      primary: {
        main:         isDark ? "#60a5fa" : "#ffffff",
        light:        isDark ? "#93c5fd" : "rgba(255,255,255,0.85)",
        dark:         isDark ? "#3b82f6" : "rgba(255,255,255,0.65)",
        contrastText: isDark ? "#0a0a0b"  : "#1a73e8",
      },
      secondary: { main: isDark ? "#a78bfa" : "#e8f0fe" },
      success:   { main: isDark ? "#34d399" : "#059669" },
      warning:   { main: isDark ? "#fbbf24" : "#d97706" },
      error:     { main: isDark ? "#f87171" : "#dc2626" },
      info:      { main: isDark ? "#38bdf8" : "#4285f4" },
      text: {
        primary:   isDark ? "#f0f2f5" : "#111827",
        secondary: isDark ? "#9299a4" : "#4b5563",
        disabled:  isDark ? "#4b5563" : "#6b7280",
      },
      divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.12)",
    },
    typography: {
      fontFamily: "'Inter', 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h1: { fontWeight: 700, letterSpacing: "-0.5px" },
      h2: { fontWeight: 700, letterSpacing: "-0.3px" },
      h3: { fontWeight: 700, letterSpacing: "-0.2px" },
      h4: { fontWeight: 700, fontSize: "1.5rem",   letterSpacing: "-0.2px" },
      h5: { fontWeight: 600, fontSize: "1.25rem",  letterSpacing: "-0.15px" },
      h6: { fontWeight: 600, fontSize: "1rem",     letterSpacing: "-0.1px" },
      subtitle1: { fontWeight: 500, fontSize: "0.9375rem", lineHeight: 1.5 },
      subtitle2: { fontWeight: 500, fontSize: "0.8125rem", lineHeight: 1.4 },
      body1: { fontSize: "0.9375rem", lineHeight: 1.65 },
      body2: { fontSize: "0.8125rem", lineHeight: 1.65 },
      caption: { fontSize: "0.75rem", letterSpacing: "0.025em", lineHeight: 1.4 },
      overline: {
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        lineHeight: 1.2,
      },
    },
    shape: { borderRadius: 10 },
  });

  // ── Step 2: component overrides that read from `theme.palette` ───────────
  return createTheme(baseTheme, {
    components: {
      // ── Global baseline ──────────────────────────────────────────────────
      MuiCssBaseline: {
        styleOverrides: (theme: typeof baseTheme) => `
          *, *::before, *::after { box-sizing: border-box; }
          html { font-size: 16px; }
          body {
            background-color: ${theme.palette.background.default};
            color: ${theme.palette.text.primary};
            transition: background-color 250ms ease, color 250ms ease;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb {
            background: ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.2)"};
            border-radius: 3px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.32)"};
          }
          a { color: ${theme.palette.primary.main}; text-decoration: none; }
          a:hover { text-decoration: underline; }
        `,
      },

      // ── Card ─────────────────────────────────────────────────────────────
      MuiCard: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundImage: "none",
            // Cards use a dedicated surface — NOT background.paper (that's sidebar)
            backgroundColor: theme.palette.mode === "dark" ? "#2a2a2a" : "#e9eef6",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 14,
            boxShadow: theme.palette.mode === "dark"
              ? "0 1px 4px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)"
              : "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.06)",
            transition: "box-shadow 200ms ease, border-color 200ms ease",
            "&:hover": {
              boxShadow: theme.palette.mode === "dark"
                ? "0 4px 20px rgba(0,0,0,0.55)"
                : "0 4px 14px rgba(15,23,42,0.12)",
              borderColor: theme.palette.mode === "dark"
                ? "rgba(255,255,255,0.12)"
                : "rgba(15,23,42,0.14)",
            },
          }),
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: { padding: "20px 24px", "&:last-child": { paddingBottom: 24 } },
        },
      },

      // ── Paper ─────────────────────────────────────────────────────────────
      MuiPaper: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundImage: "none",
            // Popups/menus
            backgroundColor: theme.palette.mode === "dark" ? "#2a2a2a" : "#e9eef6",
            transition: "background-color 250ms ease",
          }),
          elevation1: ({ theme }: { theme: typeof baseTheme }) => ({
            boxShadow: theme.palette.mode === "dark"
              ? "0 1px 4px rgba(0,0,0,0.5)"
              : "0 1px 3px rgba(15,23,42,0.08)",
          }),
          elevation2: ({ theme }: { theme: typeof baseTheme }) => ({
            boxShadow: theme.palette.mode === "dark"
              ? "0 2px 10px rgba(0,0,0,0.5)"
              : "0 2px 8px rgba(15,23,42,0.10)",
          }),
        },
      },

      // ── Accordion ────────────────────────────────────────────────────────
      MuiAccordion: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundImage: "none",
            backgroundColor: theme.palette.mode === "dark" ? "#2a2a2a" : "#e9eef6",
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: "12px !important",
            boxShadow: "none",
            "&:before": { display: "none" },
            "&.Mui-expanded": { margin: 0 },
            transition: "background-color 250ms ease",
          }),
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: { minHeight: 52, "&.Mui-expanded": { minHeight: 52 } },
          content: { margin: "14px 0", "&.Mui-expanded": { margin: "14px 0" } },
        },
      },

      // ── Inputs ────────────────────────────────────────────────────────────
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundColor: theme.palette.mode === "dark"
              ? "rgba(255,255,255,0.04)"
              : "rgba(15,23,42,0.03)",
            borderRadius: 8,
            fontSize: "0.9375rem",
            color: theme.palette.text.primary,
            "& fieldset": {
              borderColor: theme.palette.mode === "dark"
                ? "rgba(255,255,255,0.12)"
                : "rgba(15,23,42,0.18)",
              transition: "border-color 150ms",
            },
            "&:hover fieldset": {
              borderColor: theme.palette.mode === "dark"
                ? "rgba(255,255,255,0.22)"
                : "rgba(15,23,42,0.25)",
            },
            "&.Mui-focused fieldset": {
              borderColor: theme.palette.mode === "dark"
                ? theme.palette.info.main
                : "#1a73e8",
              borderWidth: "1.5px",
            },
          }),
          input: ({ theme }: { theme: typeof baseTheme }) => ({
            color: theme.palette.text.primary,
            padding: "10px 14px",
            "&::placeholder": { color: theme.palette.text.disabled, opacity: 1 },
          }),
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            fontSize: "0.9375rem",
            color: theme.palette.text.secondary,
            "&.Mui-focused": {
              color: theme.palette.mode === "dark" ? theme.palette.info.main : "#1a73e8",
            },
          }),
        },
      },

      // ── Buttons ───────────────────────────────────────────────────────────
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            letterSpacing: "0.01em",
            borderRadius: 8,
            boxShadow: "none",
            "&:hover": { boxShadow: "none" },
          },
          contained: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundColor: theme.palette.mode === "dark"
              ? theme.palette.primary.main
              : "#1a73e8",
            color: "#ffffff",
            "&:hover": {
              backgroundColor: theme.palette.mode === "dark"
                ? theme.palette.primary.dark
                : "#1557b0",
              boxShadow: "none",
            },
            "&.Mui-disabled": {
              backgroundColor: alpha(theme.palette.text.primary, 0.08),
              color: theme.palette.text.disabled,
            },
          }),
          outlined: ({ theme }: { theme: typeof baseTheme }) => ({
            borderColor: theme.palette.mode === "dark"
              ? "rgba(255,255,255,0.15)"
              : "rgba(15,23,42,0.20)",
            color: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
            "&:hover": {
              backgroundColor: theme.palette.mode === "dark"
                ? "rgba(96,165,250,0.08)"
                : "rgba(26,115,232,0.06)",
              borderColor: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
            },
          }),
          text: ({ theme }: { theme: typeof baseTheme }) => ({
            color: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
            "&:hover": {
              backgroundColor: theme.palette.mode === "dark"
                ? "rgba(96,165,250,0.08)"
                : "rgba(26,115,232,0.06)",
            },
          }),
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            borderRadius: 8,
            transition: "background-color 150ms",
            color: theme.palette.text.secondary,
            "&:hover": {
              backgroundColor: alpha(theme.palette.text.primary, 0.06),
              color: theme.palette.text.primary,
            },
          }),
        },
      },

      // ── Chip ──────────────────────────────────────────────────────────────
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600, fontSize: "0.725rem", height: 22 },
          label: { padding: "0 8px" },
        },
      },

      // ── Tables ────────────────────────────────────────────────────────────
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            borderColor: theme.palette.divider,
            fontSize: "0.8125rem",
            padding: "12px 16px",
            color: theme.palette.text.primary,
          }),
          head: ({ theme }: { theme: typeof baseTheme }) => ({
            color: theme.palette.text.secondary,
            backgroundColor: theme.palette.mode === "dark"
              ? alpha(theme.palette.common.black, 0.3)
              : alpha(theme.palette.common.black, 0.02),
            fontWeight: 600,
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "10px 16px",
          }),
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            transition: "background-color 100ms",
            "&:hover": {
              backgroundColor: alpha(theme.palette.text.primary, 0.03),
            },
            "&:last-child td": { border: 0 },
          }),
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },

      // ── Divider ───────────────────────────────────────────────────────────
      MuiDivider: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            borderColor: theme.palette.divider,
          }),
        },
      },

      // ── Tooltip ───────────────────────────────────────────────────────────
      MuiTooltip: {
        styleOverrides: {
          tooltip: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundColor: theme.palette.mode === "dark" ? "#2d2f36" : "#1e293b",
            color: "#ffffff",
            fontSize: "0.75rem",
            fontWeight: 400,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            borderRadius: 6,
            padding: "6px 10px",
            maxWidth: 280,
          }),
          arrow: ({ theme }: { theme: typeof baseTheme }) => ({
            color: theme.palette.mode === "dark" ? "#2d2f36" : "#1e293b",
          }),
        },
      },

      // ── Menu ──────────────────────────────────────────────────────────────
      MuiMenuItem: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            fontSize: "0.875rem",
            minHeight: 38,
            borderRadius: 6,
            "&:hover": {
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
            },
            "&.Mui-selected": {
              backgroundColor: theme.palette.mode === "dark"
                ? "rgba(96,165,250,0.10)"
                : "rgba(26,115,232,0.08)",
              "&:hover": {
                backgroundColor: theme.palette.mode === "dark"
                  ? "rgba(96,165,250,0.14)"
                  : "rgba(26,115,232,0.12)",
              },
            },
          }),
        },
      },

      // ── Progress ──────────────────────────────────────────────────────────
      MuiLinearProgress: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            backgroundColor: alpha(theme.palette.text.primary, 0.08),
            borderRadius: 4,
            height: 4,
          }),
          bar: { borderRadius: 4 },
        },
      },

      MuiRadio: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            color: theme.palette.text.disabled,
            "&.Mui-checked": {
              color: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
            },
          }),
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: ({ theme }: { theme: typeof baseTheme }) => ({
            color: theme.palette.text.disabled,
            "&.Mui-checked": {
              color: theme.palette.mode === "dark" ? "#60a5fa" : "#1a73e8",
            },
          }),
        },
      },

      // ── Snackbar Alert ────────────────────────────────────────────────────
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 10, fontWeight: 500 },
          filledSuccess: { backgroundColor: "#059669" },
          filledError:   { backgroundColor: "#dc2626" },
          filledWarning: { backgroundColor: "#d97706" },
          filledInfo:    { backgroundColor: "#0284c7" },
        },
      },
    },
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeContextProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>("dark");

  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => setMode((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [mode]
  );

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ColorModeContext.Provider>
  );
}
