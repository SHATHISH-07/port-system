import { Card, Box, Typography, useTheme, alpha } from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;

    return (
        <Box
            sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 3,
                p: 2,
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
            }}
        >
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, fontWeight: 700, textTransform: 'uppercase' }}>
                {label}
            </Typography>
            {payload.map((item: any) => (
                <Typography key={item.dataKey} variant="body2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                    Units: {item.value}
                </Typography>
            ))}
        </Box>
    );
}

export default function PortBreakdownChart({ visits }: { visits: Record<string, any> }) {
    const theme = useTheme();
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
        <Card
            elevation={0}
            sx={{
                borderRadius: 4,
                bgcolor: alpha(theme.palette.background.paper, 0.4),
                backdropFilter: 'blur(10px)',
                border: '1px solid',
                borderColor: 'divider',
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Box sx={{ px: 3, py: 3, borderBottom: '1px solid', borderColor: alpha(theme.palette.divider, 0.5) }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, letterSpacing: '-0.01em' }}>
                    Port Distribution
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Concentration of cargo by destination port across historical visits.
                </Typography>
            </Box>

            <Box sx={{ p: 3, flex: 1, minHeight: 340 }}>
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
                        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 30, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={alpha(theme.palette.divider, 0.5)} />
                            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 600 }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                width={80}
                                tick={{ fill: theme.palette.text.primary, fontSize: 11, fontWeight: 700 }}
                            />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }} />
                            <Bar dataKey="value" name="Count" radius={[0, 6, 6, 0]} barSize={24}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={theme.palette.primary.main} opacity={1 - index * 0.1} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Box>
        </Card>
    );
}