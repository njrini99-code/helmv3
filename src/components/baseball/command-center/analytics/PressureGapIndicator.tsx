'use client';

import { cn } from '@/lib/utils';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

interface PressureGapIndicatorProps {
  gap: number; // Positive = better in games, Negative = struggles in games
  practiceAvg: number;
  gameAvg: number;
  compact?: boolean;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatAvg(value: number | null | undefined): string {
  if (value == null) return '---';
  return value.toFixed(3).replace(/^0\./, '.');
}

function formatGap(gap: number): string {
  const points = Math.abs(gap * 1000).toFixed(0);
  return `${gap >= 0 ? '+' : '-'}${points} pts`;
}

export function getGapColor(gap: number): string {
  if (gap > 0.02) return 'text-primary-600';
  // Negative (pressure-struggle) gap reads pursuit clay — Living Annual ink
  // system, never raw red.
  if (gap < -0.02) return 'text-pursuit';
  return 'text-warm-500';
}

export function getGapBgColor(gap: number): string {
  if (gap > 0.02) return 'bg-primary-50';
  if (gap < -0.02) return 'bg-pursuit/10';
  return 'bg-warm-50';
}

function getGapLabel(gap: number): string {
  if (gap > 0.02) return 'clutch performer';
  if (gap < -0.02) return 'pressure struggles';
  return 'consistent';
}

// ============================================================================
// COMPACT INDICATOR
// ============================================================================

function CompactIndicator({
  gap,
  size = 'sm',
}: {
  gap: number;
  size: PressureGapIndicatorProps['size'];
}) {
  const iconSize = size === 'lg' ? 18 : size === 'md' ? 16 : 14;
  const textClass =
    size === 'lg' ? 'text-base' : size === 'md' ? 'text-sm' : 'text-sm';

  return (
    <div className="flex items-center gap-1">
      {gap > 0.01 ? (
        <IconTrendingUp size={iconSize} className="text-primary-500" />
      ) : gap < -0.01 ? (
        <IconTrendingDown size={iconSize} className="text-pursuit" />
      ) : (
        <IconMinus size={iconSize} className="text-warm-400" />
      )}
      <span
        className={cn('font-semibold tabular-nums', textClass, getGapColor(gap))}
      >
        {formatGap(gap)}
      </span>
    </div>
  );
}

// ============================================================================
// FULL INDICATOR
// ============================================================================

function FullIndicator({
  gap,
  practiceAvg,
  gameAvg,
  showLabels,
  size = 'md',
}: {
  gap: number;
  practiceAvg: number;
  gameAvg: number;
  showLabels?: boolean;
  size: PressureGapIndicatorProps['size'];
}) {
  // Calculate percentage for visual bar (capped at -100 to +100 points)
  const maxPoints = 100;
  const gapPoints = gap * 1000;
  const barPercentage = Math.min(Math.abs(gapPoints) / maxPoints, 1) * 50;
  const isPositive = gap >= 0;

  const barHeight = size === 'lg' ? 'h-3' : size === 'md' ? 'h-2' : 'h-1.5';
  const iconSize = size === 'lg' ? 18 : size === 'md' ? 16 : 14;
  const valueClass =
    size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-xs';
  const labelClass = size === 'lg' ? 'text-sm' : 'text-xs';

  return (
    <div className="space-y-2">
      {/* Labels */}
      {showLabels && (
        <div className="flex items-center justify-between text-xs text-warm-500">
          <span>Practice: {formatAvg(practiceAvg)}</span>
          <span>Game: {formatAvg(gameAvg)}</span>
        </div>
      )}

      {/* Visual bar */}
      <div
        className={cn(
          'relative bg-warm-100 rounded-full overflow-hidden',
          barHeight
        )}
      >
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-warm-300 z-10" />

        {/* Gap fill */}
        <div
          className={cn(
            'absolute top-0 bottom-0 rounded-full transition-all duration-300',
            // Negative fill reads pursuit clay — Living Annual ink system, never raw red.
            isPositive ? 'bg-primary-400' : 'bg-pursuit',
            isPositive ? 'left-1/2' : 'right-1/2'
          )}
          style={{
            width: `${barPercentage}%`,
          }}
        />
      </div>

      {/* Gap value and label */}
      <div className="flex items-center justify-center gap-1">
        {gap > 0.01 ? (
          <IconTrendingUp size={iconSize} className="text-primary-500" />
        ) : gap < -0.01 ? (
          <IconTrendingDown size={iconSize} className="text-pursuit" />
        ) : (
          <IconMinus size={iconSize} className="text-warm-400" />
        )}
        <span
          className={cn('font-bold tabular-nums', valueClass, getGapColor(gap))}
        >
          {formatGap(gap)}
        </span>
        <span className={cn('text-warm-500', labelClass)}>
          {getGapLabel(gap)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PressureGapIndicator({
  gap,
  practiceAvg,
  gameAvg,
  compact = false,
  showLabels = true,
  size = 'md',
  className,
}: PressureGapIndicatorProps) {
  if (compact) {
    return (
      <div className={className}>
        <CompactIndicator gap={gap} size={size} />
      </div>
    );
  }

  return (
    <div className={className}>
      <FullIndicator
        gap={gap}
        practiceAvg={practiceAvg}
        gameAvg={gameAvg}
        showLabels={showLabels}
        size={size}
      />
    </div>
  );
}

