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
    const sparkColor = trend === 'improving' ? '#16A34A' : trend === 'declining' ? '#DC2626' : '#94A3B8';

    const CardContent = (
        <m.div
            role={href ? 'link' : 'region'}
            aria-label={`${label}: ${displayValue}${suffix}`}
            className={cn(
                'relative overflow-clip group min-w-0',
                'surface-matte rounded-3xl',
                'transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                'p-5 md:p-6',
                accent && 'before:absolute before:inset-y-6 before:left-0 before:w-[2px] before:bg-primary-500/70 before:rounded-r-full',
                href && 'cursor-pointer'
            )}
            whileHover={{ y: -3 }}
            whileTap={href ? { y: -1, scale: 0.99 } : undefined}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="relative flex items-start justify-between gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                    <p className="text-eyebrow md:text-caption font-medium text-warm-500 uppercase tracking-[0.06em] mb-2 truncate opacity-80">{label}</p>
                    <div className="flex items-baseline gap-2 min-w-0" aria-live="polite">
                        <p className="text-h1 md:text-h1 font-light leading-none tracking-[-0.025em] text-warm-900 tabular-nums truncate">
                            {isNumeric ? (
                                <AnimatedNumber value={value} decimals={suffix === '%' ? 0 : 1} suffix={suffix} />
                            ) : (
                                displayValue
                            )}
                        </p>
                        {trend && trend !== 'stable' && (
                            <span className={cn(
                                'inline-flex items-center text-eyebrow font-medium flex-shrink-0',
                                trendIsPositive ? 'text-primary-600' : 'text-red-500'
                            )}>
                                {trendIsPositive ? <IconTrendingUp size={10} /> : <IconTrendingDown size={10} />}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-shrink-0 mt-1">
                    {hasSparkline ? (
                        <>
                            <div className="md:hidden">
                                <Sparkline
                                    data={sparkline}
                                    color={sparkColor}
                                    width={48}
                                    height={22}
                                />
                            </div>
                            <div className="hidden md:block">
                                <Sparkline
                                    data={sparkline}
                                    color={sparkColor}
                                    width={76}
                                    height={26}
                                />
                            </div>
                        </>
                    ) : (
                        <div className={cn(
                            'w-10 h-10 md:w-11 md:h-11 rounded-2xl flex items-center justify-center',
                            'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105',
                            iconBg, iconColor
                        )}>
                            {icon}
                        </div>
                    )}
                </div>
            </div>

            {href && (
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
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
