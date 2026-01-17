'use client';

/**
 * Strokes Gained Breakdown Bar Chart
 *
 * Horizontal bar chart showing strokes gained by category with:
 * - Color coding (green for positive, red for negative)
 * - Optional comparison bars
 * - Category details and per-shot averages
 */

import {
  formatStrokesGained,
  getStrokesGainedColor,
  getStrokesGainedBgColor,
  type StrokesGainedResult,
  type StrokesGainedBreakdown,
} from '@/lib/golf/strokes-gained';
import { cn } from '@/lib/utils';

interface StrokesGainedBreakdownChartProps {
  data: StrokesGainedResult | StrokesGainedBreakdown;
  comparisonData?: StrokesGainedResult;
  comparisonLabel?: string;
  showPerShot?: boolean;
  maxValue?: number;
  className?: string;
}

export function StrokesGainedBreakdownChart({
  data,
  comparisonData,
  comparisonLabel = 'Comparison',
  showPerShot = false,
  maxValue = 2,
  className,
}: StrokesGainedBreakdownChartProps) {
  const categories = [
    {
      key: 'sg_off_tee' as const,
      label: 'Off the Tee',
      description: 'Tee shots on par 4s and 5s',
      icon: '🏌️',
    },
    {
      key: 'sg_approach' as const,
      label: 'Approach',
      description: 'Shots intended to reach the green',
      icon: '🎯',
    },
    {
      key: 'sg_around_green' as const,
      label: 'Around the Green',
      description: 'Chips and pitches within 30 yards',
      icon: '⛳',
    },
    {
      key: 'sg_putting' as const,
      label: 'Putting',
      description: 'All putts on the green',
      icon: '🕳️',
    },
  ];

  const hasBreakdown = 'shots_off_tee' in data;

  // Get shot counts if available
  const getShotCount = (key: string): number | null => {
    if (!hasBreakdown) return null;
    const breakdown = data as StrokesGainedBreakdown;
    switch (key) {
      case 'sg_off_tee': return breakdown.shots_off_tee;
      case 'sg_approach': return breakdown.shots_approach;
      case 'sg_around_green': return breakdown.shots_around_green;
      case 'sg_putting': return breakdown.shots_putting;
      default: return null;
    }
  };

  const getPerShot = (key: string): number | null => {
    if (!hasBreakdown) return null;
    const breakdown = data as StrokesGainedBreakdown;
    switch (key) {
      case 'sg_off_tee': return breakdown.sg_per_shot_off_tee;
      case 'sg_approach': return breakdown.sg_per_shot_approach;
      case 'sg_around_green': return breakdown.sg_per_shot_around_green;
      case 'sg_putting': return breakdown.sg_per_shot_putting;
      default: return null;
    }
  };

  // Calculate bar width percentage
  const getBarWidth = (value: number): number => {
    // Scale: 0 is center, positive goes right, negative goes left
    // maxValue represents 100% width from center
    return Math.min(100, (Math.abs(value) / maxValue) * 100);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {categories.map((cat) => {
        const value = data[cat.key];
        const compValue = comparisonData?.[cat.key];
        const shotCount = getShotCount(cat.key);
        const perShot = getPerShot(cat.key);
        const isPositive = value >= 0;

        return (
          <div key={cat.key} className="space-y-1">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{cat.icon}</span>
                <div>
                  <div className="font-medium text-gray-900">{cat.label}</div>
                  <div className="text-xs text-gray-500">{cat.description}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={cn('text-lg font-bold', getStrokesGainedColor(value))}>
                  {formatStrokesGained(value)}
                </div>
                {shotCount !== null && (
                  <div className="text-xs text-gray-500">
                    {shotCount} shots
                    {showPerShot && perShot !== null && (
                      <span className="ml-1">
                        ({formatStrokesGained(perShot)}/shot)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bar chart */}
            <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
              {/* Center line */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300 z-10" />

              {/* Player bar */}
              <div
                className={cn(
                  'absolute top-1 bottom-1 rounded transition-all duration-300',
                  isPositive ? 'bg-green-500' : 'bg-red-400'
                )}
                style={{
                  width: `${getBarWidth(value) / 2}%`,
                  left: isPositive ? '50%' : undefined,
                  right: !isPositive ? '50%' : undefined,
                }}
              />

              {/* Comparison bar */}
              {compValue !== undefined && (
                <div
                  className={cn(
                    'absolute top-2 bottom-2 rounded opacity-50 border-2',
                    compValue >= 0 ? 'border-green-700' : 'border-red-600'
                  )}
                  style={{
                    width: `${getBarWidth(compValue) / 2}%`,
                    left: compValue >= 0 ? '50%' : undefined,
                    right: compValue < 0 ? '50%' : undefined,
                    backgroundColor: 'transparent',
                  }}
                />
              )}

              {/* Scale labels */}
              <div className="absolute bottom-0 left-2 text-xs text-gray-400">-{maxValue}</div>
              <div className="absolute bottom-0 right-2 text-xs text-gray-400">+{maxValue}</div>
            </div>
          </div>
        );
      })}

      {/* Total */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">Total Strokes Gained</div>
            <div className="text-sm text-gray-500">Combined performance vs. scratch</div>
          </div>
          <div className={cn('text-2xl font-bold', getStrokesGainedColor(data.sg_total))}>
            {formatStrokesGained(data.sg_total)}
          </div>
        </div>

        {/* Total bar */}
        <div className="mt-2 relative h-10 bg-gray-100 rounded-lg overflow-hidden">
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300 z-10" />
          <div
            className={cn(
              'absolute top-1 bottom-1 rounded transition-all duration-300',
              data.sg_total >= 0 ? 'bg-green-500' : 'bg-red-400'
            )}
            style={{
              width: `${getBarWidth(data.sg_total) / 2}%`,
              left: data.sg_total >= 0 ? '50%' : undefined,
              right: data.sg_total < 0 ? '50%' : undefined,
            }}
          />
        </div>
      </div>

      {/* Legend */}
      {comparisonData && (
        <div className="flex items-center justify-center gap-4 text-sm pt-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded bg-green-500" />
            <span className="text-gray-600">Your Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded border-2 border-green-700" />
            <span className="text-gray-600">{comparisonLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for smaller spaces
export function StrokesGainedCompact({
  data,
  className,
}: {
  data: StrokesGainedResult;
  className?: string;
}) {
  const categories = [
    { key: 'sg_off_tee' as const, label: 'OTT' },
    { key: 'sg_approach' as const, label: 'APP' },
    { key: 'sg_around_green' as const, label: 'ARG' },
    { key: 'sg_putting' as const, label: 'PUT' },
  ];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {categories.map((cat) => {
        const value = data[cat.key];
        return (
          <div
            key={cat.key}
            className={cn(
              'flex flex-col items-center px-2 py-1 rounded',
              getStrokesGainedBgColor(value)
            )}
          >
            <span className="text-xs text-gray-500">{cat.label}</span>
            <span className={cn('text-sm font-semibold', getStrokesGainedColor(value))}>
              {formatStrokesGained(value)}
            </span>
          </div>
        );
      })}
      <div className="h-8 w-px bg-gray-200" />
      <div
        className={cn(
          'flex flex-col items-center px-2 py-1 rounded',
          getStrokesGainedBgColor(data.sg_total)
        )}
      >
        <span className="text-xs text-gray-500">Total</span>
        <span className={cn('text-sm font-bold', getStrokesGainedColor(data.sg_total))}>
          {formatStrokesGained(data.sg_total)}
        </span>
      </div>
    </div>
  );
}
