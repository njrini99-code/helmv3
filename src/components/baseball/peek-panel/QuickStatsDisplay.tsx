'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';

interface StatItem {
  label: string;
  value: string | number | null;
  unit?: string;
  highlight?: boolean;
  /**
   * Explicit decimal precision for this stat (e.g. GPA/60-time/pop-time = 2,
   * velocities = 0-1). When omitted, falls back to a generic "integer vs not"
   * heuristic — but that heuristic silently mis-rounds any stat whose honest
   * precision differs from 1 decimal (a 3.75 GPA reads as 3.8, a 2.34s pop
   * time reads as 2.3s), so callers with known stat semantics should set this.
   */
  decimals?: number;
}

interface QuickStatsDisplayProps {
  stats: StatItem[];
  variant?: 'horizontal' | 'grid';
  className?: string;
}

/** Renders a stat's figure — numbers roll on the shared odometer, strings render statically. */
function StatFigure({
  value,
  unit,
  decimals: decimalsProp,
}: {
  value: string | number | null;
  unit?: string;
  decimals?: number;
}) {
  if (value === null || value === undefined) {
    return <>—</>;
  }
  if (typeof value === 'number') {
    const decimals = decimalsProp ?? (value % 1 === 0 ? 0 : 1);
    return (
      <>
        <AnimatedNumber value={value} decimals={decimals} />
        {unit}
      </>
    );
  }
  return (
    <>
      {value}
      {unit}
    </>
  );
}

const QuickStatsDisplayComponent = function QuickStatsDisplay({
  stats,
  variant = 'horizontal',
  className,
}: QuickStatsDisplayProps) {
  const filteredStats = stats.filter((s) => s.value !== null && s.value !== undefined);

  if (filteredStats.length === 0) {
    return (
      <div className={cn('text-sm text-warm-400 text-center py-2', className)}>
        No stats available
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div
        className={cn(
          'grid grid-cols-2 gap-3',
          className
        )}
      >
        {filteredStats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'bg-cream-100 rounded-xl p-3 text-center',
              'border border-warm-200/45',
              stat.highlight && 'ring-2 ring-primary-200 bg-primary-50/50'
            )}
          >
            <div
              className={cn(
                'text-xl font-bold tabular-nums tracking-tight',
                stat.highlight ? 'text-primary-700' : 'text-warm-900'
              )}
            >
              <StatFigure value={stat.value} unit={stat.unit} decimals={stat.decimals} />
            </div>
            <div className="text-xs font-medium text-warm-500 uppercase tracking-wide mt-0.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Horizontal layout
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3',
        'bg-gradient-to-r from-warm-50 to-warm-100/50',
        'rounded-xl',
        className
      )}
    >
      {filteredStats.map((stat, index) => (
        <div key={stat.label} className="flex items-center gap-4">
          {index > 0 && <div className="w-px h-8 bg-warm-200" />}
          <div className="text-center">
            <div
              className={cn(
                'text-lg font-bold tabular-nums',
                stat.highlight ? 'text-primary-700' : 'text-warm-900'
              )}
            >
              <StatFigure value={stat.value} unit={stat.unit} decimals={stat.decimals} />
            </div>
            <div className="text-eyebrow font-medium text-warm-500 uppercase tracking-wide">
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const QuickStatsDisplay = memo(QuickStatsDisplayComponent);
QuickStatsDisplay.displayName = 'QuickStatsDisplay';
