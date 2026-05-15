import { Card, Box, Typography } from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;

    return (
        <Box
            sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 1.5,
                boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
            }}
        >
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                {label}
            </Typography>
            {payload.map((item: any) => (
                <Typography key={item.dataKey} variant="body2" sx={{ fontWeight: 700 }}>
                    {item.name}: {item.value}
                </Typography>
            ))}
        </Box>
    );
}

export default function PortBreakdownChart({ visits }: { visits: Record<string, any> }) {
    const totals: Record<string, number> = {};

    Object.values(visits || {}).forEach((v: any) => {
        const ports = v.port_of_discharge_top5 || {};
        Object.entries(ports).forEach(([key, count]) => {
            totals[key] = (totals[key] || 0) + Number(count || 0);
        });
    });

    const data = Object.entries(totals)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

    return (
        <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: 'background.paper', height: '100%', minWidth: 0 }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Top Discharge Ports
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Highest frequency destination clusters
                </Typography>
            </Box>

            <Box sx={{ p: 3, width: '100%', height: 340, minWidth: 0 }}>
                {data.length === 0 ? (
                    <Box
                        sx={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'text.secondary',
                        }}
                    >
                        <Typography variant="body2">No port breakdown available.</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tickLine={false} axisLine={false} />
                            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={70} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="value" name="Count" radius={[0, 10, 10, 0]} fill="#4F46E5" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Box>
        </Card>
    );
}