import { Box, Typography, Paper, Stack, Divider, useTheme } from "@mui/material";

export interface HeatmapSidebarProps {
  mapData: {
    computedMaxBlock?: string | null;
    max_block?: string;
    targetBerthId?: string;
  } | null;
  totalMoves: number;
  totalBlocks: number;
  hazmat: number;
  reefer: number;
  oog: number;
  hasSpecial: boolean;
}

export default function HeatmapSidebar({
  mapData,
  totalMoves,
  totalBlocks,
  hazmat,
  reefer,
  oog,
  hasSpecial,
}: HeatmapSidebarProps) {
  const theme = useTheme();

  return (
    <Paper
      elevation={6}
      sx={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 10,
        bgcolor: "background.paper",
        borderRadius: 3,
        px: 1.5,
        py: 0.8,
        display: { xs: "none", lg: "flex" },
        alignItems: "center",
        gap: 2,
        border: "1px solid",
        borderColor: theme.palette.divider,
        boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[4],
      }}
    >
      <Box>
        <Typography
          sx={{
            display: "block",
            color: "text.secondary",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: "0.58rem",
          }}
        >
          Primary Block
        </Typography>
        <Typography
          sx={{
            fontSize: "0.9rem",
            fontWeight: 900,
            color: "error.main",
            fontFamily: "'Inter', monospace",
          }}
        >
          {mapData?.computedMaxBlock || mapData?.max_block || "-"}
        </Typography>
      </Box>
      <Divider orientation="vertical" flexItem />
      <Box>
        <Typography
          sx={{
            display: "block",
            color: "text.secondary",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: "0.58rem",
          }}
        >
          Target Berth
        </Typography>
        <Typography
          sx={{
            fontSize: "0.9rem",
            fontWeight: 900,
            color: "success.main",
            fontFamily: "'Inter', monospace",
          }}
        >
          {mapData?.targetBerthId || "-"}
        </Typography>
      </Box>
      <Divider orientation="vertical" flexItem />
      <Box>
        <Typography
          sx={{
            display: "block",
            color: "text.secondary",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: "0.58rem",
          }}
        >
          Total Volume
        </Typography>
        <Typography
          sx={{
            fontSize: "0.9rem",
            fontWeight: 900,
            color: "text.primary",
            fontFamily: "'Inter', monospace",
          }}
        >
          {totalMoves.toLocaleString()} CTN
        </Typography>
      </Box>
      <Divider orientation="vertical" flexItem />
      <Box>
        <Typography
          sx={{
            display: "block",
            color: "text.secondary",
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: "0.58rem",
          }}
        >
          Blocks
        </Typography>
        <Typography
          sx={{
            fontSize: "0.9rem",
            fontWeight: 900,
            color: "text.primary",
            fontFamily: "'Inter', monospace",
          }}
        >
          {totalBlocks}
        </Typography>
      </Box>
      {hasSpecial && (
        <>
          <Divider orientation="vertical" flexItem />
          <Stack direction="row" spacing={2}>
            {hazmat > 0 && (
              <Box>
                <Typography
                  sx={{
                    display: "block",
                    color: "error.main",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    fontSize: "0.58rem",
                  }}
                >
                  Hazmat
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.9rem",
                    fontWeight: 900,
                    color: "error.main",
                    fontFamily: "'Inter', monospace",
                  }}
                >
                  {hazmat}
                </Typography>
              </Box>
            )}
            {reefer > 0 && (
              <Box>
                <Typography
                  sx={{
                    display: "block",
                    color: "info.main",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    fontSize: "0.58rem",
                  }}
                >
                  Reefer
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.9rem",
                    fontWeight: 900,
                    color: "info.main",
                    fontFamily: "'Inter', monospace",
                  }}
                >
                  {reefer}
                </Typography>
              </Box>
            )}
            {oog > 0 && (
              <Box>
                <Typography
                  sx={{
                    display: "block",
                    color: "warning.main",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    fontSize: "0.58rem",
                  }}
                >
                  OOG
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.9rem",
                    fontWeight: 900,
                    color: "warning.main",
                    fontFamily: "'Inter', monospace",
                  }}
                >
                  {oog}
                </Typography>
              </Box>
            )}
          </Stack>
        </>
      )}
    </Paper>
  );
}
