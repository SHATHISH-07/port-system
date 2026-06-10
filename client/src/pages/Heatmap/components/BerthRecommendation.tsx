import {
  Box,
  Typography,
  Stack,
  alpha,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import {
  WarningAmberRounded,
} from "@mui/icons-material";


export interface BerthAnalysis {
  berth: string;
  congestion_risk?: string;
  recommendation_reason?: string;
  recommended_cranes?: number;
  avg_crane_productivity_mph?: number;
  estimated_port_stay_hours?: number;
  cargo_concentration_pct?: number;
  impact_score?: number | string;
  travel_distance_label?: string;
  laden_travel_distance_m?: number;
  unladen_travel_distance_m?: number;
  avg_laden_distance_m?: number;
  avg_unladen_distance_m?: number;
  block_distances?: Record<string, number>;
  hazardous?: number;
  reefer?: number;
}

export interface ConflictVesselDisplay {
  vessel_service: string;
  visit_id: string;
  shared_blocks: string[];
  shared_block_pct?: number;
  shared_corridors?: string[];
  shared_equipment?: string[];
  overlap_hours: number;
}

export interface BerthConflict {
  berth: string;
  reason?: string;
  mitigation?: string;
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

      {/* ── Summary Table ──────────────────────────────────────────────────── */}
      <Box sx={{ mt: 2, mb: 3 }}>
        <TableContainer component={Paper} elevation={0} sx={{
          border: borderStyle,
          borderRadius: "16px",
          bgcolor: isDark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.8)",
          backdropFilter: "blur(10px)",
          overflow: "hidden"
        }}>
          <Table size="medium" sx={{ width: "100%" }}>
            <TableHead sx={{ bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)" }}>
              <TableRow>
                <TableCell sx={{ borderBottom: borderStyle, fontWeight: 900, color: "text.secondary", fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Berth</TableCell>
                <TableCell sx={{ borderBottom: borderStyle, fontWeight: 900, color: "text.secondary", fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cargo Concentration</TableCell>
                <TableCell sx={{ borderBottom: borderStyle, fontWeight: 900, color: "text.secondary", fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Travel Distance</TableCell>
                <TableCell sx={{ borderBottom: borderStyle, fontWeight: 900, color: "text.secondary", fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Congestion Risk</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...(primary ? [primary, ...analysis.filter((b) => b.berth !== primary.berth)] : analysis)]
                .sort((a, b) => a.berth.localeCompare(b.berth))
                .map((row, idx) => {
                  const getCargoDisplay = (pct?: number) => {
                    if (pct === undefined) return "N/A";
                    if (pct >= 70) return `High (${pct}%)`;
                    if (pct >= 40) return `Medium (${pct}%)`;
                    return `Low (${pct}%)`;
                  };
                  const getTravelDist = (label?: string, dist?: number) => {
                    const distStr = dist ? ` (${dist}m)` : "";
                    if (label === "Short" || (dist && dist < 500)) return `Low${distStr}`;
                    if (label === "Moderate" || (dist && dist < 1200)) return `Medium${distStr}`;
                    return `High${distStr}`;
                  };

                  const cargoStr = getCargoDisplay(row.cargo_concentration_pct);
                  const travelStr = getTravelDist(row.travel_distance_label, row.avg_laden_distance_m);
                  const riskStr = row.congestion_risk || "Low";

                  const getValColor = (val: string) => {
                    if (val.includes("High")) return COLORS.error;
                    if (val.includes("Medium")) return COLORS.warning;
                    if (val.includes("Low")) return COLORS.success;
                    return COLORS.info;
                  };

                  const isLast = idx === analysis.length - 1;
                  const bBottom = isLast ? "none" : borderStyle;

                  return (
                    <TableRow key={row.berth} sx={{ "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" } }}>
                      <TableCell sx={{ borderBottom: bBottom, fontWeight: 900, fontSize: '0.95rem', color: "text.primary" }}>
                        {row.berth.replace('Berth ', 'B')}
                        {row.berth === primary?.berth && (
                          <Typography component="span" sx={{ ml: 1, fontSize: '0.65rem', fontWeight: 900, color: COLORS.success, bgcolor: alpha(COLORS.success, 0.1), px: 0.8, py: 0.3, borderRadius: 1 }}>
                            RECOMMENDED
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ borderBottom: bBottom, fontWeight: 700, color: getValColor(cargoStr) }}>{cargoStr}</TableCell>
                      <TableCell sx={{ borderBottom: bBottom, fontWeight: 700, color: getValColor(travelStr) }}>{travelStr}</TableCell>
                      <TableCell sx={{ borderBottom: bBottom, fontWeight: 700, color: getValColor(riskStr) }}>{riskStr}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
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
              >Recommended Selection
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

            <Stack direction="row" spacing={3} sx={{ mt: 0.5, mb: 0.5, flexWrap: "wrap", gap: 3 }}>
              <Box>
                <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.65rem' }}>CARGO NEARBY</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: COLORS.info }}>{primary?.cargo_concentration_pct ?? 0}%</Typography>
              </Box>

              <Box>
                <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.65rem' }}>OVERALL AVG DISTANCE</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {primary?.avg_laden_distance_m ? `${primary.avg_laden_distance_m}m` : 'N/A'}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.65rem' }}>CRANE ALLOCATION</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {primary?.recommended_cranes ? `${primary.recommended_cranes} (${primary.avg_crane_productivity_mph} mph)` : 'N/A'}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.65rem' }}>PRED. PORT STAY</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: COLORS.accent }}>
                  {primary?.estimated_port_stay_hours ? `${primary.estimated_port_stay_hours} hrs` : 'N/A'}
                </Typography>
              </Box>
            </Stack>

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

            {primary?.block_distances && Object.keys(primary.block_distances).length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.65rem', mb: 0.5 }}>
                  BLOCK DISTANCES TO BERTH
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {Object.entries(primary.block_distances).map(([blockId, dist]) => (
                    <Box key={blockId} sx={{
                      px: 1, py: 0.5, borderRadius: 1, bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                      display: "flex", gap: 1, alignItems: "center"
                    }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 900 }}>{blockId}</Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: "text.secondary", fontWeight: 700 }}>{dist}m</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
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
                <Stack direction="row" spacing={2.5} sx={{ mt: 1 }}>
                  <Box>
                    <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.6rem' }}>NEARBY</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>{b.cargo_concentration_pct}%</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.6rem' }}>AVG DISTANCE</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>{b.avg_laden_distance_m ? `${b.avg_laden_distance_m}m` : 'N/A'}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.6rem' }}>CRANES</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>{b.recommended_cranes ?? 'N/A'}</Typography>
                  </Box>
                </Stack>

                {b.block_distances && Object.keys(b.block_distances).length > 0 && (
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: borderStyle }}>
                    <Typography sx={{ color: "text.disabled", display: "block", fontWeight: 700, fontSize: '0.55rem', mb: 0.5 }}>
                      BLOCK DISTANCES
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                      {Object.entries(b.block_distances).map(([blockId, dist]) => (
                        <Box key={blockId} sx={{
                          px: 0.75, py: 0.25, borderRadius: "4px", bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                          display: "flex", gap: 0.5, alignItems: "center"
                        }}>
                          <Typography sx={{ fontSize: '0.6rem', fontWeight: 900 }}>{blockId}</Typography>
                          <Typography sx={{ fontSize: '0.6rem', color: "text.secondary", fontWeight: 600 }}>{dist}m</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
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
                          {cw.overlap_hours}h overlap {cw.shared_block_pct ? `(${cw.shared_block_pct}% blocks)` : ''}
                        </Typography>
                        {cw.shared_corridors && cw.shared_corridors.length > 0 && (
                          <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, color: alpha(COLORS.warning, 0.8) }}>
                            Corridors: {cw.shared_corridors.join(", ")}
                          </Typography>
                        )}
                        {cw.shared_equipment && cw.shared_equipment.length > 0 && (
                          <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, color: alpha(COLORS.warning, 0.8) }}>
                            Equip: {cw.shared_equipment.join(", ")}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Box>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.4 }}>{c.reason}</Typography>
                {c.mitigation && (
                  <Box sx={{ mt: 1, p: 0.75, borderRadius: "6px", bgcolor: alpha(COLORS.warning, 0.1), border: `1px solid ${alpha(COLORS.warning, 0.2)}` }}>
                    <Typography sx={{ fontSize: "0.65rem", fontWeight: 900, color: COLORS.warning, textTransform: "uppercase" }}>
                      Recommended Mitigation: {c.mitigation}
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
