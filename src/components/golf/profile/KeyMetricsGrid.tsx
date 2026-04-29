'use client';

/**
 * KeyMetricsGrid - Premium stat cards for player profile
 *
 * Displays 6 key metrics with:
 * - Glass morphism cards with shine effects
 * - Staggered entrance animations
 * - Color-coded values based on performance
 * - Skeleton loading state
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

interface KeyMetricsGridProps {
  stats: GolfStats | null;
  handicap: number | null;
  loading?: boolean;
  className?: string;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  colorClass?: string;
  index: number;
}

// Format handicap with +/- prefix
function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '—';
  if (handicap > 0) return `+${handicap.toFixed(1)}`;
  return handicap.toFixed(1);
}

// Format score to par
function formatScoreToPar(toPar: number | null): string {
  if (toPar === null) return '—';
  if (toPar === 0) return 'E';
  if (toPar > 0) return `+${toPar.toFixed(1)}`;
  return toPar.toFixed(1);
}

// Get color class for scoring (lower is better)
function getScoringColor(toPar: number | null): string {
  if (toPar === null) return 'text-warm-900';
  if (toPar <= -2) return 'text-primary-600';
  if (toPar < 0) return 'text-primary-600';
  if (toPar === 0) return 'text-warm-900';
  if (toPar <= 3) return 'text-amber-600';
  return 'text-red-600';
}

// Get color class for percentage (higher is better)
function getPercentageColor(pct: number | null, goodThreshold: number = 50): string {
  if (pct === null) return 'text-warm-900';
  if (pct >= goodThreshold + 15) return 'text-primary-600';
  if (pct >= goodThreshold) return 'text-primary-600';
  if (pct >= goodThreshold - 15) return 'text-amber-600';
  return 'text-red-600';
}

// Individual metric card with animation
function MetricCard({ label, value, subtext, colorClass = 'text-warm-900', index }: MetricCardProps) {
  return (
    <div
      className="relative surface-matte rounded-xl overflow-clip p-4 text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
      style={{
        animation: 'fadeInUp 0.4s ease-out forwards',
        animationDelay: `${index * 60}ms`,
        opacity: 0,
      }}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      {/* Value - large and prominent */}
      <div className={cn('text-[24px] md:text-[30px] font-light tracking-[-0.025em] tabular-nums tracking-tight', colorClass)}>
        {value}
      </div>

      {/* Label */}
      <div className="text-xs font-medium text-warm-700 mt-1 uppercase tracking-wide">
        {label}
      </div>

      {/* Optional subtext */}
      {subtext && (
        <div className="text-xs text-warm-400 mt-0.5">
          {subtext}
        </div>
      )}
    </div>
  );
}

// Skeleton card for loading state
function MetricCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="relative surface-matte rounded-xl overflow-clip p-4 animate-pulse"
      style={{
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="h-7 bg-warm-200 rounded w-16 mx-auto mb-2" />
      <div className="h-4 bg-warm-200 rounded w-12 mx-auto" />
    </div>
  );
}

export const KeyMetricsGrid = memo(function KeyMetricsGrid({
  stats,
  handicap,
  loading = false,
  className,
}: KeyMetricsGridProps) {
  // Show skeleton during loading
  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3', className)}>
        {[...Array(6)].map((_, i) => (
          <MetricCardSkeleton key={i} index={i} />
        ))}
      </div>
    );
  }

  // Build metrics array
  const metrics = [
    {
      label: 'Handicap',
      value: formatHandicap(handicap),
      colorClass: handicap !== null && handicap <= 5 ? 'text-primary-600' : 'text-warm-900',
    },
    {
      label: 'Rounds',
      value: stats?.roundsPlayed?.toString() ?? '0',
      colorClass: 'text-warm-900',
    },
    {
      label: 'Avg Score',
      value: stats?.scoringAverage?.toFixed(1) ?? '—',
      colorClass: getScoringColor(stats?.avgScoreToPar ?? null),
    },
    {
      label: 'vs Par',
      value: formatScoreToPar(stats?.avgScoreToPar ?? null),
      colorClass: getScoringColor(stats?.avgScoreToPar ?? null),
    },
    {
      label: 'GIR',
      value: stats?.girPercentage != null ? `${stats.girPercentage.toFixed(0)}%` : '—',
      subtext: stats?.girTotal ? `${stats.girTotal}/${stats.girOpportunities}` : undefined,
      colorClass: getPercentageColor(stats?.girPercentage ?? null, 55),
    },
    {
      label: 'Fairway',
      value: stats?.fairwayPercentage != null ? `${stats.fairwayPercentage.toFixed(0)}%` : '—',
      subtext: stats?.fairwaysHit ? `${stats.fairwaysHit}/${stats.fairwayOpportunities}` : undefined,
      colorClass: getPercentageColor(stats?.fairwayPercentage ?? null, 55),
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3', className)}>
      {metrics.map((metric, index) => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          subtext={metric.subtext}
          colorClass={metric.colorClass}
          index={index}
        />
      ))}
    </div>
  );
});

