import { Card, Box, Typography, useTheme, alpha, Grid, useMediaQuery } from '@mui/material';
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

function TrendChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;

    return (
        <Box
            sx={(theme) => ({
                bgcolor: theme.palette.mode === 'dark' ? '#121212' : '#ffffff',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: { xs: 1, sm: 1.5 },
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
                minWidth: { xs: 130, sm: 160 },
            })}
        >
            <Typography
                variant="caption"
                sx={{ color: 'text.secondary', display: 'block', mb: 0.75, fontWeight: 700 }}
            >
                Visit: {label}
            </Typography>
            {payload.map((item: any) => (
                <Box
                    key={item.dataKey}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}
                >
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: item.color || 'text.primary',
                            flexShrink: 0,
                        }}
                    />
                    <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' }, fontWeight: 600, color: 'text.primary' }}>
                        {item.name}:{' '}
                        <Box component="span" sx={{ color: item.color || 'text.primary', fontWeight: 700 }}>
                            {Number(item.value).toFixed(1)}
                        </Box>
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}



export default function StayTimeTrendChart({
    visits,
    avgHours,
    insight,
}: {
    visits: Record<string, any>;
    avgHours: number;
    containerBreakdown?: any;
    insight?: string;
}) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // ─── Trend chart data ────────────────────────────────────────────────────
    const trendData = Object.entries(visits || {})
        .map(([visitId, v]: any) => {
            const startDate = parseDate(v.start_time);
            return {
                visitId,
                startTs: startDate ? startDate.getTime() : 0,
                stayHours: Number(v.stay_hours || 0),
                loaded: Number(v.loaded_containers ?? v.loaded ?? 0),
                discharged: Number(v.discharged_containers ?? v.discharged ?? 0),
            };
        })
        .sort((a, b) => a.startTs - b.startTs);



    // ─── Shared empty-state component ────────────────────────────────────────
    const EmptyState = ({ message }: { message: string }) => (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                color: 'text.disabled',
            }}
        >
            <Box
                sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: '2px dashed',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    mb: 0.5,
                }}
            >
                —
            </Box>
            <Typography variant="body2" sx={{ color: 'text.disabled', textAlign: 'center' }}>
                {message}
            </Typography>
        </Box>
    );

    return (
        <Card
            elevation={0}
            sx={{
                borderRadius: 4,
                bgcolor: alpha(theme.palette.background.paper, 0.6),
                backdropFilter: 'blur(10px)',
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.8),
                overflow: 'hidden',
            }}
        >
            <Grid container>
                {/* ── Left: Historical Performance Trend ──────────────────── */}
                <Grid
                    size={{ xs: 12 }}
                    sx={{
                        borderRight: {
                            md: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                        },
                        borderBottom: {
                            xs: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                            md: 'none',
                        },
                    }}
                >
                    <Box
                        sx={{
                            px: { xs: 1.5, sm: 2, md: 3 },
                            py: 2.5,
                            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            alignItems: { xs: 'flex-start', sm: 'center' },
                            justifyContent: 'space-between',
                            gap: 2,
                        }}
                    >
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                                Historical Performance Trend
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, mt: 0.25 }}>
                                Port stay duration with load & discharge movements over time
                            </Typography>
                            {insight && (
                                <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 600, mt: 1, maxWidth: 600, lineHeight: 1.4 }}>
                                    {insight}
                                </Typography>
                            )}
                        </Box>

                        {/* Baseline indicator – lives outside the chart so it never overlaps data */}
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                flexShrink: 0,
                                bgcolor: alpha(theme.palette.warning.main, 0.1),
                                border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                                borderRadius: 2,
                                px: 1.25,
                                py: 0.5,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 20,
                                    height: 2,
                                    borderTop: `2px dashed ${theme.palette.warning.main}`,
                                }}
                            />
                            <Typography
                                variant="caption"
                                sx={{
                                    color: theme.palette.warning.dark ?? theme.palette.warning.main,
                                    fontWeight: 800,
                                    fontSize: 10,
                                    letterSpacing: '0.05em',
                                }}
                            >
                                BASELINE · {avgHours.toFixed(1)}h
                            </Typography>
                        </Box>
                    </Box>

                    {/* Chart area – ResponsiveContainer MUST have an explicit pixel height, not 100% */}
                    <Box sx={{ pt: 3, pb: 1, px: { xs: 0.5, sm: 2 } }}>
                        {trendData.length === 0 ? (
                            <Box sx={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <EmptyState message="No visit history available for this vessel." />
                            </Box>
                        ) : (
                            <ResponsiveContainer width="100%" height={isMobile ? 320 : 400}>
                                <ComposedChart
                                    data={trendData}
                                    margin={{ top: 8, right: isMobile ? 4 : 24, left: isMobile ? 0 : 8, bottom: isMobile ? 80 : 40 }}
                                >
                                    <defs>
                                        <linearGradient id="stayFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop
                                                offset="5%"
                                                stopColor={theme.palette.error.main}
                                                stopOpacity={0.18}
                                            />
                                            <stop
                                                offset="95%"
                                                stopColor={theme.palette.error.main}
                                                stopOpacity={0.01}
                                            />
                                        </linearGradient>
                                    </defs>

                                    <CartesianGrid
                                        strokeDasharray="4 4"
                                        vertical={false}
                                        stroke={alpha(theme.palette.divider, 0.6)}
                                    />

                                    <XAxis
                                        dataKey="visitId"
                                        interval={0}
                                        tickLine={false}
                                        axisLine={{ stroke: alpha(theme.palette.divider, 0.4) }}
                                        tick={{
                                            fill: theme.palette.text.secondary,
                                            fontSize: isMobile ? 9 : 10,
                                            fontWeight: 600,
                                        }}
                                        angle={isMobile ? -90 : -45}
                                        textAnchor="end"
                                        height={isMobile ? 80 : 60}
                                        dx={isMobile ? -4 : -4}
                                        dy={isMobile ? 0 : 4}
                                        label={isMobile ? undefined : {
                                            value: 'Visit ID',
                                            position: 'insideBottom',
                                            offset: -10,
                                            fill: theme.palette.text.secondary,
                                            fontSize: 11,
                                            fontWeight: 700,
                                        }}
                                        tickFormatter={(val) => String(val).length > (isMobile ? 10 : 14) ? String(val).substring(0, isMobile ? 10 : 14) + '...' : val}
                                    />

                                    {/* Left Y-axis: Stay Hours */}
                                    <YAxis
                                        yAxisId="left"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{
                                            fill: theme.palette.text.secondary,
                                            fontSize: 10,
                                            fontWeight: 600,
                                        }}
                                        width={isMobile ? 44 : 56}
                                        label={isMobile ? undefined : {
                                            value: 'Stay Time (hrs)',
                                            angle: -90,
                                            position: 'insideLeft',
                                            offset: 12,
                                            fill: theme.palette.text.secondary,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            style: { textAnchor: 'middle' },
                                        }}
                                    />

                                    {/* Right Y-axis: Move Count */}
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        tickLine={false}
                                        axisLine={false}
                                        hide={isMobile}
                                        tick={{
                                            fill: theme.palette.text.secondary,
                                            fontSize: 11,
                                            fontWeight: 600,
                                        }}
                                        width={52}
                                        label={{
                                            value: 'Container (count)',
                                            angle: 90,
                                            position: 'insideRight',
                                            offset: 12,
                                            fill: theme.palette.text.secondary,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            style: { textAnchor: 'middle' },
                                        }}
                                    />

                                    <Tooltip
                                        content={<TrendChartTooltip />}
                                        position={isMobile ? { x: 50, y: 235 } : undefined}
                                        cursor={{
                                            stroke: alpha(theme.palette.primary.main, 0.4),
                                            strokeWidth: 1.5,
                                            strokeDasharray: '4 4',
                                        }}
                                        wrapperStyle={{ zIndex: 1000 }}
                                    />

                                    <Legend
                                        verticalAlign="top"
                                        align="right"
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{
                                            paddingBottom: 12,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            paddingRight: 8,
                                        }}
                                    />

                                    <ReferenceLine
                                        yAxisId="left"
                                        y={avgHours}
                                        stroke={theme.palette.warning.main}
                                        strokeDasharray="6 4"
                                        strokeWidth={1.5}
                                    />

                                    <Area
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="stayHours"
                                        name="Stay (hrs)"
                                        stroke={theme.palette.error.main}
                                        fill="url(#stayFill)"
                                        strokeWidth={2.5}
                                        dot={{ r: 3.5, fill: theme.palette.error.main, strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                                        animationDuration={1200}
                                    />

                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="loaded"
                                        name="Loaded Containers"
                                        stroke="#10B981"
                                        strokeWidth={2}
                                        dot={{ r: 3.5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 5, strokeWidth: 0 }}
                                        animationDuration={1600}
                                    />

                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="discharged"
                                        name="Discharged Containers"
                                        stroke="#f6b53bff"
                                        strokeWidth={2}
                                        dot={{ r: 3.5, fill: '#f6e33bff', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 5, strokeWidth: 0 }}
                                        animationDuration={2000}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </Box>
                </Grid>

            </Grid>
        </Card>
    );
}