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
            ? theme.palette.primary.main
            : accent === 'success'
                ? theme.palette.success.main
                : accent === 'warning'
                    ? theme.palette.warning.main
                    : accent === 'error'
                        ? theme.palette.error.main
                        : theme.palette.text.primary;

    const bgGradient =
        accent === 'primary'
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.primary.main, 0.02)} 100%)`
            : accent === 'success'
                ? `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.12)} 0%, ${alpha(theme.palette.success.main, 0.02)} 100%)`
                : accent === 'warning'
                    ? `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.12)} 0%, ${alpha(theme.palette.warning.main, 0.02)} 100%)`
                    : accent === 'error'
                        ? `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.12)} 0%, ${alpha(theme.palette.error.main, 0.02)} 100%)`
                        : `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)} 0%, ${alpha(theme.palette.background.paper, 0.4)} 100%)`;

    return (
        <Card
            elevation={0}
            sx={{
                height: '100%',
                borderRadius: 4,
                background: bgGradient,
                backdropFilter: 'blur(10px)',
                border: '1px solid',
                borderColor: accent === 'default' ? 'divider' : alpha(valueColor, 0.2),
                boxShadow: `0 8px 32px ${alpha(accent === 'default' ? '#000' : valueColor, 0.05)}`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 12px 40px ${alpha(accent === 'default' ? '#000' : valueColor, 0.12)}`,
                    borderColor: alpha(valueColor, 0.4),
                },
            }}
        >
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        display: 'block',
                        mb: 1,
                    }}
                >
                    {title}
                </Typography>

                <Typography
                    sx={{
                        fontSize: { xs: '1.8rem', md: '2.2rem' },
                        fontWeight: 950,
                        color: valueColor,
                        lineHeight: 1,
                        letterSpacing: '-0.04em',
                    }}
                >
                    {value}
                </Typography>

                <Typography
                    variant="body2"
                    sx={{
                        mt: 1.5,
                        color: 'text.secondary',
                        fontWeight: 500,
                        opacity: 0.8,
                    }}
                >
                    {subtitle}
                </Typography>
            </CardContent>
        </Card>
    );
}