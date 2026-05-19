import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  alpha,
  useTheme,
  Grid,
  Tooltip,
} from '@mui/material';

export default function VesselDeckGrid({ bayId, bayData = [], summary = {} }: any) {
  const theme = useTheme();

  // Track hovered container state for interactive side info card
  const [hoveredSlot, setHoveredSlot] = useState<any>(null);

  // Group slots by Tier (y-axis) and Row (x-axis)
  const slots: any[] = Array.isArray(bayData) ? bayData : [];

  const uniqueTiers = Array.from(new Set(slots.map(s => Number(s.parsedTier)))).sort((a, b) => b - a);
  const uniqueRows = Array.from(new Set(slots.map(s => Number(s.parsedRow)))).sort((a, b) => a - b);

  // Color Mapping Helper
  const getWeightBandStyles = (band?: string) => {
    switch (band?.toUpperCase()) {
      case 'HEAVY':
        return {
          bg: alpha(theme.palette.error.main, 0.15),
          border: theme.palette.error.main,
          text: 'error.main',
        };
      case 'MEDIUM':
        return {
          bg: alpha(theme.palette.warning.main, 0.15),
          border: theme.palette.warning.main,
          text: 'warning.main',
        };
      case 'LIGHT':
        return {
          bg: alpha(theme.palette.primary.main, 0.15),
          border: theme.palette.primary.main,
          text: 'primary.main',
        };
      default:
        return {
          bg: alpha(theme.palette.text.disabled, 0.05),
          border: theme.palette.divider,
          text: 'text.secondary',
        };
    }
  };

  const getReshuffleBorder = (risk?: string) => {
    switch (risk?.toUpperCase()) {
      case 'HIGH':
        return `3px solid ${theme.palette.error.main}`;
      case 'MEDIUM':
        return `2px dashed ${theme.palette.warning.main}`;
      case 'LOW':
        return `1.5px solid ${theme.palette.success.main}`;
      default:
        return `1px solid ${theme.palette.divider}`;
    }
  };

  return (
    <Grid container spacing={3.5}>
      {/* 2D Digital Twin Bay Cross Section Map */}
      <Grid size={{ xs: 12, lg: 8 }}>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 4.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.paper, 0.6),
            backdropFilter: 'blur(10px)',
            overflowX: 'auto',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              Bay Section Plan: {bayId}
            </Typography>
            {/* Legend info */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: alpha(theme.palette.primary.main, 0.2), border: '1px solid', borderColor: 'primary.main' }} />
                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>Light</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: alpha(theme.palette.warning.main, 0.2), border: '1px solid', borderColor: 'warning.main' }} />
                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>Medium</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: alpha(theme.palette.error.main, 0.2), border: '1px solid', borderColor: 'error.main' }} />
                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>Heavy</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 1, border: `2px dashed ${theme.palette.warning.main}` }} />
                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>Reshuffle Risk</Typography>
              </Box>
            </Box>
          </Box>

          {/* Graphical Grid Layout */}
          <Box sx={{ minWidth: 600, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {uniqueTiers.map((tier) => {
              // Check if tier is above deck boundary (typically tier >= 70 or 80)
              const isAboveDeck = tier >= 80;

              return (
                <Box key={tier} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {/* Tier Label (e.g. T-82) */}
                  <Typography
                    variant="caption"
                    sx={{
                      width: 40,
                      fontWeight: 800,
                      color: isAboveDeck ? 'primary.main' : 'text.secondary',
                      fontSize: '0.7rem',
                      textAlign: 'right',
                      pr: 1,
                    }}
                  >
                    {isAboveDeck ? `Deck ${tier}` : `Hold ${tier}`}
                  </Typography>

                  {/* Grid Rows */}
                  <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                    {uniqueRows.map((row) => {
                      const slot = slots.find(
                        (s) => Number(s.parsedTier) === tier && Number(s.parsedRow) === row
                      );

                      if (!slot) {
                        // Empty spacer for aligned grid matching
                        return (
                          <Box
                            key={row}
                            sx={{
                              flex: 1,
                              height: 38,
                              borderRadius: 1.5,
                              border: '1.5px dashed',
                              borderColor: alpha(theme.palette.divider, 0.4),
                              bgcolor: 'transparent',
                              opacity: 0.25,
                            }}
                          />
                        );
                      }

                      const hasContainer = !!slot.containerId;
                      const styles = getWeightBandStyles(slot.weightBand);
                      const reshuffleBorder = hasContainer ? getReshuffleBorder(slot.reshuffleRisk) : `1px solid ${theme.palette.divider}`;

                      return (
                        <Tooltip
                          key={row}
                          title={
                            hasContainer ? (
                              <Box sx={{ p: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, display: 'block' }}>
                                  {slot.containerId}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem' }}>
                                  Slot: {slot.slotCode} | Port: {slot.dischargePort || 'N/A'}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem' }}>
                                  Weight: {slot.weight?.toLocaleString() || 0} kg ({slot.weightBand})
                                </Typography>
                              </Box>
                            ) : (
                              'Empty Slot'
                            )
                          }
                          arrow
                        >
                          <Box
                            onMouseEnter={() => hasContainer && setHoveredSlot(slot)}
                            onMouseLeave={() => setHoveredSlot(null)}
                            sx={{
                              flex: 1,
                              height: 38,
                              borderRadius: 2,
                              bgcolor: styles.bg,
                              border: reshuffleBorder,
                              cursor: hasContainer ? 'pointer' : 'default',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              transition: 'all 0.15s ease-in-out',
                              position: 'relative',
                              '&:hover': {
                                transform: hasContainer ? 'scale(1.05)' : 'none',
                                zIndex: 10,
                                boxShadow: hasContainer ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
                              },
                            }}
                          >
                            {hasContainer && (
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: '0.6rem',
                                  fontWeight: 800,
                                  color: styles.text,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {slot.containerId.substring(0, 4)}
                              </Typography>
                            )}
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}

            {/* Row index labels at the bottom */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
              <Box sx={{ width: 40 }} />
              <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
                {uniqueRows.map((row) => (
                  <Typography
                    key={row}
                    variant="caption"
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      fontWeight: 800,
                      color: 'text.secondary',
                      fontSize: '0.7rem',
                    }}
                  >
                    R-{row < 10 ? `0${row}` : row}
                  </Typography>
                ))}
              </Box>
            </Box>
          </Box>
        </Paper>
      </Grid>

      {/* Floating Info Details Card */}
      <Grid size={{ xs: 12, lg: 4 }}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 4.5,
            border: '1px solid',
            borderColor: 'divider',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.95)} 0%, ${alpha(theme.palette.background.paper, 0.7)} 100%)`,
          }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
              Active Container Details
            </Typography>

            {hoveredSlot ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Container ID</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: 'primary.main', fontFamily: 'monospace' }}>
                    {hoveredSlot.containerId}
                  </Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Slot Location</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {hoveredSlot.slotCode} (Bay {hoveredSlot.parsedBay})
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Deck / Hold</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {hoveredSlot.parsedDeck === 'ABOVE' ? 'Above Deck' : 'Below Deck hold'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Weight Band</Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        color:
                          hoveredSlot.weightBand === 'HEAVY'
                            ? 'error.main'
                            : hoveredSlot.weightBand === 'MEDIUM'
                              ? 'warning.main'
                              : 'primary.main',
                      }}
                    >
                      {hoveredSlot.weightBand} ({hoveredSlot.weight?.toLocaleString()} kg)
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Discharge Port</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {hoveredSlot.dischargePort || 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>

                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    bgcolor:
                      hoveredSlot.reshuffleRisk === 'HIGH'
                        ? alpha(theme.palette.error.main, 0.05)
                        : hoveredSlot.reshuffleRisk === 'MEDIUM'
                          ? alpha(theme.palette.warning.main, 0.05)
                          : alpha(theme.palette.success.main, 0.05),
                    border: '1px solid',
                    borderColor:
                      hoveredSlot.reshuffleRisk === 'HIGH'
                        ? alpha(theme.palette.error.main, 0.2)
                        : hoveredSlot.reshuffleRisk === 'MEDIUM'
                          ? alpha(theme.palette.warning.main, 0.2)
                          : alpha(theme.palette.success.main, 0.2),
                  }}
                >
                  <Typography variant="caption" color="text.secondary">Reshuffle Risk Rating</Typography>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 800,
                      color:
                        hoveredSlot.reshuffleRisk === 'HIGH'
                          ? 'error.main'
                          : hoveredSlot.reshuffleRisk === 'MEDIUM'
                            ? 'warning.main'
                            : 'success.main',
                    }}
                  >
                    {hoveredSlot.reshuffleRisk || 'LOW'} RISK
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.65rem' }}>
                    {hoveredSlot.reshuffleRisk === 'HIGH'
                      ? 'Requires safety audit. Placing heavy items above lighter hold containers creates stack instability.'
                      : 'Excellent placement. Follows correct heaviest-to-lightest stacking order.'}
                  </Typography>
                </Paper>
              </Box>
            ) : (
              <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary', opacity: 0.7 }}>
                <Typography variant="body2">
                  Hover over any occupied stowed slot inside the 2D plan to view its digital twin telemetry.
                </Typography>
              </Box>
            )}
          </Box>

          {/* Quick Summary Metrics */}
          <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, display: 'block', mb: 1 }}>
              Stowage Safety Metres
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary">Reshuffles</Typography>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {summary.totalReshuffleRiskCount || 0} slots
                </Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary">Total Cargo Wt</Typography>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {((summary.totalCargoWeight || 0) / 1000).toFixed(1)} MT
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}
