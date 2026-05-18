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
                borderRadius: 2.5,
                background: bgGradient,
                backdropFilter: 'blur(10px)',
                border: '1px solid',
                borderColor: accent === 'default' ? 'divider' : alpha(valueColor, 0.2),
                boxShadow: `0 4px 16px ${alpha(accent === 'default' ? '#000' : valueColor, 0.03)}`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 6px 20px ${alpha(accent === 'default' ? '#000' : valueColor, 0.08)}`,
                    borderColor: alpha(valueColor, 0.4),
                },
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        display: 'block',
                        mb: 0.5,
                        fontSize: '0.68rem',
                    }}
                >
                    {title}
                </Typography>

                <Typography
                    sx={{
                        fontSize: { xs: '1.4rem', md: '1.6rem' },
                        fontWeight: 900,
                        color: valueColor,
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                    }}
                >
                    {value}
                </Typography>

                <Typography
                    variant="caption"
                    sx={{
                        mt: 0.75,
                        color: 'text.secondary',
                        fontWeight: 500,
                        opacity: 0.8,
                        display: 'block',
                    }}
                >
                    {subtitle}
                </Typography>
            </CardContent>
        </Card>
    );
}