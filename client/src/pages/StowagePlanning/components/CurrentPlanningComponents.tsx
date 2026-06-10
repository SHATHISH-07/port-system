import { useState } from "react";
import {
  Box,
  Typography,
  Grid,
  TableRow,
  TableCell,
  Collapse,
  IconButton,
  alpha,
  type Theme,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import type { StepData } from "../../../types/stowage";

export const StatusChip = ({ label, theme }: { label: string; theme: Theme }) => {
  let color = theme.palette.success.main;
  if (label === "HIGH" || label === "HEAVY") color = theme.palette.error.main;
  if (label === "MEDIUM") color = theme.palette.warning.main;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: alpha(color, 0.15),
        color,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        fontSize: "0.65rem",
        fontWeight: 800,
        letterSpacing: 0.5,
        border: `1px solid ${alpha(color, 0.2)}`,
      }}
    >
      {label}
    </Box>
  );
};

export function CompactRow({ step, theme }: { step: StepData; theme: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        sx={{
          "& > *": {
            borderBottom: "1px solid",
            borderColor: alpha(theme.palette.divider, 0.5),
            py: 0.75,
          },
          transition: "background-color 0.2s ease",
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05) },
        }}
      >
        <TableCell padding="checkbox">
          <IconButton
            size="small"
            onClick={() => setOpen(!open)}
            sx={{ color: open ? "primary.main" : "text.secondary" }}
          >
            {open ? (
              <KeyboardArrowUpIcon fontSize="small" />
            ) : (
              <KeyboardArrowDownIcon fontSize="small" />
            )}
          </IconButton>
        </TableCell>
        <TableCell
          sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary" }}
        >
          {String(step.stepIndex).padStart(2, "0")}
        </TableCell>
        <TableCell
          sx={{
            fontFamily: "monospace",
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "primary.main",
          }}
        >
          {step.unitId}
        </TableCell>
        <TableCell
          sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.primary" }}
        >
          {step.portOfDischarge}
        </TableCell>
        <TableCell>
          <StatusChip label={step.weightCategory || ""} theme={theme} />
        </TableCell>
        <TableCell
          sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.primary" }}
        >
          {step.recommendedDeck}{" "}
          <Typography
            component="span"
            variant="caption"
            sx={{ fontWeight: 800, color: "text.secondary", ml: 0.5 }}
          >
            {step.recommendedBay && step.recommendedRow ? (
              `B${step.recommendedBay} R${step.recommendedRow} T${step.recommendedTier}`
            ) : (
              `T${step.recommendedTier}`
            )}
          </Typography>
        </TableCell>
        <TableCell>
          <StatusChip label={step.reshuffleRisk || ""} theme={theme} />
        </TableCell>
        <TableCell
          align="right"
          sx={{ fontSize: "0.75rem", fontWeight: 800, color: "text.primary" }}
        >
          {step.loadingPriority}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell
          style={{ paddingBottom: 0, paddingTop: 0, border: "none" }}
          colSpan={8}
        >
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box
              sx={{
                m: 1,
                mb: 2,
                p: 2,
                bgcolor: "background.paper",
                boxShadow: theme.shadows[2],
                borderLeft: `3px solid ${theme.palette.primary.main}`,
                borderRadius: 2,
              }}
            >
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    Reasoning
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: "0.8rem", color: "text.secondary" }}
                  >
                    {step.recommendedReason}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    Yard Origin
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "text.primary",
                    }}
                  >
                    Block {step.currentYardBlock}{" "}
                    <span
                      style={{
                        color: theme.palette.text.disabled,
                        margin: "0 4px",
                      }}
                    >
                      |
                    </span>{" "}
                    {step.currentSlotPosition}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    Outbound
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "text.primary",
                    }}
                  >
                    {step.actualOutboundCarrierVisitId || "TBD"}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
