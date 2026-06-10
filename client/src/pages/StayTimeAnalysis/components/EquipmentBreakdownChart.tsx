import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Box, Typography, Paper } from "@mui/material";

interface EquipmentBreakdownChartProps {
  equipmentData: Record<string, number>;
}

export const EquipmentBreakdownChart: React.FC<EquipmentBreakdownChartProps> = ({ equipmentData }) => {
  // Convert Record<string, number> to an array suitable for Recharts
  const data = Object.entries(equipmentData || {})
    .map(([type, count]) => ({
      type,
      count,
    }))
    .sort((a, b) => b.count - a.count); // Sort descending

  if (data.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
        No equipment breakdown data available.
      </Box>
    );
  }

  // Dynamic height based on number of items to ensure bars don't get squished
  const chartHeight = Math.max(300, data.length * 35);

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Detailed Equipment Classification
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Showing exactly {data.length} unique equipment types identified during this visit.
      </Typography>
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          p: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          height: 400, // Fixed container height with scrolling
          overflowY: 'auto'
        }}
      >
        <div style={{ height: chartHeight, minWidth: 600 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 10, right: 30, left: 150, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.3} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="type"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#A0AAB4", fontSize: 12 }}
                width={140}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                contentStyle={{
                  backgroundColor: "#1A2027",
                  border: "1px solid #2D3748",
                  borderRadius: "8px",
                  color: "#fff",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                }}
                itemStyle={{ color: "#E2E8F0" }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {data.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? "#3B82F6" : "#60A5FA"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Paper>
    </Box>
  );
};
