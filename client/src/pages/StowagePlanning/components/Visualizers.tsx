import { Box, Typography, Tooltip, alpha, useTheme } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { StepData, VisualizationGroup } from "../../../types/stowage";

export const PORT_PALETTE = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#F97316",
  "#EC4899",
];

export const SortablePortPill = ({
  id,
  index,
  color,
  isActive,
  isMobile,
}: {
  id: string;
  index: number;
  color: string;
  isActive: boolean;
  isMobile?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      sx={{
        transform: CSS.Transform.toString(
          isMobile && transform
            ? { ...transform, x: -transform.y, y: 0 }
            : transform
        ),
        transition,
        display: "flex",
        alignItems: "center",
        gap: { xs: 0.5, md: 0.75 },
        px: { xs: 1, md: 1.5 },
        py: { xs: 0.4, md: 0.6 },
        borderRadius: "6px",
        cursor: isDragging ? "grabbing" : "grab",
        border: `1px solid ${isDragging ? color : alpha(color, 0.5)}`,
        bgcolor: isDragging
          ? alpha(color, 0.18)
          : isActive
            ? alpha(color, 0.12)
            : alpha(color, 0.06),
        boxShadow: isDragging ? `0 8px 24px ${alpha(color, 0.35)}` : "none",
        zIndex: isDragging ? 999 : 1,
        userSelect: "none",
        touchAction: "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width: { xs: 14, md: 18 },
          height: { xs: 14, md: 18 },
          borderRadius: "50%",
          bgcolor: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontSize: { xs: "0.5rem", md: "0.6rem" },
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {index + 1}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontSize: { xs: "0.6rem", md: "0.72rem" },
          fontWeight: 700,
          color,
          letterSpacing: "0.03em",
        }}
      >
        {id}
      </Typography>
    </Box>
  );
};

export const ContainerCell = ({
  unit,
  color,
  isHazmat,
  onHover,
  onClick,
  isMobile,
}: {
  unit: StepData;
  color: string;
  isHazmat?: boolean;
  onHover?: (unit: StepData | null) => void;
  onClick?: (unit: StepData) => void;
  isMobile?: boolean;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (isMobile) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) {
            onClick(unit);
          } else if (onHover) {
            onHover(unit);
          }
        }}
        style={{
          width: 16,
          height: 8,
          borderRadius: "1.5px",
          backgroundColor: color,
          opacity: 0.85,
          border: `1px solid ${isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.3)"}`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.28rem",
            fontWeight: 900,
            color: "#fff",
          }}
        >
          {unit.recommendedTier ?? "?"}
        </div>
        {isHazmat && (
          <div
            style={{
              position: "absolute",
              top: -1,
              right: -1,
              width: 3,
              height: 3,
              borderRadius: "50%",
              backgroundColor: "#ef4444",
              border: `1px solid ${isDark ? "#1a1a1a" : "#fff"}`,
              zIndex: 3,
            }}
          />
        )}
      </div>
    );
  }

  const content = (
    <Box
      onMouseEnter={() => onHover?.(unit)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onClick?.(unit)}
      sx={{
        width: 22,
        height: 11,
        borderRadius: "1.5px",
        bgcolor: alpha(color, 0.85),
        border: `1px solid ${isDark ? alpha("#000", 0.5) : alpha("#000", 0.3)}`,
        position: "relative",
        cursor: "pointer",
        transition: "transform 0.12s, box-shadow 0.12s",
        "&:hover": {
          transform: "scale(1.35)",
          zIndex: 20,
          boxShadow: `0 3px 10px ${alpha(color, 0.55)}`,
        },
        backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 2.5px, ${alpha("#000", 0.12)} 2.5px, ${alpha("#000", 0.12)} 3px)`,
      }}
    >
      {[
        [0.5, 0.5],
        [0.5, "auto"],
        ["auto", 0.5],
        ["auto", "auto"],
      ].map(([t, l], i) => (
        <Box
          key={i}
          sx={{
            position: "absolute",
            top: t === "auto" ? "auto" : t,
            bottom: t === "auto" ? 0.5 : "auto",
            left: l === "auto" ? "auto" : l,
            right: l === "auto" ? 0.5 : "auto",
            width: 1.5,
            height: 1.5,
            borderRadius: "50%",
            bgcolor: alpha("#fff", 0.55),
          }}
        />
      ))}
      <Typography
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.35rem",
          fontWeight: 900,
          color: "#fff",
          textShadow: "0 0 3px rgba(0,0,0,0.8)",
        }}
      >
        {unit.recommendedTier ?? "?"}
      </Typography>
      {isHazmat && (
        <Box
          sx={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: "#ef4444",
            border: `1px solid ${isDark ? "#1a1a1a" : "#fff"}`,
            zIndex: 3,
          }}
        />
      )}
    </Box>
  );

  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.25 }}>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 800, display: "block", mb: 0.25 }}>
            {unit.unitId}
          </Typography>
          <Typography sx={{ fontSize: "0.65rem", display: "block", opacity: 0.75 }}>
            {unit.parsedDeck === "ABOVE_DECK" ? "▲ Above" : unit.parsedDeck === "BELOW_DECK" ? "▼ Below" : (unit.recommendedDeck === "ABOVE_DECK" ? "▲ Above" : "▼ Below")} ·
            {unit.parsedBay && unit.parsedRow ? ` B${unit.parsedBay} R${unit.parsedRow} T${unit.parsedTier}` : ` Tier ${unit.parsedTier || unit.recommendedTier}`} · {unit.portOfDischarge}
          </Typography>
          {isHazmat && (
            <Typography sx={{ fontSize: "0.65rem", display: "block", color: "#f87171", fontWeight: 700, mt: 0.25 }}>
              ⚠ HAZMAT
            </Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
      enterDelay={150}
      enterNextDelay={80}
      slotProps={{ popper: { sx: { zIndex: 99999 } } }}
    >
      {content}
    </Tooltip>
  );
};

export const BayColumn = ({
  group,
  portColors,
  hazmatIds,
  onHover,
  onClick,
  isHighlighted,
  isMobile,
}: {
  group: VisualizationGroup;
  portColors: Record<string, string>;
  hazmatIds: Set<string>;
  onHover?: (unit: StepData | null) => void;
  onClick?: (unit: StepData) => void;
  isHighlighted?: boolean;
  isMobile?: boolean;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const above = (group.positions || []).filter(
    (p: StepData) => p.parsedDeck === "ABOVE_DECK" || p.recommendedDeck === "ABOVE_DECK",
  );
  const below = (group.positions || []).filter(
    (p: StepData) => p.parsedDeck === "BELOW_DECK" || p.recommendedDeck === "BELOW_DECK",
  );
  const portColor = portColors[group.groupId] || theme.palette.primary.main;
  const hasHazmat = (group.positions || []).some((p: StepData) =>
    hazmatIds.has(p.unitId as string),
  );

  const sortByTier = (arr: StepData[]) =>
    [...arr].sort(
      (a, b) => {
        const tierB = b.parsedTier ? parseInt(b.parsedTier, 10) : ((b.recommendedTier as number) ?? 0);
        const tierA = a.parsedTier ? parseInt(a.parsedTier, 10) : ((a.recommendedTier as number) ?? 0);
        return tierB - tierA;
      }
    );
  const colWidth = Math.max(
    isMobile ? 32 : 44,
    Math.ceil(Math.max(above.length, below.length) / 7) * (isMobile ? 20 : 28) + 16,
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transition: "opacity 0.2s",
        opacity: isHighlighted === false ? 0.35 : 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, mb: 0.5 }}>
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: portColor,
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontSize: "0.58rem",
            fontWeight: 800,
            letterSpacing: "0.07em",
            color: portColor,
            textTransform: "uppercase",
          }}
        >
          {group.groupId}
        </Typography>
        {hasHazmat && (
          <WarningAmberIcon sx={{ fontSize: 8, color: "#f87171", ml: 0.25 }} />
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap-reverse",
          alignContent: "flex-start",
          justifyContent: "center",
          gap: "2px",
          minHeight: 88,
          width: colWidth,
          pb: 0.5,
          pt: 0.5,
        }}
      >
        {sortByTier(above).map((p: StepData, i: number) => (
          <ContainerCell
            key={i}
            unit={p}
            color={portColors[p.portOfDischarge as string] || portColor}
            isHazmat={hazmatIds.has(p.unitId as string)}
            onHover={onHover}
            onClick={onClick}
            isMobile={isMobile}
          />
        ))}
        {above.length === 0 && (
          <Box
            sx={{
              width: 36,
              height: 16,
              borderRadius: "2px",
              border: `1px dashed ${alpha(theme.palette.divider, 0.3)}`,
            }}
          />
        )}
      </Box>

      {/* Hatch cover */}
      <Box
        sx={{
          width: "100%",
          minWidth: colWidth,
          height: 5,
          borderRadius: "2px",
          background: isDark
            ? "linear-gradient(180deg, #4a4a4a 0%, #2a2a2a 100%)"
            : "linear-gradient(180deg, #666 0%, #444 100%)",
          border: `1px solid ${alpha("#000", 0.6)}`,
          my: 0.5,
          position: "relative",
          "&::after": {
            content: '""',
            position: "absolute",
            top: 1,
            left: "10%",
            right: "10%",
            height: 1.5,
            bgcolor: alpha("#fff", 0.15),
            borderRadius: "1px",
          },
        }}
      />

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap-reverse",
          alignContent: "flex-start",
          justifyContent: "center",
          gap: "2px",
          minHeight: 96,
          width: colWidth,
          pt: 0.5,
        }}
      >
        {sortByTier(below).map((p: StepData, i: number) => (
          <ContainerCell
            key={i}
            unit={p}
            color={portColors[p.portOfDischarge as string] || portColor}
            isHazmat={hazmatIds.has(p.unitId as string)}
            onHover={onHover}
            onClick={onClick}
            isMobile={isMobile}
          />
        ))}
        {below.length === 0 && (
          <Box
            sx={{
              width: 36,
              height: 16,
              borderRadius: "2px",
              border: `1px dashed ${alpha(theme.palette.divider, 0.2)}`,
            }}
          />
        )}
      </Box>
    </Box>
  );
};
