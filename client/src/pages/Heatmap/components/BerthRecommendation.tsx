import React from "react";
import {
  Box,
  Typography,
  Stack,
  Divider,
  alpha,
  useTheme,
  Tooltip,
} from "@mui/material";
import {
  WarningAmberRounded,
  LocalShippingRounded,
  RouteRounded,
  PrecisionManufacturingRounded,
  TrendingUpRounded,
  KeyboardDoubleArrowRightRounded,
} from "@mui/icons-material";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BerthAnalysis {
  berth: string;
  congestion_risk?: string;
  recommendation_reason?: string;
  recommended_cranes?: number;
  cargo_concentration_pct?: number;
  impact_score?: number | string;
  travel_distance_label?: string;
  hazardous?: number;
  reefer?: number;
}

export interface BerthConflict {
  berth: string;
  reason?: string;
  conflict_with?: string[];
}

interface BerthRecommendationProps {
  analysis: BerthAnalysis[];
  conflicts: BerthConflict[];
  primary: BerthAnalysis | null;
}

// ── Design Tokens ─────────────────────────────────────────────────────────────

const COLORS = {
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#0ea5e9",
  accent: "#8b5cf6",
  surface: {
    light: "#ffffff",
    dark: "rgba(15, 23, 42, 0.6)",
  },
};

// ── Helper Components ─────────────────────────────────────────────────────────

const TelemetryTile = ({
  icon,
  label,
  value,
  unit,
  color = "info",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  color?: keyof typeof COLORS;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: "100px",
        p: 1.5,
        borderRadius: "12px",
        bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          transform: "translateY(-2px)",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Box
          sx={{
            display: "flex",
            color: (COLORS as any)[color] || COLORS.info,
            "& svg": { fontSize: 16 },
          }}
        >
          {icon}
        </Box>
        <Typography
          sx={{
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
        <Typography
          sx={{
            fontSize: "1.25rem",
            fontWeight: 800,
            fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
            lineHeight: 1,
          }}
        >
          {value}
        </Typography>
        {unit && (
          <Typography
            sx={{
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "text.disabled",
            }}
          >
            {unit}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const RiskBadge = ({ risk }: { risk?: string }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const r = (risk ?? "").toLowerCase();

  let config = {
    label: "Low Risk",
    color: COLORS.success,
    bg: alpha(COLORS.success, 0.1),
  };
  if (r.includes("high")) {
    config = {
      label: "High Risk",
      color: COLORS.error,
      bg: alpha(COLORS.error, 0.1),
    };
  } else if (r.includes("medium")) {
    config = {
      label: "Med Risk",
      color: COLORS.warning,
      bg: alpha(COLORS.warning, 0.1),
    };
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.5,
        borderRadius: "20px",
        bgcolor: config.bg,
        border: "1px solid",
        borderColor: alpha(config.color, 0.2),
      }}
    >
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: config.color,
          boxShadow: `0 0 8px ${config.color}`,
        }}
      />
      <Typography
        sx={{
          fontSize: "0.7rem",
          fontWeight: 800,
          color: config.color,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {config.label}
      </Typography>
    </Box>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BerthRecommendation({
  analysis,
  conflicts,
  primary,
}: BerthRecommendationProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (!analysis || analysis.length === 0) return null;

  const borderStyle = `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`;

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        pb: 4,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: -1,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 900,
            fontSize: "1.75rem",
            letterSpacing: "-0.03em",
            color: "text.primary",
          }}
        >
          Berth Analysis Report
        </Typography>
      </Box>

      {/* ── Primary Recommendation (Wider Layout) ─────────────────────────── */}
      <Box
        sx={{
          position: "relative",
          borderRadius: "32px",
          overflow: "hidden",
          border: borderStyle,
          background: isDark
            ? `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`
            : COLORS.surface.light,
          boxShadow: isDark
            ? "0 30px 60px rgba(0,0,0,0.5)"
            : "0 30px 60px rgba(0,0,0,0.08)",
        }}
      >
        <Box sx={{ p: 4 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { md: "1.2fr 1fr" },
              gap: 5,
              alignItems: "center",
            }}
          >
            {/* Left Col: Vessel & Reasoning */}
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                <Typography
                  sx={{
                    fontSize: "0.8rem",
                    fontWeight: 900,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: COLORS.info,
                  }}
                >
                  Priority Selection
                </Typography>
                <RiskBadge risk={primary?.congestion_risk} />
              </Box>
              <Typography
                sx={{
                  fontSize: { xs: "3rem", md: "4.5rem" },
                  fontWeight: 900,
                  fontFamily: "'Outfit', sans-serif",
                  lineHeight: 0.9,
                  letterSpacing: "-0.05em",
                  mb: 3,
                }}
              >
                {primary?.berth ?? "—"}
              </Typography>
              <Box
                sx={{
                  p: 3,
                  borderRadius: "20px",
                  bgcolor: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)",
                  border: "1px solid",
                  borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "1.05rem",
                    color: "text.primary",
                    lineHeight: 1.6,
                    fontWeight: 500,
                  }}
                >
                  "{primary?.recommendation_reason ?? "Optimized selection based on current terminal workload."}"
                </Typography>
              </Box>
            </Box>

            {/* Right Col: Stats Grid */}
            <Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 2.5,
                  mb: 2.5,
                }}
              >
                <TelemetryTile
                  icon={<PrecisionManufacturingRounded />}
                  label="Required Cranes"
                  value={primary?.recommended_cranes ?? 0}
                  color="accent"
                />
                <TelemetryTile
                  icon={<LocalShippingRounded />}
                  label="Cargo Density"
                  value={primary?.cargo_concentration_pct ?? 0}
                  unit="%"
                  color="success"
                />
                <TelemetryTile
                  icon={<RouteRounded />}
                  label="Transit Dist."
                  value={primary?.travel_distance_label?.split(" ")[0] ?? "—"}
                  unit={primary?.travel_distance_label?.split(" ")[1] || "M"}
                  color="info"
                />
                <TelemetryTile
                  icon={<TrendingUpRounded />}
                  label="Intel Score"
                  value={primary?.impact_score ?? "—"}
                  color="warning"
                />
              </Box>

              {/* Special Cargo Indicator */}
              {(Number(primary?.hazardous || 0) > 0 || Number(primary?.reefer || 0) > 0) && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: "16px",
                    bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    border: "1px solid",
                    borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                    display: "flex",
                    gap: 3,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 800, color: "text.disabled", textTransform: "uppercase", mb: 0.5 }}>Special Cargo</Typography>
                    <Stack direction="row" spacing={2}>
                      {Number(primary?.hazardous || 0) > 0 && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: COLORS.error }} />
                          <Typography sx={{ fontWeight: 800, fontSize: "0.9rem" }}>{primary?.hazardous} Hazmat</Typography>
                        </Box>
                      )}
                      {Number(primary?.reefer || 0) > 0 && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: COLORS.info }} />
                          <Typography sx={{ fontWeight: 800, fontSize: "0.9rem" }}>{primary?.reefer} Reefer</Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Alternative Options Grid ─────────────────────────────────────── */}
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2.5,
            px: 1,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.9rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "text.secondary",
            }}
          >
            Alternative Scenarios
          </Typography>
          <Typography sx={{ fontSize: "0.8rem", color: "text.disabled", fontWeight: 700 }}>
            {analysis.filter(b => b.berth !== primary?.berth).length} Alternatives Analyzed
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {analysis
            .filter((b) => b.berth !== primary?.berth)
            .map((b, idx) => (
              <Box
                key={`${b.berth}-${idx}`}
              sx={{
                p: 3,
                borderRadius: "24px",
                border: borderStyle,
                bgcolor: isDark ? "rgba(255,255,255,0.02)" : COLORS.surface.light,
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "pointer",
                "&:hover": {
                  borderColor: COLORS.info,
                  bgcolor: isDark ? "rgba(255,255,255,0.04)" : alpha(COLORS.info, 0.03),
                  transform: "translateY(-5px)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                },
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: "8px",
                    bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                    fontSize: "0.75rem",
                    fontWeight: 900,
                    color: "text.disabled",
                  }}
                >
                  #{idx + 2}
                </Box>
                <RiskBadge risk={b.congestion_risk} />
              </Box>
              <Typography sx={{ fontWeight: 900, fontSize: "1.75rem", mb: 1, fontFamily: "'Outfit', sans-serif" }}>
                {b.berth}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: "text.disabled", display: "block", fontWeight: 700 }}>LOAD</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{b.cargo_concentration_pct}%</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: "text.disabled", display: "block", fontWeight: 700 }}>SCORE</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{b.impact_score}</Typography>
                </Box>
                {(Number(b.hazardous || 0) > 0 || Number(b.reefer || 0) > 0) && (
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.disabled", display: "block", fontWeight: 700 }}>SPECIAL</Typography>
                    <Stack direction="row" spacing={0.5}>
                      {Number(b.hazardous || 0) > 0 && <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: COLORS.error }} />}
                      {Number(b.reefer || 0) > 0 && <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: COLORS.info }} />}
                    </Stack>
                  </Box>
                )}
              </Stack>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: COLORS.info }}>
                <Typography sx={{ fontSize: "0.8rem", fontWeight: 800 }}>View Plan</Typography>
                <KeyboardDoubleArrowRightRounded sx={{ fontSize: 16 }} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Conflicts (Wide Section) ────────────────────────────────────── */}
      {conflicts && conflicts.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 3,
              p: 3,
              borderRadius: "24px",
              bgcolor: alpha(COLORS.error, 0.05),
              border: `1px solid ${alpha(COLORS.error, 0.2)}`,
            }}
          >
            <WarningAmberRounded sx={{ color: COLORS.error, fontSize: 32 }} />
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: "1.25rem", color: COLORS.error, letterSpacing: "-0.02em" }}>
                Operational Conflict Warnings
              </Typography>
              <Typography sx={{ fontSize: "0.85rem", color: alpha(COLORS.error, 0.8), fontWeight: 700 }}>
                {conflicts.length} critical scheduling overlaps detected for the selected period.
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2,
            }}
          >
            {conflicts.map((c, idx) => (
              <Box
                key={`${c.berth}-${idx}`}
                sx={{
                  p: 3,
                  borderRadius: "20px",
                  bgcolor: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
                  border: "1px dashed",
                  borderColor: alpha(COLORS.error, 0.3),
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "6px", bgcolor: COLORS.error }} />
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: "1.1rem" }}>Berth {c.berth}</Typography>
                  <Stack direction="row" spacing={1}>
                    {c.conflict_with?.map((cw) => (
                      <Box key={cw} sx={{ px: 1, py: 0.25, borderRadius: "6px", bgcolor: alpha(COLORS.error, 0.12), border: `1px solid ${alpha(COLORS.error, 0.2)}` }}>
                        <Typography sx={{ fontSize: "0.7rem", fontWeight: 900, color: COLORS.error }}>{cw}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
                <Typography sx={{ fontSize: "0.9rem", color: "text.secondary", lineHeight: 1.6 }}>{c.reason}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
