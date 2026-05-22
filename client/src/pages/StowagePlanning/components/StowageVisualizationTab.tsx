import React from 'react';
import {
  Box, Typography, IconButton, alpha, useTheme, CircularProgress, Chip, Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AnchorIcon from '@mui/icons-material/Anchor';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Tooltip from '@mui/material/Tooltip';

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy,
  sortableKeyboardCoordinates, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Design tokens ───────────────────────────────────────────────────────────
const PORT_PALETTE = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#EC4899',
];

// ─── Port pill (draggable) ───────────────────────────────────────────────────
const SortablePortPill = ({
  id, index, color, isActive
}: { id: string; index: number; color: string; isActive: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.6,
        borderRadius: '6px',
        cursor: isDragging ? 'grabbing' : 'grab',
        border: `1px solid ${isDragging ? color : alpha(color, 0.5)}`,
        bgcolor: isDragging ? alpha(color, 0.18) : isActive ? alpha(color, 0.12) : alpha(color, 0.06),
        boxShadow: isDragging ? `0 8px 24px ${alpha(color, 0.35)}` : 'none',
        zIndex: isDragging ? 999 : 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <Box sx={{
        width: 18, height: 18, borderRadius: '50%',
        bgcolor: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
          {index + 1}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color, letterSpacing: '0.03em' }}>
        {id}
      </Typography>
    </Box>
  );
};

// ─── Container cell ──────────────────────────────────────────────────────────
const ContainerCell = ({
  unit, color, isHazmat, onHover
}: { unit: any; color: string; isHazmat?: boolean; onHover?: (unit: any | null) => void }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.25 }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, display: 'block', mb: 0.25 }}>{unit.unitId}</Typography>
          <Typography sx={{ fontSize: '0.65rem', display: 'block', opacity: 0.75 }}>
            {unit.recommendedDeck === 'ABOVE_DECK' ? '▲ Above' : '▼ Below'} · Tier {unit.recommendedTier} · {unit.portOfDischarge}
          </Typography>
          {isHazmat && (
            <Typography sx={{ fontSize: '0.65rem', display: 'block', color: '#f87171', fontWeight: 700, mt: 0.25 }}>
              ⚠ HAZMAT
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
      enterDelay={150}
      enterNextDelay={80}
    >
      <Box
        onMouseEnter={() => onHover?.(unit)}
        onMouseLeave={() => onHover?.(null)}
        sx={{
          width: 22,
          height: 11,
          borderRadius: '1.5px',
          bgcolor: alpha(color, 0.85),
          border: `1px solid ${isDark ? alpha('#000', 0.5) : alpha('#000', 0.3)}`,
          position: 'relative',
          cursor: 'pointer',
          transition: 'transform 0.12s, box-shadow 0.12s',
          '&:hover': {
            transform: 'scale(1.35)',
            zIndex: 20,
            boxShadow: `0 3px 10px ${alpha(color, 0.55)}`,
          },
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 2.5px, ${alpha('#000', 0.12)} 2.5px, ${alpha('#000', 0.12)} 3px)`,
        }}
      >
        {[[0.5, 0.5], [0.5, 'auto'], ['auto', 0.5], ['auto', 'auto']].map(([t, l], i) => (
          <Box key={i} sx={{
            position: 'absolute',
            top: t === 'auto' ? 'auto' : t,
            bottom: t === 'auto' ? 0.5 : 'auto',
            left: l === 'auto' ? 'auto' : l,
            right: l === 'auto' ? 0.5 : 'auto',
            width: 1.5, height: 1.5,
            borderRadius: '50%',
            bgcolor: alpha('#fff', 0.55),
          }} />
        ))}
        <Typography sx={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.35rem', fontWeight: 900,
          color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.8)',
        }}>
          {unit.recommendedTier ?? '?'}
        </Typography>
        {isHazmat && (
          <Box sx={{
            position: 'absolute', top: -3, right: -3,
            width: 5, height: 5, borderRadius: '50%',
            bgcolor: '#ef4444',
            border: `1px solid ${isDark ? '#1a1a1a' : '#fff'}`,
            zIndex: 3,
          }} />
        )}
      </Box>
    </Tooltip>
  );
};

// ─── Bay column ──────────────────────────────────────────────────────────────
const BayColumn = ({
  group, portColors, hazmatIds, onHover, isHighlighted
}: {
  group: any; portColors: Record<string, string>; hazmatIds: Set<string>;
  onHover?: (unit: any | null) => void; isHighlighted?: boolean;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const above = (group.positions || []).filter((p: any) => p.recommendedDeck === 'ABOVE_DECK');
  const below = (group.positions || []).filter((p: any) => p.recommendedDeck === 'BELOW_DECK');
  const portColor = portColors[group.groupId] || theme.palette.primary.main;
  const hasHazmat = (group.positions || []).some((p: any) => hazmatIds.has(p.unitId));

  const sortByTier = (arr: any[]) => [...arr].sort((a, b) => (b.recommendedTier ?? 0) - (a.recommendedTier ?? 0));
  const colWidth = Math.max(44, Math.ceil(Math.max(above.length, below.length) / 7) * 28 + 16);

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      transition: 'opacity 0.2s',
      opacity: isHighlighted === false ? 0.35 : 1,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mb: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: portColor, flexShrink: 0 }} />
        <Typography sx={{
          fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.07em',
          color: portColor, textTransform: 'uppercase',
        }}>
          {group.groupId}
        </Typography>
        {hasHazmat && (
          <WarningAmberIcon sx={{ fontSize: 8, color: '#f87171', ml: 0.25 }} />
        )}
      </Box>

      <Box sx={{
        display: 'flex', flexWrap: 'wrap-reverse', alignContent: 'flex-start',
        justifyContent: 'center', gap: '2px',
        minHeight: 88, width: colWidth,
        pb: 0.5, pt: 0.5,
      }}>
        {sortByTier(above).map((p: any, i: number) => (
          <ContainerCell key={i} unit={p} color={portColors[p.portOfDischarge] || portColor} isHazmat={hazmatIds.has(p.unitId)} onHover={onHover} />
        ))}
        {above.length === 0 && (
          <Box sx={{ width: 36, height: 16, borderRadius: '2px', border: `1px dashed ${alpha(theme.palette.divider, 0.3)}` }} />
        )}
      </Box>

      {/* Hatch cover */}
      <Box sx={{
        width: '100%', minWidth: colWidth, height: 5, borderRadius: '2px',
        background: isDark
          ? 'linear-gradient(180deg, #4a4a4a 0%, #2a2a2a 100%)'
          : 'linear-gradient(180deg, #666 0%, #444 100%)',
        border: `1px solid ${alpha('#000', 0.6)}`,
        my: 0.5, position: 'relative',
        '&::after': {
          content: '""', position: 'absolute',
          top: 1, left: '10%', right: '10%', height: 1.5,
          bgcolor: alpha('#fff', 0.15), borderRadius: '1px',
        }
      }} />

      <Box sx={{
        display: 'flex', flexWrap: 'wrap-reverse', alignContent: 'flex-start',
        justifyContent: 'center', gap: '2px',
        minHeight: 96, width: colWidth, pt: 0.5,
      }}>
        {sortByTier(below).map((p: any, i: number) => (
          <ContainerCell key={i} unit={p} color={portColors[p.portOfDischarge] || portColor} isHazmat={hazmatIds.has(p.unitId)} onHover={onHover} />
        ))}
        {below.length === 0 && (
          <Box sx={{ width: 36, height: 16, borderRadius: '2px', border: `1px dashed ${alpha(theme.palette.divider, 0.2)}` }} />
        )}
      </Box>
    </Box>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function StowageVisualizationTab({
  visualizationData,
  loadingVisualization,
  onClose,
  portRotation,
  onPortRotationChange,
  onDragEnd: onDragEndExternal,
}: any) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hoveredContainer, setHoveredContainer] = React.useState<any | null>(null);
  const [activePort] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const portColorMap: Record<string, string> = {};
  (portRotation || []).forEach((port: string, i: number) => {
    portColorMap[port] = PORT_PALETTE[i % PORT_PALETTE.length];
  });

  const hazmatIds = new Set<string>(
    (visualizationData?.map?.groups || [])
      .flatMap((g: any) => g.positions || [])
      .filter((p: any) => p.isHazardous || p.hazmat)
      .map((p: any) => p.unitId)
  );

  const groups: any[] = visualizationData?.map?.groups || [];

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = portRotation.indexOf(active.id);
      const newIndex = portRotation.indexOf(over.id);
      const newRotation = arrayMove(portRotation, oldIndex, newIndex);
      onPortRotationChange?.(newRotation);
      onDragEndExternal?.(newRotation);
    }
  };

  const getBayHighlight = (group: any) => {
    if (!activePort) return undefined;
    return group.groupId === activePort ? true : false;
  };

  // Hull colors for realistic ship appearance
  const hullTop = isDark ? '#1e2330' : '#475569';
  const hullBottom = isDark ? '#7f1d1d' : '#b91c1c';
  const hullDark = isDark ? '#5f1515' : '#991b1b';

  return (
    <Box sx={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      bgcolor: 'transparent',
      overflow: 'hidden', position: 'relative',
    }}>

      <IconButton
        size="small"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          '&:hover': { bgcolor: isDark ? alpha('#fff', 0.1) : alpha('#000', 0.05) },
        }}
      >
        <CloseIcon sx={{ fontSize: 20 }} />
      </IconButton>

      {/* ── Ship bay grid ── */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{
          flex: 1,
          overflowX: 'auto', overflowY: 'auto',
          display: 'flex', alignItems: 'flex-end',
          p: 2, pb: 4, // Increased padding bottom to move vessel upward
        }}>
          {/* ── The Sea ── */}
          <Box sx={{
            position: 'sticky',
            left: 0,
            width: 0,
            height: 0,
            zIndex: 1, // Covers the lower hull (zIndex 0)
            pointerEvents: 'none',
          }}>
            <Box sx={{
              position: 'absolute',
              bottom: '-32px', // Overcome the pb: 4 (32px) of the scroll container
              left: '-16px', // Overcome the p: 2 (16px) 
              width: '100vw',
              height: '144px', // Fills the 120px margin + 24px of hull (up to waterline)
              background: isDark
                ? 'linear-gradient(180deg, rgba(2, 132, 199, 0.2) 0%, rgba(15, 23, 42, 1) 100%)'
                : 'linear-gradient(180deg, rgba(14, 165, 233, 0.3) 0%, rgba(2, 132, 199, 0.8) 100%)',
              backdropFilter: 'blur(2px)',
              borderTop: `1px solid ${isDark ? alpha('#38bdf8', 0.2) : alpha('#0ea5e9', 0.4)}`,
              boxShadow: `inset 0 4px 20px ${alpha('#0ea5e9', 0.2)}`,
            }}>
              {/* Subtle surface wave reflection */}
              <Box sx={{ 
                width: '100%', height: '4px', 
                background: `repeating-linear-gradient(90deg, transparent, transparent 30px, ${alpha('#fff', 0.15)} 30px, ${alpha('#fff', 0.15)} 60px)`,
                opacity: 0.5 
              }} />
            </Box>
          </Box>

          {/* ── Vessel wrapper — uses SVG hull + absolutely positioned bay columns ── */}
          <Box sx={{
            position: 'relative',
            margin: 'auto auto 120px auto', // Increased bottom margin to lift it up significantly
            display: 'flex',
            alignItems: 'flex-end',
          }}>

            {/*
              Full vessel drawn in SVG so the bow, stern, hull, waterline,
              superstructure, funnel, and anchor are all geometrically correct
              and perfectly aligned.
            */}

            {/* Bay columns sit ABOVE the hull, inside this flex row */}
            <Box sx={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              position: 'relative',
              zIndex: 2,
            }}>

              {/* ── STERN block ── */}
              <Box sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                mb: '80px', mr: '4px', flexShrink: 0, zIndex: 3,
              }}>
                {/* Funnel */}
                <Box sx={{
                  width: 12, height: 20,
                  background: isDark
                    ? 'linear-gradient(180deg, #555 0%, #333 100%)'
                    : 'linear-gradient(180deg, #666 0%, #444 100%)',
                  borderRadius: '3px 3px 0 0',
                  border: `1px solid ${alpha('#000', 0.4)}`,
                  mb: '-1px',
                  position: 'relative',
                  '&::after': {
                    content: '""', position: 'absolute',
                    top: 3, left: 2, right: 2, height: 3,
                    bgcolor: '#c62828', borderRadius: '1px',
                  }
                }} />
                {/* Bridge wings */}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                  <Box sx={{
                    width: 6, height: 6,
                    bgcolor: isDark ? '#2a2d35' : '#adb5bd',
                    border: `1px solid ${alpha('#000', 0.3)}`,
                    borderRight: 'none',
                    borderRadius: '2px 0 0 0',
                  }} />
                  {/* Bridge main */}
                  <Box sx={{
                    width: 44, height: 52,
                    background: isDark
                      ? 'linear-gradient(180deg, #2e3340 0%, #252830 100%)'
                      : 'linear-gradient(180deg, #cfd4db 0%, #b0b8c1 100%)',
                    border: `1px solid ${alpha('#000', 0.3)}`,
                    borderRadius: '2px 2px 0 0',
                    display: 'flex', flexDirection: 'column', gap: '3px',
                    p: '5px', overflow: 'hidden', position: 'relative',
                  }}>
                    {[...Array(4)].map((_, row) => (
                      <Box key={row} sx={{ display: 'flex', gap: '3px' }}>
                        {[...Array(3)].map((_, col) => (
                          <Box key={col} sx={{
                            flex: 1, height: 7,
                            bgcolor: '#87ceeb',
                            opacity: 0.4 + row * 0.07,
                            border: `0.5px solid ${alpha('#000', 0.25)}`,
                            borderRadius: '1px',
                          }} />
                        ))}
                      </Box>
                    ))}
                    {/* Radar mast */}
                    <Box sx={{
                      position: 'absolute', top: -10, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 1.5, height: 10,
                      bgcolor: isDark ? '#888' : '#666',
                    }} />
                  </Box>
                  <Box sx={{
                    width: 6, height: 6,
                    bgcolor: isDark ? '#2a2d35' : '#adb5bd',
                    border: `1px solid ${alpha('#000', 0.3)}`,
                    borderLeft: 'none',
                    borderRadius: '0 2px 0 0',
                  }} />
                </Box>
                {/* Deck below bridge */}
                <Box sx={{
                  width: 56, height: 10,
                  background: isDark
                    ? 'linear-gradient(180deg, #1e2330 0%, #181c26 100%)'
                    : 'linear-gradient(180deg, #8a9ab0 0%, #6b7a8d 100%)',
                  border: `1px solid ${alpha('#000', 0.4)}`,
                  borderBottom: 'none',
                }} />
              </Box>

              {/* ── Bay columns ── */}
              {groups.length === 0 ? (
                <Box sx={{
                  py: 8, px: 10, textAlign: 'center', zIndex: 1,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
                  mb: '80px',
                }}>
                  {loadingVisualization ? (
                    <>
                      <CircularProgress size={28} thickness={4} sx={{ color: isDark ? '#60a5fa' : '#2563eb' }} />
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 600 }}>
                        Loading stowage data…
                      </Typography>
                    </>
                  ) : (
                    <>
                      <AnchorIcon sx={{ fontSize: 32, color: 'text.disabled', opacity: 0.4 }} />
                      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600 }}>
                        No stowage data available
                      </Typography>
                    </>
                  )}
                </Box>
              ) : (
                <Box sx={{
                  display: 'flex', gap: '6px', alignItems: 'flex-end',
                  pb: '24px', zIndex: 1,
                  '& > *:not(:last-child)': {
                    borderRight: `1px dashed ${alpha(isDark ? '#fff' : '#000', 0.05)}`,
                    pr: '5px',
                  }
                }}>
                  {groups.map((group: any) => (
                    <BayColumn
                      key={group.groupId}
                      group={group}
                      portColors={portColorMap}
                      hazmatIds={hazmatIds}
                      onHover={setHoveredContainer}
                      isHighlighted={getBayHighlight(group)}
                    />
                  ))}
                </Box>
              )}

              {/* ── BOW block ── */}
              <Box sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                mb: '12px', ml: '4px', flexShrink: 0, zIndex: 3,
                alignSelf: 'flex-end',
              }}>
                {/* Mast */}
                <Box sx={{
                  width: 2, height: 30,
                  bgcolor: isDark ? '#888' : '#555',
                  ml: '14px', mb: '-2px',
                  position: 'relative',
                  '&::before': {
                    content: '""', position: 'absolute',
                    top: 8, left: -8, width: 18, height: 1.5,
                    bgcolor: isDark ? '#666' : '#444',
                  }
                }} />
                {/* Bow shape: SVG with a proper pointed bow */}
                <Box component="svg"
                  viewBox="0 0 52 96"
                  sx={{ width: 52, height: 96, display: 'block', overflow: 'visible' }}
                >
                  {/* Hull sides — fill from top of superstructure deck height down to waterline */}
                  <defs>
                    <linearGradient id="bowHullGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={hullTop} />
                      <stop offset="35%" stopColor={hullBottom} />
                      <stop offset="100%" stopColor={hullDark} />
                    </linearGradient>
                  </defs>
                  {/*
                    Bow shape:
                    - Starts wide on the left (stern side)
                    - Tapers to a sharp point on the right (bow tip)
                    Top rail goes straight right then curves down to the tip.
                    Bottom (keel) curves up slightly to meet the tip.
                  */}
                  <path
                    d={`
                      M 0 0
                      L 30 0
                      Q 52 0 52 48
                      Q 52 90 30 96
                      L 0 96
                      Z
                    `}
                    fill="url(#bowHullGrad)"
                    stroke={alpha('#000', 0.5)}
                    strokeWidth="1.5"
                  />
                  {/* Waterline stripe */}
                  <path
                    d={`M 0 68 Q 52 68 52 48`}
                    fill="none"
                    stroke={alpha('#fff', 0.25)}
                    strokeWidth="2"
                  />
                  {/* Deck rail line */}
                  <path
                    d={`M 0 12 L 30 12 Q 46 12 48 30`}
                    fill="none"
                    stroke={alpha('#fff', 0.2)}
                    strokeWidth="1.5"
                  />
                  {/* Anchor */}
                  <circle cx="20" cy="74" r="5" fill="none" stroke={alpha('#fff', 0.35)} strokeWidth="1.2" />
                  <line x1="20" y1="69" x2="20" y2="62" stroke={alpha('#fff', 0.35)} strokeWidth="1.2" />
                  <line x1="15" y1="78" x2="25" y2="78" stroke={alpha('#fff', 0.35)} strokeWidth="1.2" />
                  <line x1="15" y1="78" x2="13" y2="74" stroke={alpha('#fff', 0.35)} strokeWidth="1.2" />
                  <line x1="25" y1="78" x2="27" y2="74" stroke={alpha('#fff', 0.35)} strokeWidth="1.2" />
                  {/* Plimsoll mark */}
                  <line x1="6" y1="60" x2="22" y2="60" stroke={alpha('#fff', 0.5)} strokeWidth="1.5" />
                  <line x1="14" y1="53" x2="14" y2="67" stroke={alpha('#fff', 0.5)} strokeWidth="1.5" />
                  <circle cx="14" cy="60" r="5" fill="none" stroke={alpha('#fff', 0.5)} strokeWidth="1.2" />
                </Box>
              </Box>
            </Box>

            {/* ── SVG hull underlay (stern + main hull body) ── */}
            <Box sx={{
              position: 'absolute',
              bottom: 0, left: 0, right: 52,  // right: bow width
              height: 96,
              zIndex: 0,
              pointerEvents: 'none',
            }}>
              <Box component="svg"
                viewBox="0 0 100% 96"
                preserveAspectRatio="none"
                sx={{ width: '100%', height: '100%', display: 'block' }}
              >
                <defs>
                  <linearGradient id="mainHullGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={hullTop} />
                    <stop offset="35%" stopColor={hullBottom} />
                    <stop offset="100%" stopColor={hullDark} />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100%" height="96" fill="url(#mainHullGrad)" />
                {/* Waterline stripe */}
                <rect x="0" y="66" width="100%" height="2" fill={alpha('#fff', 0.12)} />
                {/* Deck rail */}
                <rect x="0" y="11" width="100%" height="2" fill={alpha('#fff', 0.15)} />
                {/* Hull panel lines */}
                <rect x="0" y="30" width="100%" height="1" fill={alpha('#000', 0.2)} />
                <rect x="0" y="50" width="100%" height="1" fill={alpha('#000', 0.2)} />
                {/* Top border */}
                <rect x="0" y="0" width="100%" height="1.5" fill={alpha('#000', 0.5)} />
                {/* Bottom */}
                <rect x="0" y="94" width="100%" height="2" fill={alpha('#000', 0.5)} />
              </Box>
            </Box>

            {/* ── Stern cap (curved back) ── */}
            <Box sx={{
              position: 'absolute',
              bottom: 0, left: 0,
              width: 24, height: 96,
              zIndex: 1,
              pointerEvents: 'none',
            }}>
              <Box component="svg" viewBox="0 0 24 96" sx={{ width: '100%', height: '100%', display: 'block' }}>
                <defs>
                  <linearGradient id="sternGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={hullTop} />
                    <stop offset="35%" stopColor={hullBottom} />
                    <stop offset="100%" stopColor={hullDark} />
                  </linearGradient>
                </defs>
                <path
                  d={`M 24 0 Q 0 0 0 48 Q 0 90 24 96 L 24 0 Z`}
                  fill="url(#sternGrad)"
                  stroke={alpha('#000', 0.5)}
                  strokeWidth="1.5"
                />
                {/* Stern rail */}
                <path d={`M 24 12 Q 6 12 4 32`} fill="none" stroke={alpha('#fff', 0.2)} strokeWidth="1.5" />
                {/* Stern waterline */}
                <path d={`M 24 67 Q 2 67 1 48`} fill="none" stroke={alpha('#fff', 0.2)} strokeWidth="1.5" />
              </Box>
            </Box>

          </Box>
        </Box>
      </Box>

      {/* ── Route Sequence at Bottom ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        justifyContent: 'center',
        px: 2, py: 1.5,
        borderTop: `1px solid ${isDark ? alpha('#fff', 0.05) : alpha('#000', 0.06)}`,
        bgcolor: isDark ? alpha('#000', 0.2) : alpha('#000', 0.02),
        flexShrink: 0,
      }}>
        <Typography sx={{
          fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em',
          color: 'text.disabled', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Route Sequence
        </Typography>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={portRotation || []} strategy={horizontalListSortingStrategy}>
            <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center', overflowX: 'auto', pb: 0.5 }}>
              {(portRotation || []).map((portId: string, i: number) => {
                const isLast = i < portRotation.length - 1;
                return (
                  <React.Fragment key={portId}>
                    <SortablePortPill
                      id={portId}
                      index={i}
                      color={portColorMap[portId] || theme.palette.primary.main}
                      isActive={activePort === portId}
                    />
                    {isLast && (
                      <Typography sx={{ color: 'text.disabled', fontSize: '0.65rem', flexShrink: 0 }}>›</Typography>
                    )}
                  </React.Fragment>
                );
              })}
            </Box>
          </SortableContext>
        </DndContext>
      </Box>

      {/* ── Hover detail panel ── */}
      {hoveredContainer && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            top: 64, right: 16,
            width: 580, // Substantially increased width
            borderRadius: '12px',
            bgcolor: isDark ? alpha('#1a1d26', 0.97) : alpha('#fff', 0.97),
            backdropFilter: 'blur(16px)',
            border: `1px solid ${isDark ? alpha('#fff', 0.1) : alpha('#000', 0.1)}`,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 999,
            boxShadow: `0 8px 32px ${alpha('#000', isDark ? 0.5 : 0.15)}`,
          }}
        >
          {/* Header strip */}
          <Box sx={{
            px: 2, py: 1.25,
            background: isDark
              ? `linear-gradient(135deg, ${alpha(portColorMap[hoveredContainer.portOfDischarge] || '#3b82f6', 0.2)} 0%, transparent 70%)`
              : `linear-gradient(135deg, ${alpha(portColorMap[hoveredContainer.portOfDischarge] || '#3b82f6', 0.08)} 0%, transparent 70%)`,
            borderBottom: `1px solid ${isDark ? alpha('#fff', 0.07) : alpha('#000', 0.07)}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.02em', color: 'text.primary' }}>
                {hoveredContainer.unitId}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.1 }}>
                {hoveredContainer.freightKind} · {hoveredContainer.containerLength?.replace('BASIC', '')}'
                &nbsp;·&nbsp;{hoveredContainer.recommendedDeck === 'ABOVE_DECK' ? 'Above deck' : 'Below deck'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
              {hoveredContainer.status && (
                <Chip
                  label={hoveredContainer.status}
                  size="small"
                  sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700, borderRadius: '4px' }}
                />
              )}
              {hazmatIds.has(hoveredContainer.unitId) && (
                <Chip
                  icon={<WarningAmberIcon sx={{ fontSize: '10px !important' }} />}
                  label="HAZMAT"
                  size="small"
                  sx={{
                    height: 18, fontSize: '0.58rem', fontWeight: 800, borderRadius: '4px',
                    bgcolor: alpha('#ef4444', 0.15), color: '#ef4444',
                    border: `1px solid ${alpha('#ef4444', 0.35)}`,
                    '& .MuiChip-icon': { color: '#ef4444' },
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Detail fields */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 0.5 }}>
              {[
                { label: 'Port of Discharge', value: hoveredContainer.portOfDischarge },
                { label: 'Deck · Tier', value: `${hoveredContainer.recommendedDeck === 'ABOVE_DECK' ? 'Above' : 'Below'} · T${hoveredContainer.recommendedTier}` },
                { label: 'Weight category', value: hoveredContainer.weightCategory || 'STD' },
                { label: 'Weight (kg)', value: hoveredContainer.weightKg ? Math.round(hoveredContainer.weightKg).toLocaleString() : null },
                { label: 'Carrier', value: hoveredContainer.actualOutboundCarrierVisitId?.slice(0, 3) },
                { label: 'Service', value: hoveredContainer.outboundService },
                { label: 'Yard slot', value: hoveredContainer.currentSlotPosition },
                {
                  label: 'Reshuffle risk',
                  value: hoveredContainer.reshuffleRisk || 'LOW',
                  accent: hoveredContainer.reshuffleRisk === 'HIGH'
                    ? '#ef4444'
                    : hoveredContainer.reshuffleRisk === 'MEDIUM'
                      ? '#f59e0b'
                      : undefined,
                },
              ].map(({ label, value, accent }: any) => (
                <Box key={label} sx={{ py: 0.5, px: 0 }}>
                  <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: accent || 'text.primary', mt: 0.1 }}>
                    {value || '—'}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  );
}