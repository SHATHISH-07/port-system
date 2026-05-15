import { Card, Box, Typography } from '@mui/material';
import {
    ResponsiveContainer,
    ComposedChart,
    Line,
    Area,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine,
    Legend,
} from 'recharts';

function parseDate(value: string) {
    const normalized = value?.includes(' ') ? value.replace(' ', 'T') : value;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateLabel(value: string) {
    const d = parseDate(value);
    if (!d) return value;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
                    {item.name}: {Number(item.value).toFixed(2)}
                </Typography>
            ))}
        </Box>
    );
}

export default function StayTimeTrendChart({
    visits,
    avgHours,
}: {
    visits: Record<string, any>;
    avgHours: number;
}) {
    const data = Object.entries(visits || {})
        .map(([visitId, v]: any) => {
            const startDate = parseDate(v.start_time);
            return {
                visitId,
                startTs: startDate ? startDate.getTime() : 0,
                label: formatDateLabel(v.start_time),
                stayHours: Number(v.stay_hours || 0),
                loaded: Number(v.loaded_containers || 0),
                discharged: Number(v.discharged_containers || 0),
                totalUnits: Number(v.total_units || 0),
            };
        })
        .sort((a, b) => a.startTs - b.startTs);

    return (
        <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: 'background.paper', minWidth: 0 }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Stay Time Trend
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Chronological vessel performance with baseline average
                </Typography>
            </Box>

            <Box sx={{ p: 3, width: '100%', height: 360, minWidth: 0 }}>
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
                        <Typography variant="body2">No visit history available for this vessel.</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="stayFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopOpacity={0.35} />
                                    <stop offset="95%" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tickLine={false} axisLine={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <ReferenceLine y={avgHours} stroke="#F59E0B" strokeDasharray="5 5" label="Avg" />
                            <Area
                                type="monotone"
                                dataKey="stayHours"
                                name="Stay Hours"
                                stroke="#4F46E5"
                                fill="url(#stayFill)"
                                strokeWidth={2}
                            />
                            <Line
                                type="monotone"
                                dataKey="totalUnits"
                                name="Total Units"
                                stroke="#06B6D4"
                                strokeWidth={2}
                                dot={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </Box>
        </Card>
    );
}