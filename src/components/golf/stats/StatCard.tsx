'use client';

/**
 * Golf Stat Card Component
 *
 * Display a single statistic with optional trend indicator and comparison.
 */

import type { TrendDirection, StatCardProps } from '@/lib/types/golf';
import { cn } from '@/lib/utils';

type FormatType = 'number' | 'percentage' | 'score' | 'strokes_gained';

interface GolfStatCardProps extends StatCardProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  format?: FormatType;
  comparisonValue?: number;
  comparisonLabel?: string;
}

export function GolfStatCard({
  label,
  value,
  trend,
  trendValue,
  format = 'number',
  comparisonValue,
  comparisonLabel,
  className,
  size = 'md',
}: GolfStatCardProps) {
  // Format value based on type
  const formatDisplayValue = (val: number | string): string => {
    if (typeof val === 'string') return val;

    switch (format) {
      case 'percentage':
        return `${val.toFixed(1)}%`;
      case 'score':
        return val > 0 ? `+${val}` : `${val}`;
      case 'strokes_gained':
        return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
      default:
        return Number.isInteger(val) ? val.toString() : val.toFixed(1);
    }
  };

  // Get trend icon and color
  const getTrendStyles = () => {
    if (!trend) return null;

    const isPositive = trend === 'improving';

    return {
      icon: trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→',
      color: trend === 'stable' ? 'text-gray-500' : isPositive ? 'text-green-500' : 'text-red-500',
      bgColor: trend === 'stable' ? 'bg-gray-50' : isPositive ? 'bg-green-50' : 'bg-red-50',
    };
  };

  const trendStyles = getTrendStyles();

  // Get comparison styles
  const getComparisonStyles = () => {
    if (comparisonValue === undefined || typeof value === 'string') return null;

    const diff = value - comparisonValue;
    const isBetter = format === 'strokes_gained' ? diff > 0 : diff < 0;

    return {
      diff: Math.abs(diff),
      isBetter,
      color: isBetter ? 'text-green-600' : 'text-red-600',
    };
  };

  const comparisonStyles = getComparisonStyles();

  const sizeStyles = {
    sm: {
      container: 'p-3',
      label: 'text-xs',
      value: 'text-lg',
      trend: 'text-xs',
    },
    md: {
      container: 'p-4',
      label: 'text-sm',
      value: 'text-2xl',
      trend: 'text-xs',
    },
    lg: {
      container: 'p-6',
      label: 'text-base',
      value: 'text-3xl',
      trend: 'text-sm',
    },
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-xl',
        styles.container,
        className
      )}
    >
      {/* Label */}
      <div className={cn('text-gray-500 mb-1', styles.label)}>{label}</div>

      {/* Value and Trend */}
      <div className="flex items-center gap-2">
        <span className={cn('font-bold text-gray-900', styles.value)}>
          {formatDisplayValue(value)}
        </span>

        {trendStyles && (
          <div
            className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded',
              trendStyles.bgColor,
              trendStyles.color,
              styles.trend
            )}
          >
            <span aria-hidden="true">{trendStyles.icon}</span>
            <span className="sr-only">
              {trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable'}
            </span>
            {trendValue !== undefined && (
              <span>{typeof trendValue === 'number' ? Math.abs(trendValue).toFixed(2) : trendValue}</span>
            )}
          </div>
        )}
      </div>

      {/* Comparison */}
      {comparisonStyles && comparisonLabel && (
        <div className={cn('mt-2 text-xs', comparisonStyles.color)}>
          <span aria-hidden="true">{comparisonStyles.isBetter ? '↑' : '↓'}</span>
          <span className="sr-only">{comparisonStyles.isBetter ? 'Better by' : 'Worse by'}</span>{' '}
          {comparisonStyles.diff.toFixed(format === 'percentage' ? 1 : 2)}{' '}
          vs {comparisonLabel}
        </div>
      )}
    </div>
  );
}

// Grid of stat cards
export function StatCardGrid({
  stats,
  columns = 4,
  className,
}: {
  stats: StatCardProps[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const colClasses = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', colClasses[columns], className)}>
      {stats.map((stat, i) => (
        <GolfStatCard key={i} {...stat} />
      ))}
    </div>
  );
}

// Key Performance Indicators row
export function KPIRow({
  scoringAvg,
  puttsPerRound,
  fairwayPct,
  girPct,
  sgTotal,
  trends,
  className,
}: {
  scoringAvg: number;
  puttsPerRound: number;
  fairwayPct: number;
  girPct: number;
  sgTotal: number;
  trends?: {
    scoringAvg?: TrendDirection;
    putts?: TrendDirection;
    fairway?: TrendDirection;
    gir?: TrendDirection;
    sg?: TrendDirection;
  };
  className?: string;
}) {
  const stats: GolfStatCardProps[] = [
    {
      label: 'Scoring Average',
      value: scoringAvg,
      trend: trends?.scoringAvg,
      format: 'number',
    },
    {
      label: 'Putts / Round',
      value: puttsPerRound,
      trend: trends?.putts,
      format: 'number',
    },
    {
      label: 'Fairway %',
      value: fairwayPct,
      trend: trends?.fairway,
      format: 'percentage',
    },
    {
      label: 'GIR %',
      value: girPct,
      trend: trends?.gir,
      format: 'percentage',
    },
    {
      label: 'Strokes Gained',
      value: sgTotal,
      trend: trends?.sg,
      format: 'strokes_gained',
    },
  ];

  return (
    <div className={cn('grid grid-cols-5 gap-4', className)}>
      {stats.map((stat, i) => (
        <GolfStatCard key={i} {...stat} size="md" />
      ))}
    </div>
  );
}

// Scoring distribution mini chart
export function ScoringDistribution({
  eagles,
  birdies,
  pars,
  bogeys,
  doublePlus,
  className,
}: {
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  className?: string;
}) {
  const total = eagles + birdies + pars + bogeys + doublePlus;
  if (total === 0) return null;

  const data = [
    { label: 'Eagles', value: eagles, color: 'bg-purple-500', pct: (eagles / total) * 100 },
    { label: 'Birdies', value: birdies, color: 'bg-green-500', pct: (birdies / total) * 100 },
    { label: 'Pars', value: pars, color: 'bg-gray-400', pct: (pars / total) * 100 },
    { label: 'Bogeys', value: bogeys, color: 'bg-orange-400', pct: (bogeys / total) * 100 },
    { label: '2+ Over', value: doublePlus, color: 'bg-red-500', pct: (doublePlus / total) * 100 },
  ];

  return (
    <div className={cn('', className)} role="figure" aria-label="Scoring distribution">
      {/* Accessible summary for screen readers */}
      <div className="sr-only">
        Scoring distribution: {data.map(d => `${d.label}: ${d.value} (${d.pct.toFixed(1)}%)`).join(', ')}
      </div>

      {/* Bar */}
      <div className="flex h-6 rounded-lg overflow-hidden mb-2" aria-hidden="true">
        {data.map((d, i) => (
          d.pct > 0 && (
            <div
              key={i}
              className={cn(d.color, 'transition-all')}
              style={{ width: `${d.pct}%` }}
              title={`${d.label}: ${d.value} (${d.pct.toFixed(1)}%)`}
            />
          )
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={cn('w-2.5 h-2.5 rounded', d.color)} aria-hidden="true" />
            <span className="text-gray-600">
              {d.label}: {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
