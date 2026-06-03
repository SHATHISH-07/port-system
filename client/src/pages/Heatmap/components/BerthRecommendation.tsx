import {
  Box,
  Typography,
  Stack,
  alpha,
  useTheme,
} from "@mui/material";
import {
  WarningAmberRounded
} from "@mui/icons-material";


export interface BerthAnalysis {
  berth: string;
  congestion_risk?: string;
  recommendation_reason?: string;
  recommended_cranes?: number;
  cargo_concentration_pct?: number;
  impact_score?: number | string;
  travel_distance_label?: string;
  laden_travel_distance_m?: number;
  unladen_travel_distance_m?: number;
  hazardous?: number;
  reefer?: number;
}

export interface ConflictVesselDisplay {
  vessel_service: string;
  visit_id: string;
  shared_blocks: string[];
  overlap_hours: number;
}

export interface BerthConflict {
  berth: string;
  reason?: string;
  conflict_with?: ConflictVesselDisplay[];
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
        gap: 2,
        pb: 2,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: -0.5,
        }}
      >
        <Typography
          sx={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 900,
            fontSize: "1.1rem",
            color: "text.primary",
          }}
        >
          Berth Analysis Report
        </Typography>
      </Box>

      {/* ── Primary Recommendation (Compact layout) ─────────────────────────── */}
      <Box
        sx={{
          position: "relative",
          borderRadius: "16px",
          overflow: "hidden",
          border: borderStyle,
          background: isDark
            ? `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`
            : COLORS.surface.light,
          boxShadow: isDark
            ? "0 10px 20px rgba(0,0,0,0.3)"
            : "0 10px 20px rgba(0,0,0,0.04)",
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography
                sx={{
                  fontSize: "0.65rem",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: COLORS.info,
                }}
              >
                Priority Selection
              </Typography>
            </Box>
            <Typography
              sx={{
                fontSize: "2rem",
                fontWeight: 900,
                fontFamily: "'Outfit', sans-serif",
                lineHeight: 1,
                letterSpacing: "-0.03em",
              }}
            >
              {primary?.berth ?? "—"}
            </Typography>
            <Box
              sx={{
                p: 1.5,
                borderRadius: "12px",
                bgcolor: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.03)",
                border: "1px solid",
                borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.85rem",
                  color: "text.primary",
                  lineHeight: 1.4,
                  fontWeight: 500,
                }}
              >
                "{primary?.recommendation_reason ?? "Optimized selection based on current workload."}"
              </Typography>
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
            mb: 1.5,
            px: 0.5,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "text.secondary",
            }}
          >
            Alternative Scenarios
          </Typography>
          <Typography sx={{ fontSize: "0.7rem", color: "text.disabled", fontWeight: 700 }}>
            {analysis.filter(b => b.berth !== primary?.berth).length} Alternatives
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: 1.5,
          }}
        >
          {analysis
              .filter((b) => b.berth !== primary?.berth)
              .map((b, idx) => (
                <Box
                  key={`${b.berth}-${idx}`}
                  sx={{
                    p: 1.5,
                    borderRadius: "16px",
                    border: borderStyle,
                    bgcolor: isDark ? "rgba(255,255,255,0.02)" : COLORS.surface.light,
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    cursor: "pointer",
                    "&:hover": {
                      borderColor: COLORS.info,
                      bgcolor: isDark ? "rgba(255,255,255,0.04)" : alpha(COLORS.info, 0.03),
                      transform: "translateY(-3px)",
                      boxShadow: "0 6px 15px rgba(0,0,0,0.06)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: "6px",
                        bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                        fontSize: "0.65rem",
                        fontWeight: 900,
                        color: "text.disabled",
                      }}
                    >
                      #{idx + 2}
                    </Box>
                  </Box>
                  <Typography sx={{ fontWeight: 900, fontSize: "1.1rem", mb: 0.5, fontFamily: "'Outfit', sans-serif" }}>
                    {b.berth}
                  </Typography>
                  <Stack direction="row" spacing={2.5}>
                    <Box>
                      <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.6rem' }}>LOAD</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.75rem' }}>{b.cargo_concentration_pct}%</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.6rem' }}>LADEN DIST.</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.75rem' }}>{b.laden_travel_distance_m ? `${b.laden_travel_distance_m}m` : 'N/A'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.6rem' }}>EMPTY DIST.</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.75rem' }}>{b.unladen_travel_distance_m ? `${b.unladen_travel_distance_m}m` : 'N/A'}</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
        </Box>
      </Box>

      {/* ── Conflicts (Wide Section) ────────────────────────────────────── */}
      {conflicts && conflicts.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 1.5,
              p: 1.5,
              borderRadius: "16px",
              bgcolor: alpha(COLORS.error, 0.05),
              border: `1px solid ${alpha(COLORS.error, 0.15)}`,
            }}
          >
            <WarningAmberRounded sx={{ color: COLORS.error, fontSize: 24 }} />
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: "0.95rem", color: COLORS.error, letterSpacing: "-0.01em" }}>
                Operational Conflict Warnings
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: alpha(COLORS.error, 0.8), fontWeight: 700 }}>
                {conflicts.length} overlaps detected for the selected period.
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 1.5,
            }}
          >
            {conflicts.map((c, idx) => (
              <Box
                key={`${c.berth}-${idx}`}
                sx={{
                  p: 1.5,
                  borderRadius: "12px",
                  bgcolor: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
                  border: "1px dashed",
                  borderColor: alpha(COLORS.error, 0.3),
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", bgcolor: COLORS.error }} />
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1, flexWrap: "wrap", gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: "0.9rem" }}>Berth {c.berth}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                    {c.conflict_with?.map((cw) => (
                      <Box
                        key={cw.visit_id}
                        sx={{ px: 0.75, py: 0.25, borderRadius: "4px", bgcolor: alpha(COLORS.error, 0.1), border: `1px solid ${alpha(COLORS.error, 0.15)}` }}
                      >
                        <Typography sx={{ fontSize: "0.6rem", fontWeight: 900, color: COLORS.error }}>
                          {cw.vessel_service}
                        </Typography>
                        <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, color: alpha(COLORS.error, 0.7) }}>
                          {cw.overlap_hours}h overlap
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.4 }}>{c.reason}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
