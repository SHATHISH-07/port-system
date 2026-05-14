import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Chip,
  Tooltip,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useState } from "react";

// ── Types aligned with the API response ────────────────────────────────────
// API returns cargo_concentration_pct (number) not cargo_concentration (string)
// API returns no total_travel_distance field
// API returns conflict_with as string[] on each berth_conflict_table entry
export interface BerthAnalysisEntry {
  rank: number;
  berth: string;
  terminal: string;
  block: string;
  total_moves: number;
  load_moves: number;
  discharge_moves: number;
  cargo_concentration_pct: number;   // ← correct field name
  intensity: number;
  recommended_cranes: number;
  congestion_risk: "Low" | "Medium" | "High";
  hazardous: number;
  reefer: number;
  oog: number;
  unique_containers: number;
  impact_score?: number;
}

export interface BerthConflictEntry {
  berth: string;
  block: string;
  conflict_risk: "Low" | "Medium" | "High";
  conflict_with: string[];           // ← always populated now
  impact_score: number;
  reason: string;
}

interface Props {
  data: BerthAnalysisEntry[];
  conflicts?: BerthConflictEntry[];  // optional conflict table for tooltip
  mode?: "history" | "current";
}

const LIMIT = 5;

export default function BerthImpactTable({ data, conflicts = [], mode = "current" }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (!data?.length) return null;

  const rows = expanded ? data : data.slice(0, LIMIT);

  // Build a quick lookup: berth → conflict entry
  const conflictMap = Object.fromEntries(
    conflicts.map((c) => [c.berth, c])
  );

  const riskColor = (v: string) => {
    if (v === "High") return theme.palette.error.main;
    if (v === "Medium") return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  const concColor = (pct: number) => {
    if (pct >= 40) return theme.palette.error.main;
    if (pct >= 20) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="overline" sx={{ color: "text.secondary" }}>
          {mode === "history" ? "Historical Berth Ranking" : "Berth Impact Analysis"}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontFamily: "monospace" }}
        >
          {data.length} berths ranked
        </Typography>
      </Box>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48, pl: 3 }}>#</TableCell>
              <TableCell>Berth</TableCell>
              <TableCell align="center">Moves</TableCell>
              <TableCell>Concentration</TableCell>
              <TableCell>Congestion</TableCell>
              <TableCell>Conflicts</TableCell>
              <TableCell align="center">{mode === "history" ? "Avg Cranes" : "Cranes"}</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, i) => {
              const isTop = i === 0;
              const cc = concColor(row.cargo_concentration_pct);
              const rc = riskColor(row.congestion_risk ?? "Low");
              const conflict = conflictMap[row.berth];

              return (
                <TableRow
                  key={row.berth}
                  sx={{
                    bgcolor: isTop
                      ? alpha(theme.palette.primary.main, 0.04)
                      : "transparent",
                    "&:hover": {
                      bgcolor: alpha(theme.palette.action.hover, 0.05),
                    },
                  }}
                >
                  {/* Rank */}
                  <TableCell sx={{ pl: 3 }}>
                    <Typography
                      sx={{
                        fontSize: "0.6875rem",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: isTop
                          ? theme.palette.text.primary
                          : theme.palette.text.disabled,
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </Typography>
                  </TableCell>

                  {/* Berth + "Recommended" badge */}
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box>
                        <Typography
                          sx={{
                            fontSize: "0.875rem",
                            fontWeight: isTop ? 600 : 400,
                            color: isTop
                              ? "text.primary"
                              : "text.secondary",
                            lineHeight: 1.3,
                          }}
                        >
                          {row.berth}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.disabled" }}
                        >
                          {row.terminal}
                        </Typography>
                      </Box>
                      {isTop && (
                        <Box
                          sx={{
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                            border: `1px solid ${alpha(
                              theme.palette.primary.main,
                              0.3
                            )}`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "0.5625rem",
                              fontWeight: 700,
                              color: theme.palette.primary.main,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {mode === "history" ? "Primary Berth" : "Recommended"}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </TableCell>

                  {/* Move counts */}
                  <TableCell align="center">
                    <Tooltip
                      title={`${row.load_moves} load · ${row.discharge_moves} discharge`}
                      arrow
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "monospace",
                          fontWeight: 600,
                          color: "text.primary",
                          cursor: "default",
                        }}
                      >
                        {row.total_moves}
                      </Typography>
                    </Tooltip>
                  </TableCell>

                  {/* Concentration badge — uses cargo_concentration_pct */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1,
                        py: 0.3,
                        borderRadius: 1,
                        bgcolor: alpha(cc, 0.1),
                        border: `1px solid ${alpha(cc, 0.25)}`,
                      }}
                    >
                      <Box
                        sx={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          bgcolor: cc,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: cc,
                          fontFamily: "monospace",
                        }}
                      >
                        {row.cargo_concentration_pct.toFixed(1)}%
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* Congestion risk badge */}
                  <TableCell>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1,
                        py: 0.3,
                        borderRadius: 1,
                        bgcolor: alpha(rc, 0.1),
                        border: `1px solid ${alpha(rc, 0.25)}`,
                      }}
                    >
                      <Box
                        sx={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          bgcolor: rc,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{ fontSize: "0.75rem", fontWeight: 600, color: rc }}
                      >
                        {row.congestion_risk ?? "Low"}
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* Conflicts — now properly populated */}
                  <TableCell>
                    {conflict?.conflict_with?.length ? (
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {conflict.conflict_with.slice(0, 3).map((b) => (
                          <Tooltip key={b} title={conflict.reason} arrow>
                            <Chip
                              label={b}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: "0.625rem",
                                fontWeight: 600,
                                bgcolor: alpha(theme.palette.warning.main, 0.12),
                                color: theme.palette.warning.dark,
                                border: `1px solid ${alpha(
                                  theme.palette.warning.main,
                                  0.3
                                )}`,
                                "& .MuiChip-label": { px: 0.75 },
                              }}
                            />
                          </Tooltip>
                        ))}
                        {conflict.conflict_with.length > 3 && (
                          <Typography
                            variant="caption"
                            sx={{ color: "text.disabled", alignSelf: "center" }}
                          >
                            +{conflict.conflict_with.length - 3}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ color: "text.disabled" }}
                      >
                        None
                      </Typography>
                    )}
                  </TableCell>

                  {/* Recommended cranes */}
                  <TableCell align="center">
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        fontWeight: 600,
                        color: "text.secondary",
                      }}
                    >
                      {row.recommended_cranes}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>

      {/* ── Show more / less ────────────────────────────────────────────────── */}
      {data.length > LIMIT && (
        <Box
          sx={{
            px: 3,
            py: 1.5,
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Button
            onClick={() => setExpanded((v) => !v)}
            variant="text"
            size="small"
            sx={{
              fontSize: "0.8125rem",
              color: "text.secondary",
              p: 0,
              minWidth: 0,
              textTransform: "none",
            }}
          >
            {expanded
              ? "Show fewer"
              : `+ ${data.length - LIMIT} more berths`}
          </Button>
        </Box>
      )}
    </Box>
  );
}