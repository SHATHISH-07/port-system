import { Card, Box, Typography } from '@mui/material';
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
    const data = [
        { name: 'Actual Avg', hours: actualAvg },
        { name: 'Predicted Avg', hours: predictedAvg },
        { name: 'Top Visit', hours: maxHours || 0 },
    ];

    return (
        <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: 'background.paper', minWidth: 0 }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Actual vs Predicted Stay Time
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Executive comparison of model output and observed performance
                </Typography>
            </Box>

            <Box sx={{ p: 3, width: '100%', height: 340, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="hours" name="Hours" radius={[10, 10, 0, 0]}>
                            <Cell fill="#4F46E5" />
                            <Cell fill="#06B6D4" />
                            <Cell fill="#F59E0B" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Box>
        </Card>
    );
}