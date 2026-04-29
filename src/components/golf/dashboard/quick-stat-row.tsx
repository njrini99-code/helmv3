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
            'grid grid-cols-2 sm:flex sm:items-center sm:justify-between',
            'surface-matte',
            'rounded-2xl px-4 md:px-5 py-3.5',
            'gap-y-3 gap-x-2'
        )}>
            {visibleStats.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-3 min-w-0">
                    {i > 0 && (
                        <div className="hidden sm:block w-px h-8 bg-warm-200/50 flex-shrink-0" />
                    )}
                    <div className="text-center min-w-0 flex-1 sm:min-w-[60px] sm:flex-none">
                        <p className="text-label font-medium text-warm-400 uppercase tracking-wider mb-0.5 truncate">
                            {stat.label}
                        </p>
                        <p className="text-[15px] font-medium text-warm-900 tabular-nums truncate">
                            {stat.value !== null ? `${stat.value}${stat.suffix || ''}` : '--'}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
});
