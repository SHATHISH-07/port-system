import { Card, Box, Typography } from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

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

export default function CraneAllocationChart({
    assignments,
    visits,
}: {
    assignments?: any[];
    visits?: Record<string, any>;
}) {
    const assignmentData = (assignments || []).map((a) => ({
        visitId: a.visit_id,
        Units: Number(a.total_units || 0),
        Cranes: Number(a.assigned_cranes || a.crane_count || 0),
        Restows: Number(a.restow_count || 0),
    }));

    const visitData = Object.entries(visits || {})
        .map(([visitId, v]: [string, any]) => ({
            visitId,
            Units: Number(v.total_units || 0),
            Cranes: Number(v.assigned_cranes || 0),
            Restows: Number(v.restow_count || 0),
        }));

    const source = assignmentData.length > 0 ? assignmentData : visitData;

    const data = [...source]
        .sort((a, b) => Number(b.Units || 0) - Number(a.Units || 0))
        .slice(0, 10);

    return (
        <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: 'background.paper', minWidth: 0 }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Crane Allocation vs Workload
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Top visits ranked by total work units
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
                        <Typography variant="body2">No crane allocation data available.</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="visitId"
                                tickLine={false}
                                axisLine={false}
                                interval={0}
                                angle={-20}
                                textAnchor="end"
                                height={70}
                            />
                            <YAxis tickLine={false} axisLine={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <Bar dataKey="Units" name="Units" fill="#4F46E5" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="Cranes" name="Cranes" fill="#06B6D4" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="Restows" name="Restows" fill="#F59E0B" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Box>
        </Card>
    );
}