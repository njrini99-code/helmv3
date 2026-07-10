'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  value: string | number | null;
  unit?: string;
  highlight?: boolean;
}

interface QuickStatsDisplayProps {
  stats: StatItem[];
  variant?: 'horizontal' | 'grid';
  className?: string;
}

function formatStatValue(value: string | number | null, unit?: string): string {
  if (value === null || value === undefined) return '—';
  const formatted = typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value;
  return unit ? `${formatted}${unit}` : String(formatted);
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
              {formatStatValue(stat.value, stat.unit)}
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
              {formatStatValue(stat.value, stat.unit)}
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
