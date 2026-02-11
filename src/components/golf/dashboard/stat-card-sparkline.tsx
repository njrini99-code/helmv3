'use client';

import { ReactNode, memo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
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
    /** For golf metrics where lower = better (scoring avg, putts) */
    reverseColor?: boolean;
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
    reverseColor = false,
    accent = false,
}: StatCardSparklineProps) {
    const hasSparkline = sparkline.length >= 2;
    const displayValue = value !== null ? value : '--';
    const isNumeric = value !== null;

    // Trend color: for golf, "improving" means lower scores = green
    const trendIsPositive = trend === 'improving';
    const trendColor = trendIsPositive ? 'text-primary-700 bg-primary-50' : trend === 'declining' ? 'text-red-600 bg-red-50' : '';

    // Sparkline color
    const sparkColor = reverseColor
        ? (trend === 'improving' ? '#16A34A' : trend === 'declining' ? '#DC2626' : '#94A3B8')
        : (trend === 'improving' ? '#16A34A' : trend === 'declining' ? '#DC2626' : '#16A34A');

    const CardContent = (
        <motion.div
            role={href ? 'link' : 'region'}
            aria-label={`${label}: ${displayValue}${suffix}`}
            className={cn(
                'relative overflow-hidden group cursor-pointer',
                'bg-glass-subtle backdrop-blur-glass-prominent',
                'border rounded-2xl p-5',
                'shadow-glass hover:shadow-card-hover transition-shadow duration-200',
                accent
                    ? 'border-l-[3px] border-l-primary-600 border-t-white/30 border-r-white/30 border-b-white/30'
                    : 'border-white/30'
            )}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
            {/* Inner gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent pointer-events-none rounded-2xl" />
            <div className="absolute -inset-1 bg-primary-500/0 group-hover:bg-primary-500/5 rounded-2xl transition-colors duration-300 pointer-events-none" />

            <div className="relative flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-500 mb-1">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold tracking-tight text-warm-900 tabular-nums">
                            {isNumeric ? (
                                <AnimatedNumber value={value} decimals={suffix === '%' ? 0 : 1} suffix={suffix} />
                            ) : (
                                displayValue
                            )}
                        </p>
                        {trend && trend !== 'stable' && (
                            <span className={cn(
                                'flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
                                trendColor
                            )}>
                                {trendIsPositive ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right side: Sparkline or Icon */}
                <div className="flex-shrink-0 mt-1">
                    {hasSparkline ? (
                        <Sparkline
                            data={sparkline}
                            color={sparkColor}
                            width={80}
                            height={28}
                        />
                    ) : (
                        <div className={cn(
                            'w-12 h-12 rounded-lg flex items-center justify-center',
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
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconArrowRight size={14} className="text-primary-500" />
                </div>
            )}
        </motion.div>
    );

    if (href) {
        return <Link href={href} prefetch={true}>{CardContent}</Link>;
    }
    return CardContent;
});
