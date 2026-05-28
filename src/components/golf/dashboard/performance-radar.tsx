'use client';

import { memo } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChartBar, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import type { StrokesGainedSnapshot } from '@/app/golf/actions/dashboard-data';

// ============================================================================
// TYPES
// ============================================================================

interface PerformanceRadarProps {
    data: StrokesGainedSnapshot;
}

interface SGCategory {
    key: keyof Omit<StrokesGainedSnapshot, 'sg_total'>;
    label: string;
    shortLabel: string;
}

const SG_CATEGORIES: SGCategory[] = [
    { key: 'sg_off_tee', label: 'Off the Tee', shortLabel: 'Tee' },
    { key: 'sg_approach', label: 'Approach', shortLabel: 'App' },
    { key: 'sg_around_green', label: 'Around Green', shortLabel: 'AG' },
    { key: 'sg_putting', label: 'Putting', shortLabel: 'Putt' },
];

// ============================================================================
// HELPERS
// ============================================================================

function getMaxAbsValue(data: StrokesGainedSnapshot): number {
    const values = SG_CATEGORIES
        .map(c => data[c.key])
        .filter((v): v is number => v !== null)
        .map(Math.abs);
    return values.length > 0 ? Math.max(...values, 0.5) : 1; // min scale of 0.5
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PerformanceRadar = memo(function PerformanceRadar({ data }: PerformanceRadarProps) {
  const prefersReducedMotion = useReducedMotion();
    const hasData = SG_CATEGORIES.some(c => data[c.key] !== null);
    const maxVal = getMaxAbsValue(data);

    // Find best/worst categories
    const categoriesWithValues = SG_CATEGORIES
        .filter(c => data[c.key] !== null)
        .map(c => ({ ...c, value: data[c.key]! }));
    const best = categoriesWithValues.length > 0 ? categoriesWithValues.reduce((a, b) => a.value > b.value ? a : b) : null;
    const worst = categoriesWithValues.length > 0 ? categoriesWithValues.reduce((a, b) => a.value < b.value ? a : b) : null;

    if (!hasData) {
        return (
            <div className={cn(
                'relative overflow-clip',
                'bg-glass-subtle backdrop-blur-glass-prominent',
                'border border-warm-200/45 rounded-2xl',
                'p-5'
            )}>
                <div className="flex items-center gap-2 mb-4">
                    <IconChartBar size={14} className="text-primary-600" />
                    <h3 className="text-sm font-medium text-warm-500 uppercase tracking-wider">
                        Strokes Gained
                    </h3>
                </div>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mb-4">
                        <IconChartBar size={26} className="text-primary-600/70" />
                    </div>
                    <p className="text-subhead font-medium text-warm-900 mb-1.5">No strokes gained data</p>
                    <p className="text-xs leading-relaxed text-warm-500 max-w-[240px]">
                        Submit rounds with shot tracking to see your strokes gained breakdown
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            'relative overflow-clip',
            'surface-matte',
            'rounded-2xl p-5'
        )}>
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-primary-500/8 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
                {/* Header with SG Total */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <IconChartBar size={14} className="text-primary-600" />
                        <h3 className="text-sm font-medium text-warm-500 uppercase tracking-wider">
                            Strokes Gained
                        </h3>
                    </div>
                    {data.sg_total !== null && (
                        <div className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-body-sm font-medium tabular-nums',
                            data.sg_total >= 0
                                ? 'bg-primary-50 text-primary-700'
                                : 'bg-red-50 text-red-700'
                        )}>
                            {data.sg_total >= 0 ? '+' : ''}{data.sg_total.toFixed(1)}
                            <span className="text-xs font-medium opacity-70">total</span>
                        </div>
                    )}
                </div>

                {/* Horizontal bar chart */}
                <div className="space-y-3">
                    {SG_CATEGORIES.map((cat) => {
                        const value = data[cat.key];
                        if (value === null) return null;

                        const isPositive = value >= 0;
                        const barWidth = Math.min((Math.abs(value) / maxVal) * 50, 50); // 50% max width each direction
                        const isBest = best && cat.key === best.key;
                        const isWorst = worst && cat.key === worst.key;

                        return (
                            <div key={cat.key}>
                                {/* Label row */}
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-warm-700">{cat.label}</span>
                                        {isBest && (
                                            <span className="text-micro font-medium px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 flex items-center gap-0.5">
                                                <IconTrendingUp size={9} />
                                                Best
                                            </span>
                                        )}
                                        {isWorst && (
                                            <span className="text-micro font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 flex items-center gap-0.5">
                                                <IconTrendingDown size={9} />
                                                Focus
                                            </span>
                                        )}
                                    </div>
                                    <span className={cn(
                                        'text-eyebrow font-medium tabular-nums',
                                        isPositive ? 'text-primary-700' : 'text-red-600'
                                    )}>
                                        {isPositive ? '+' : ''}{value.toFixed(2)}
                                    </span>
                                </div>

                                {/* Bar */}
                                <div className="relative h-2.5 rounded-full bg-warm-100 overflow-hidden">
                                    {/* Center line */}
                                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-warm-300/50" />

                                    {isPositive ? (
                                        <m.div
                                            className="absolute left-1/2 top-0 bottom-0 bg-primary-500 rounded-r-full"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${barWidth}%` }}
                                            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.35, ease: [0.16, 1, 0.3, 1] })}
                                        />
                                    ) : (
                                        <m.div
                                            className="absolute right-1/2 top-0 bottom-0 bg-red-400 rounded-l-full"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${barWidth}%` }}
                                            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.35, ease: [0.16, 1, 0.3, 1] })}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
