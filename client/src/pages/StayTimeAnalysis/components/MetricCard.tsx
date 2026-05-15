import { Card, CardContent, Typography, alpha, useTheme } from '@mui/material';

export default function MetricCard({
    title,
    value,
    subtitle,
    accent = 'default',
}: {
    title: string;
    value: string | number;
    subtitle: string;
    accent?: 'default' | 'primary' | 'success' | 'warning' | 'error';
}) {
    const theme = useTheme();

    const bg =
        accent === 'primary'
            ? alpha(theme.palette.primary.main, 0.08)
            : accent === 'success'
                ? alpha(theme.palette.success.main, 0.08)
                : accent === 'warning'
                    ? alpha(theme.palette.warning.main, 0.08)
                    : accent === 'error'
                        ? alpha(theme.palette.error.main, 0.08)
                        : theme.palette.background.paper;

    const valueColor =
        accent === 'primary'
            ? 'primary.main'
            : accent === 'success'
                ? 'success.main'
                : accent === 'warning'
                    ? 'warning.main'
                    : accent === 'error'
                        ? 'error.main'
                        : 'text.primary';

    return (
        <Card
            variant="outlined"
            sx={{
                height: '100%',
                borderRadius: 3,
                bgcolor: bg,
                borderColor: alpha(theme.palette.divider, 0.8),
                boxShadow: '0 10px 30px rgba(0,0,0,0.03)',
            }}
        >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                    }}
                >
                    {title}
                </Typography>

                <Typography
                    sx={{
                        mt: 1,
                        fontSize: { xs: '1.6rem', md: '2rem' },
                        fontWeight: 800,
                        color: valueColor,
                        lineHeight: 1.05,
                        letterSpacing: '-0.03em',
                    }}
                >
                    {value}
                </Typography>

                <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary' }}>
                    {subtitle}
                </Typography>
            </CardContent>
        </Card>
    );
}