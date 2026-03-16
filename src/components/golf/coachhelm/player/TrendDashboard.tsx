'use client';

import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconFlame,
  IconWarning,
  IconActivity,
} from '@/components/icons';

interface TrendDashboardProps {
  // Typed props (used when data is pre-parsed)
  trends?: {
    metric: string;
    windows: Array<{
      name: 'fast' | 'medium' | 'slow';
      direction: 'improving' | 'stable' | 'declining';
      magnitude: number;
      confidence: number;
    }>;
    signal: string;
    description: string;
  };
  streaks?: Array<{
    type: 'hot' | 'cold';
    length: number;
    magnitude: number;
    isOngoing: boolean;
  }>;
  volatility?: { current: number; historical: number; isElevated: boolean };
  // Raw data prop (from server action — parsed internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData?: Record<string, any>;
  playerState?: string;
}

const windowLabels: Record<string, { label: string; rounds: string }> = {
  fast: { label: 'Fast', rounds: '5 rounds' },
  medium: { label: 'Medium', rounds: '12 rounds' },
  slow: { label: 'Slow', rounds: '25 rounds' },
};

const directionConfig = {
  improving: {
    icon: IconTrendingUp,
    color: 'text-primary-600',
    barColor: 'bg-primary-500',
    barBg: 'bg-primary-100',
    label: 'Improving',
  },
  stable: {
    icon: IconMinus,
    color: 'text-warm-400',
    barColor: 'bg-warm-400',
    barBg: 'bg-warm-100',
    label: 'Stable',
  },
  declining: {
    icon: IconTrendingDown,
    color: 'text-red-500',
    barColor: 'bg-red-500',
    barBg: 'bg-red-100',
    label: 'Declining',
  },
};

const signalLabels: Record<string, string> = {
  strong_improving: 'Strongly Improving',
  strong_declining: 'Strongly Declining',
  short_term_dip: 'Short-Term Dip',
  short_term_spike: 'Short-Term Spike',
  trajectory_change: 'Trajectory Change',
  mixed: 'Mixed Signals',
  stable: 'Stable',
};

function formatSignalLabel(signal: string): string {
  return signalLabels[signal] ?? signal.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSignalBadgeStyle(signal: string): string {
  const lower = signal.toLowerCase();
  if (lower.includes('strong') && lower.includes('improv')) {
    return 'bg-primary-100 text-primary-700 border-primary-200';
  }
  if (lower.includes('dip') || lower.includes('decline')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (lower.includes('change') || lower.includes('shift')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-warm-100 text-warm-700 border-warm-200';
}

export function TrendDashboard({ trends, streaks, volatility, trendData, playerState: _playerState }: TrendDashboardProps) {
  // Resolve props: prefer typed props, fall back to parsing from trendData
  const resolvedTrends = trends ?? (trendData?.trends as typeof trends | undefined) ?? { metric: '', windows: [], signal: '', description: '' };
  const resolvedStreaks = streaks ?? (trendData?.streaks as typeof streaks | undefined) ?? [];
  const resolvedVolatility = volatility ?? (trendData?.volatility as typeof volatility | undefined);

  if (!resolvedTrends.windows.length) {
    return (
      <GlassCard className="relative overflow-hidden" glow="subtle">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <IconActivity size={32} className="text-warm-300 mb-3" />
          <p className="text-sm font-medium text-warm-500">Not enough data for trend analysis</p>
          <p className="text-xs text-warm-400 mt-1">Play more rounds to unlock trend insights</p>
        </div>
      </GlassCard>
    );
  }

  const ongoingStreaks = resolvedStreaks.filter((s) => s.isOngoing);

  return (
    <GlassCard className="relative overflow-hidden" glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      <div className="space-y-5">
        {/* Header with signal badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <IconActivity size={20} className="text-primary-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-warm-900">Trend Analysis</h3>
              <p className="text-sm text-warm-500">{resolvedTrends.metric}</p>
            </div>
          </div>
          <span
            className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border',
              getSignalBadgeStyle(resolvedTrends.signal)
            )}
          >
            {formatSignalLabel(resolvedTrends.signal)}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-warm-600">{resolvedTrends.description}</p>

        {/* Trend windows */}
        <div className="space-y-3">
          {resolvedTrends.windows.map((window, i) => {
            const config = directionConfig[window.direction];
            const DirectionIcon = config.icon;
            const meta = windowLabels[window.name];

            return (
              <m.div
                key={window.name}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="w-20 shrink-0">
                  <p className="text-sm font-medium text-warm-700">{meta.label}</p>
                  <p className="text-xs text-warm-400">{meta.rounds}</p>
                </div>

                <div className={cn('flex-1 h-3 rounded-full overflow-hidden', config.barBg)}>
                  <m.div
                    className={cn('h-full rounded-full', config.barColor)}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(Number(window.magnitude ?? 0) * 100, 100)}%` }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                  />
                </div>

                <div className={cn('flex items-center gap-1 shrink-0', config.color)}>
                  <DirectionIcon size={14} />
                  <span className="text-xs font-medium">{config.label}</span>
                </div>

                <span className="text-xs text-warm-400 tabular-nums w-10 text-right shrink-0">
                  {Math.round(Number(window.confidence ?? 0) * 100)}%
                </span>
              </m.div>
            );
          })}
        </div>

        {/* Streaks */}
        {ongoingStreaks.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/10">
            {ongoingStreaks.map((streak, i) => (
              <m.div
                key={i}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
                  streak.type === 'hot'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-blue-50 text-blue-700'
                )}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                {streak.type === 'hot' ? (
                  <IconFlame size={16} className="text-amber-500" />
                ) : (
                  <span className="text-base leading-none">*</span>
                )}
                <span>
                  {streak.length}-round {streak.type} streak
                </span>
                <span className="text-xs opacity-70 tabular-nums">
                  ({Math.abs(Number(streak.magnitude ?? 0)).toFixed(1)} strokes {streak.type === 'hot' ? 'below' : 'above'} avg)
                </span>
              </m.div>
            ))}
          </div>
        )}

        {/* Volatility warning */}
        {resolvedVolatility?.isElevated && (
          <m.div
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <IconWarning size={16} className="text-amber-500 shrink-0" />
            <span>Performance volatility is elevated</span>
            <span className="text-xs opacity-70 tabular-nums ml-auto">
              {Number(resolvedVolatility.current ?? 0).toFixed(1)} vs {Number(resolvedVolatility.historical ?? 0).toFixed(1)} avg
            </span>
          </m.div>
        )}
      </div>
    </GlassCard>
  );
}
