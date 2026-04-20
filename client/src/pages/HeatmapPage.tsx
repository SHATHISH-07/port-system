import { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Chip,
} from "@mui/material";
import { MapContainer, TileLayer, Rectangle, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { api } from "../api/api";

// 🔥 Terminal bounding box (APM NJ)
const TERMINAL_BOUNDS = {
  latMin: 40.6685,
  latMax: 40.6755,
  lngMin: -74.143,
  lngMax: -74.13,
};

// 🔥 Auto-grid mapping (NO HARDCODING)
function mapBlocksToGrid(blocks: any) {
  const blockNames = Object.keys(blocks);

  const cols = 6;
  const rows = Math.ceil(blockNames.length / cols);

  const latStep = (TERMINAL_BOUNDS.latMax - TERMINAL_BOUNDS.latMin) / rows;
  const lngStep = (TERMINAL_BOUNDS.lngMax - TERMINAL_BOUNDS.lngMin) / cols;

  return blockNames.map((block, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const lat1 = TERMINAL_BOUNDS.latMax - row * latStep;
    const lat2 = lat1 - latStep;

    const lng1 = TERMINAL_BOUNDS.lngMin + col * lngStep;
    const lng2 = lng1 + lngStep;

    return {
      block,
      bounds: [
        [lat1, lng1],
        [lat2, lng2],
      ],
      ...blocks[block],
    };
  });
}

// 🔥 Color scale
function getColor(count: number, max: number) {
  const ratio = count / max;
  if (ratio > 0.7) return "#ef4444";
  if (ratio > 0.3) return "#f97316";
  return "#22c55e";
}

export default function RealHeatmapPage() {
  const [vesselInput, setVesselInput] = useState("AA7");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchHeatmap = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/vessel/heatmap?vessel_id=${vesselInput}`);
      setData(res.data);
    } catch {
      alert("API Error");
    } finally {
      setLoading(false);
    }
  };

  const mappedBlocks = data ? mapBlocksToGrid(data.blocks) : [];
  const maxCount = data
    ? Math.max(...Object.values(data.blocks).map((b: any) => b.count))
    : 1;

  return (
    <Box sx={{ bgcolor: "#0f172a", minHeight: "100vh", color: "white", p: 3 }}>
      {/* HEADER */}
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>
        🌍 Real Terminal Heatmap
      </Typography>

      {/* SEARCH */}
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <TextField
          value={vesselInput}
          onChange={(e) => setVesselInput(e.target.value)}
          size="small"
          sx={{ bgcolor: "#1e293b", input: { color: "white" } }}
        />
        <Button variant="contained" onClick={fetchHeatmap}>
          {loading ? <CircularProgress size={20} /> : "Load"}
        </Button>
      </Box>

      {data && (
        <Box sx={{ display: "flex", gap: 2 }}>
          {/* MAP */}
          <Box sx={{ flex: 3 }}>
            <MapContainer
              center={[40.672, -74.136]}
              zoom={16}
              style={{ height: "600px", borderRadius: "12px" }}
            >
              {/* Satellite-like */}
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {/* 🔥 Blocks */}
              {mappedBlocks.map((b: any) => (
                <Rectangle
                  key={b.block}
                  bounds={b.bounds as any}
                  pathOptions={{
                    color: b.block === data.max_block ? "#ffffff" : "#000000",
                    weight: b.block === data.max_block ? 3 : 1,
                    fillColor: getColor(b.count, maxCount),
                    fillOpacity: 0.6,
                  }}
                >
                  <Popup>
                    <b>{b.block}</b>
                    <br />
                    Containers: {b.count}
                    <br />
                    Hazardous: {b.hazardous}
                    <br />
                    Reefer: {b.reefer}
                    <br />
                    OOG: {b.oog}
                  </Popup>
                </Rectangle>
              ))}

              {/* 🔥 BERTH (3 SIDES) */}
              <Rectangle
                bounds={[
                  [TERMINAL_BOUNDS.latMax, TERMINAL_BOUNDS.lngMin],
                  [TERMINAL_BOUNDS.latMax + 0.001, TERMINAL_BOUNDS.lngMax],
                ]}
                pathOptions={{ color: "#38bdf8", weight: 2 }}
              />

              <Rectangle
                bounds={[
                  [TERMINAL_BOUNDS.latMin, TERMINAL_BOUNDS.lngMin],
                  [TERMINAL_BOUNDS.latMin - 0.001, TERMINAL_BOUNDS.lngMax],
                ]}
                pathOptions={{ color: "#38bdf8", weight: 2 }}
              />

              <Rectangle
                bounds={[
                  [TERMINAL_BOUNDS.latMin, TERMINAL_BOUNDS.lngMax],
                  [TERMINAL_BOUNDS.latMax, TERMINAL_BOUNDS.lngMax + 0.001],
                ]}
                pathOptions={{ color: "#38bdf8", weight: 2 }}
              />
            </MapContainer>
          </Box>

          {/* SIDE PANEL */}
          <Box sx={{ flex: 1 }}>
            <Paper sx={{ p: 2, bgcolor: "#1e293b", mb: 2 }}>
              <Typography variant="h6">Vessel</Typography>
              <Typography>{data.vessel}</Typography>
              <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>
                Visit: {data.visit_id}
              </Typography>
            </Paper>

            <Paper sx={{ p: 2, bgcolor: "#1e293b", mb: 2 }}>
              <Typography variant="h6">Recommended Berth</Typography>
              <Typography
                sx={{ fontSize: 24, fontWeight: 800, color: "#38bdf8" }}
              >
                {data.recommended_berth}
              </Typography>
              <Typography sx={{ fontSize: 12 }}>
                Based on max block: {data.max_block}
              </Typography>
            </Paper>

            <Paper sx={{ p: 2, bgcolor: "#1e293b", mb: 2 }}>
              <Typography variant="h6">Summary</Typography>
              <Typography>Total: {data.summary.total_containers}</Typography>
              <Typography>Hazardous: {data.summary.hazardous}</Typography>
              <Typography>Reefer: {data.summary.reefer}</Typography>
              <Typography>OOG: {data.summary.oog}</Typography>
            </Paper>

            <Paper sx={{ p: 2, bgcolor: "#1e293b" }}>
              <Typography variant="h6">Legend</Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <Chip label="Low" sx={{ bgcolor: "#22c55e" }} />
                <Chip label="Medium" sx={{ bgcolor: "#f97316" }} />
                <Chip label="High" sx={{ bgcolor: "#ef4444" }} />
              </Box>
            </Paper>
          </Box>
        </Box>
      )}
    </Box>
  );
}
