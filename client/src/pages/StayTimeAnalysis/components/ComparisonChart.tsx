import { Card, Box, Typography, useTheme, alpha } from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

function format(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) return '-';
    return Number(value).toFixed(2);
}

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
                <Typography key={item.dataKey} variant="body2" sx={{ fontWeight: 800, color: item.payload.fill }}>
                    {item.name}: {format(item.value)} hrs
                </Typography>
            ))}
        </Box>
    );
}

export default function ComparisonChart({
    actualAvg,
    predictedAvg,
    maxHours,
}: {
    actualAvg: number;
    predictedAvg: number;
    maxHours?: number;
}) {
    const theme = useTheme();
    const data = [
        { name: 'Actual Avg', hours: actualAvg, fill: theme.palette.primary.main },
        { name: 'Predicted Avg', hours: predictedAvg, fill: '#06B6D4' },
        { name: 'Peak Stay', hours: maxHours || 0, fill: theme.palette.warning.main },
    ];

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
                    Variance Comparison
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Model prediction vs. historical baseline and peak observed stay.
                </Typography>
            </Box>

            <Box sx={{ p: 3, flex: 1, minHeight: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.divider, 0.5)} />
                        <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 600 }}
                            dy={10}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 600 }}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }} />
                        <Bar dataKey="hours" name="Stay Time" radius={[8, 8, 0, 0]} barSize={60}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Box>
        </Card>
    );
}