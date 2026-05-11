import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Tooltip,
} from "@mui/material";
import { PrecisionManufacturing } from "@mui/icons-material";
import type { CraneAssignmentEntry } from "../../types/vessel";

interface Props {
  data?: CraneAssignmentEntry[];
  mode?: "history" | "current";
  recommendedCranes?: number;
  loadedOverride?: number;
  dischargedOverride?: number;
}

const ratingColor = (mphc: number): "success" | "warning" | "error" | "default" => {
  if (mphc >= 20) return "success";
  if (mphc >= 10) return "warning";
  if (mphc > 0) return "error";
  return "default";
};

const ratingLabel = (mphc: number) => {
  if (mphc >= 20) return "Optimal";
  if (mphc >= 10) return "Acceptable";
  if (mphc > 0) return "Suboptimal";
  return "No data";
};

function parseCraneIds(raw: string): string[] {
  try {
    return JSON.parse(raw.replace(/'/g, '"'));
  } catch {
    return raw ? [raw] : [];
  }
}

export default function CraneAssignment({
  data,
  mode,
  recommendedCranes,
  loadedOverride,
  dischargedOverride,
}: Props) {
  if (!data || data.length === 0) {
    if (mode === "current" && recommendedCranes != null && recommendedCranes > 0) {
      // Show a synthetic row for "Upcoming" vessels with no live data yet
      const syntheticData: CraneAssignmentEntry[] = [{
        visit_id: "UPCOMING",
        vessel_service: "PLANNED",
        crane_count: recommendedCranes,
        crane_ids: "[]",
        crane_mphc: 0,
        loaded: loadedOverride || 0,
        discharged: dischargedOverride || 0,
        duration_hours: 0,
      }];
      return (
        <CraneAssignment 
          data={syntheticData} 
          mode={mode} 
          recommendedCranes={recommendedCranes} 
          loadedOverride={loadedOverride} 
          dischargedOverride={dischargedOverride} 
        />
      );
    }

    return (
      <Box
        sx={{
          p: 3, borderRadius: 2, border: "1px dashed",
          borderColor: "divider", textAlign: "center",
        }}
      >
        <PrecisionManufacturing sx={{ fontSize: 32, color: "text.disabled", mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          No crane assignment data available for this vessel.
          {mode === "current"
            ? " Crane data will appear once crane movements are ingested for this visit."
            : ""}
        </Typography>
      </Box>
    );
  }

  const totalCranes = Math.max(...data.map((d) => d.crane_count));
  const avgMphc = data.reduce((s, d) => s + d.crane_mphc, 0) / data.length;

  // For current mode, prefer user-entered override values in the summary tiles
  const displayLoaded =
    mode === "current" && loadedOverride != null
      ? loadedOverride
      : data.reduce((s, d) => s + (d.loaded ?? 0), 0);
  const displayDischarged =
    mode === "current" && dischargedOverride != null
      ? dischargedOverride
      : data.reduce((s, d) => s + (d.discharged ?? 0), 0);

  return (
    <Box>
      {/* Summary tiles */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        {[
          { label: "Peak Cranes Assigned", value: totalCranes },
          { label: "Avg. MPHC", value: avgMphc > 0 ? avgMphc.toFixed(1) : "—" },
          { label: "Total Loaded", value: displayLoaded },
          { label: "Total Discharged", value: displayDischarged },
          ...(mode === "current" && recommendedCranes != null
            ? [{ label: "Recommended (ML)", value: recommendedCranes }]
            : []),
        ].map(({ label, value }) => (
          <Box
            key={label}
            sx={{
              px: 2.5, py: 1.5, borderRadius: 2,
              border: "1px solid", borderColor: "divider",
              minWidth: 130,
            }}
          >
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {label}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Per-visit table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>
                {mode === "current" ? "Vessel Service" : "Visit ID"}
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Cranes</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Crane IDs</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>MPHC</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Loaded</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Discharged</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Duration (h)</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Rating</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => {
              const craneList = parseCraneIds(row.crane_ids);
              // In current mode show the vessel service code (e.g. "FF116") the user typed,
              // rather than the opaque internal visit ID (e.g. "MSC180100")
              const displayId =
                mode === "current" && row.vessel_service
                  ? row.vessel_service
                  : row.visit_id;
              return (
                <TableRow key={row.visit_id} hover>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: "monospace", fontWeight: 600 }}
                    >
                      {displayId}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={row.crane_count || "—"}
                      size="small"
                      color={
                        row.crane_count >= 3
                          ? "primary"
                          : row.crane_count >= 2
                          ? "info"
                          : "default"
                      }
                      sx={{ fontWeight: 700, minWidth: 32 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {craneList.length > 0 ? (
                        craneList.map((cid) => (
                          <Tooltip key={cid} title={`Crane ${cid}`}>
                            <Chip
                              label={cid}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: "0.7rem", fontFamily: "monospace" }}
                            />
                          </Tooltip>
                        ))
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          No crane data
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      color={row.crane_mphc > 0 ? "text.primary" : "text.disabled"}
                    >
                      {row.crane_mphc > 0 ? row.crane_mphc.toFixed(1) : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{row.loaded}</TableCell>
                  <TableCell align="right">{row.discharged}</TableCell>
                  <TableCell align="right">
                    {row.duration_hours > 0 ? row.duration_hours.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={ratingLabel(row.crane_mphc)}
                      size="small"
                      color={ratingColor(row.crane_mphc)}
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
