'use client';

/**
 * StatsOverviewCards
 * 
 * Bento grid displaying key batting metrics:
 * AVG, OBP, SLG, OPS, Exit Velocity
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconTrendingUp, IconTrendingDown, IconMinus } from '@/components/icons';
import type { BaseballPlayerAggregates, BaseballTrend } from '@/lib/types';

interface StatsOverviewCardsProps {
  aggregates: BaseballPlayerAggregates | null;
  className?: string;
}

interface StatCardProps {
  label: string;
  value: string | number | null;
  subLabel?: string;
  subValue?: string | number | null;
  trend?: BaseballTrend | null;
  size?: 'normal' | 'large';
  highlight?: boolean;
}

function StatCard({ label, value, subLabel, subValue, trend, size = 'normal', highlight = false }: StatCardProps) {
  const TrendIcon = trend === 'improving' ? IconTrendingUp : trend === 'declining' ? IconTrendingDown : IconMinus;
  const trendColor = trend === 'improving' ? 'text-primary-600' : trend === 'declining' ? 'text-red-500' : 'text-warm-400';

  return (
    <div
      className={cn(
        'bg-cream-100/75 backdrop-blur-xl border border-warm-200/45 shadow-glass rounded-2xl p-4 transition-all duration-200 hover:shadow-glass-hover',
        size === 'large' && 'col-span-2 md:col-span-1',
        highlight && 'ring-2 ring-primary-500/20'
      )}
      role="group"
      aria-label={`${label} statistic`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">{label}</p>
        {trend && (
          <div className={cn('flex items-center', trendColor)} aria-label={`Trend: ${trend}`}>
            <TrendIcon size={14} />
          </div>
        )}
      </div>
      <p className={cn(
        'font-bold text-warm-900 mt-1',
        size === 'large' ? 'text-3xl' : 'text-2xl'
      )}>
        {value ?? '---'}
      </p>
      {subLabel && (
        <div className="mt-2 pt-2 border-t border-warm-100">
          <p className="text-micro text-warm-400">{subLabel}</p>
          <p className="text-sm font-semibold text-warm-700">{subValue ?? '---'}</p>
        </div>
      )}
    </div>
  );
}

export function StatsOverviewCards({ aggregates, className }: StatsOverviewCardsProps) {
  const stats = useMemo(() => {
    if (!aggregates) {
      return {
        avg: null,
        obp: null,
        slg: null,
        ops: null,
        exitVelo: null,
        practiceAvg: null,
        gameAvg: null,
        pressureGap: null,
        trend: null,
      };
    }

    return {
      avg: aggregates.career_avg != null ? aggregates.career_avg.toFixed(3) : null,
      obp: aggregates.career_obp != null ? aggregates.career_obp.toFixed(3) : null,
      slg: aggregates.career_slg != null ? aggregates.career_slg.toFixed(3) : null,
      ops: aggregates.career_ops != null ? aggregates.career_ops.toFixed(3) : null,
      exitVelo: aggregates.avg_exit_velocity != null ? `${aggregates.avg_exit_velocity.toFixed(1)}` : null,
      maxExitVelo: aggregates.max_exit_velocity != null ? `${aggregates.max_exit_velocity.toFixed(1)}` : null,
      practiceAvg: aggregates.practice_avg != null ? aggregates.practice_avg.toFixed(3) : null,
      gameAvg: aggregates.game_avg != null ? aggregates.game_avg.toFixed(3) : null,
      pressureGap: aggregates.pressure_gap != null
        ? `${aggregates.pressure_gap > 0 ? '+' : ''}${(aggregates.pressure_gap * 100).toFixed(0)} pts` 
        : null,
      trend: aggregates.recent_trend,
      last5Avg: aggregates.last_5_avg != null ? aggregates.last_5_avg.toFixed(3) : null,
      last10Avg: aggregates.last_10_avg != null ? aggregates.last_10_avg.toFixed(3) : null,
      sessions: aggregates.total_sessions,
    };
  }, [aggregates]);

  if (!aggregates) {
    return (
      <div className={cn('glass-standard rounded-2xl p-8 text-center', className)}>
        <p className="text-warm-500">No aggregate stats available yet.</p>
        <p className="text-sm text-warm-400 mt-1">Stats will appear after the first session is logged.</p>
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-5 gap-3', className)}>
      {/* Primary slash line stats */}
      <StatCard
        label="AVG"
        value={stats.avg}
        subLabel="Last 5"
        subValue={stats.last5Avg}
        trend={stats.trend}
        highlight
      />
      <StatCard
        label="OBP"
        value={stats.obp}
      />
      <StatCard
        label="SLG"
        value={stats.slg}
      />
      <StatCard
        label="OPS"
        value={stats.ops}
        subLabel="Sessions"
        subValue={stats.sessions}
      />
      <StatCard
        label="Exit Velo"
        value={stats.exitVelo ? `${stats.exitVelo} mph` : null}
        subLabel="Max"
        subValue={stats.maxExitVelo ? `${stats.maxExitVelo} mph` : null}
      />
    </div>
  );
}
