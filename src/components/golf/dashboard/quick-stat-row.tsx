'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface QuickStatItem {
    label: string;
    value: string | number | null;
    suffix?: string;
}

interface QuickStatRowProps {
    stats: QuickStatItem[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export const QuickStatRow = memo(function QuickStatRow({ stats }: QuickStatRowProps) {
    const visibleStats = stats.filter(s => s.value !== null && s.value !== undefined);

    if (visibleStats.length === 0) return null;

    return (
        <div className={cn(
            'flex items-center justify-between',
            'glass-premium',
            'rounded-2xl px-5 py-3.5',
            'overflow-x-auto'
        )}>
            {visibleStats.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-3">
                    {i > 0 && (
                        <div className="w-px h-8 bg-warm-200/50 flex-shrink-0" />
                    )}
                    <div className="text-center min-w-[60px]">
                        <p className="text-label font-medium text-warm-400 uppercase tracking-wider mb-0.5">
                            {stat.label}
                        </p>
                        <p className="text-base font-bold text-warm-900 tabular-nums">
                            {stat.value !== null ? `${stat.value}${stat.suffix || ''}` : '--'}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
});
