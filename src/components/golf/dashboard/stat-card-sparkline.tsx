'use client';

import { ReactNode, memo } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconArrowRight, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import { Sparkline } from '@/components/ui/sparkline';
import { AnimatedNumber } from '@/components/ui/animated-number';

// ============================================================================
// TYPES
// ============================================================================

interface StatCardSparklineProps {
    label: string;
    value: number | null;
    sparkline: number[];
    icon: ReactNode;
    iconColor: string;
    iconBg: string;
    href?: string;
    suffix?: string;
    trend?: 'improving' | 'declining' | 'stable';
    accent?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const StatCardSparkline = memo(function StatCardSparkline({
    label,
    value,
    sparkline,
    icon,
    iconColor,
    iconBg,
    href,
    suffix = '',
    trend,
    accent = false,
}: StatCardSparklineProps) {
    const hasSparkline = sparkline.length >= 2;
    const displayValue = value !== null ? value : '--';
    const isNumeric = value !== null;

    const trendIsPositive = trend === 'improving';
    const trendColor = trendIsPositive ? 'text-primary-700 bg-primary-50' : trend === 'declining' ? 'text-red-600 bg-red-50' : '';

    const sparkColor = trend === 'improving' ? '#16A34A' : trend === 'declining' ? '#DC2626' : '#94A3B8';

    const CardContent = (
        <m.div
            role={href ? 'link' : 'region'}
            aria-label={`${label}: ${displayValue}${suffix}`}
            className={cn(
                'relative overflow-hidden group',
                'glass-premium',
                'rounded-2xl',
                'transition-shadow duration-200',
                'p-4 md:p-5',
                accent
                    ? 'border-l-[3px] border-l-primary-600 border-t-white/30 border-r-white/30 border-b-white/30'
                    : 'border-white/30',
                href && 'cursor-pointer'
            )}
            whileHover={{ y: -3 }}
            whileTap={href ? { y: -1, scale: 0.99 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
            <div className="relative flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-1.5">{label}</p>
                    <div className="flex items-baseline gap-1.5" aria-live="polite">
                        <p className="text-2xl md:text-3xl font-bold tracking-tight text-warm-900 tabular-nums">
                            {isNumeric ? (
                                <AnimatedNumber value={value} decimals={suffix === '%' ? 0 : 1} suffix={suffix} />
                            ) : (
                                displayValue
                            )}
                        </p>
                        {trend && trend !== 'stable' && (
                            <span className={cn(
                                'flex items-center gap-0.5 text-micro font-semibold px-1.5 py-0.5 rounded-full',
                                trendColor
                            )}>
                                {trendIsPositive ? <IconTrendingUp size={10} /> : <IconTrendingDown size={10} />}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-shrink-0 mt-1">
                    {hasSparkline ? (
                        <Sparkline
                            data={sparkline}
                            color={sparkColor}
                            width={72}
                            height={26}
                        />
                    ) : (
                        <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
                            'group-hover:scale-105 transition-transform duration-200',
                            iconBg, iconColor
                        )}>
                            {icon}
                        </div>
                    )}
                </div>
            </div>

            {href && (
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconArrowRight size={12} className="text-primary-500" />
                </div>
            )}
        </m.div>
    );

    if (href) {
        return <Link href={href} prefetch={true}>{CardContent}</Link>;
    }
    return CardContent;
});
