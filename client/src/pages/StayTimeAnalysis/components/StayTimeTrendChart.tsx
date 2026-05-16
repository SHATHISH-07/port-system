import { Card, Box, Typography, useTheme, alpha } from '@mui/material';
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
    const theme = useTheme();
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
                    Historical Performance Trend
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    Vessel port stay duration and container volume over time.
                </Typography>
            </Box>

            <Box sx={{ p: 3, flex: 1, minHeight: 400 }}>
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
                        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="stayFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0.01} />
                                </linearGradient>
                                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor={theme.palette.primary.main} />
                                    <stop offset="100%" stopColor={theme.palette.primary.light} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.divider, 0.5)} />
                            <XAxis
                                dataKey="label"
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
                            <Tooltip content={<ChartTooltip />} cursor={{ stroke: theme.palette.primary.main, strokeWidth: 1, strokeDasharray: '4 4' }} />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                iconType="circle"
                                wrapperStyle={{ paddingBottom: 20, fontSize: 12, fontWeight: 700 }}
                            />
                            <ReferenceLine
                                y={avgHours}
                                stroke={theme.palette.warning.main}
                                strokeDasharray="6 6"
                                strokeWidth={2}
                                label={{
                                    value: 'BASELINE',
                                    position: 'right',
                                    fill: theme.palette.warning.main,
                                    fontSize: 10,
                                    fontWeight: 900
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="stayHours"
                                name="Stay (Hours)"
                                stroke={theme.palette.primary.main}
                                fill="url(#stayFill)"
                                strokeWidth={3}
                                animationDuration={1500}
                            />
                            <Line
                                type="monotone"
                                dataKey="totalUnits"
                                name="Total Units"
                                stroke="#06B6D4"
                                strokeWidth={2}
                                dot={{ r: 4, fill: '#06B6D4', strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                                animationDuration={2000}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </Box>
        </Card>
    );
}