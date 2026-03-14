'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from '@/components/icons';

interface CompositeRatingCardProps {
  composite: number;
  categories: {
    teeGame: number;
    approach: number;
    shortGame: number;
    putting: number;
    scoring: number;
  };
  percentiles?: Record<string, { team: number }>;
  trend?: { direction: 'improving' | 'stable' | 'declining'; delta: number };
}

const categoryLabels: Record<string, string> = {
  teeGame: 'Tee Game',
  approach: 'Approach',
  shortGame: 'Short Game',
  putting: 'Putting',
  scoring: 'Scoring',
};

function getRatingColor(value: number): string {
  if (value >= 80) return 'text-emerald-500';
  if (value >= 60) return 'text-primary-600';
  if (value >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getRingColor(value: number): string {
  if (value >= 80) return 'stroke-emerald-500';
  if (value >= 60) return 'stroke-primary-500';
  if (value >= 40) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function getBarColor(value: number): string {
  if (value >= 80) return 'bg-emerald-500';
  if (value >= 60) return 'bg-primary-500';
  if (value >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getBarBgColor(value: number): string {
  if (value >= 80) return 'bg-emerald-100';
  if (value >= 60) return 'bg-primary-100';
  if (value >= 40) return 'bg-amber-100';
  return 'bg-red-100';
}

const trendConfig = {
  improving: { icon: IconTrendingUp, color: 'text-primary-600', label: 'Improving' },
  stable: { icon: IconMinus, color: 'text-warm-400', label: 'Stable' },
  declining: { icon: IconTrendingDown, color: 'text-red-500', label: 'Declining' },
};

export function CompositeRatingCard({
  composite,
  categories,
  percentiles,
  trend,
}: CompositeRatingCardProps) {
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (composite / 100) * circumference;

  return (
    <GlassCard className="relative overflow-hidden" glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      <div className="flex flex-col items-center gap-6">
        {/* Header */}
        <p className="text-sm font-semibold uppercase tracking-wider text-warm-500">
          Game Strength
        </p>

        {/* Composite ring */}
        <motion.div
          className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
            <circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              strokeWidth="8"
              className="stroke-warm-100"
            />
            <motion.circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={getRingColor(composite)}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-5xl font-bold tabular-nums', getRatingColor(composite))}>
              {composite}
            </span>
          </div>
        </motion.div>

        {/* Trend indicator */}
        {trend && (
          <motion.div
            className={cn('flex items-center gap-1.5 text-sm font-medium', trendConfig[trend.direction].color)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {(() => {
              const TrendIcon = trendConfig[trend.direction].icon;
              return <TrendIcon size={16} />;
            })()}
            <span>
              {trendConfig[trend.direction].label}{' '}
              <span className="tabular-nums">
                {trend.delta > 0 ? '+' : ''}{trend.delta}
              </span>{' '}
              over 30 days
            </span>
          </motion.div>
        )}

        {/* Category bars */}
        <div className="w-full space-y-3">
          {(Object.entries(categories) as [keyof typeof categories, number][]).map(
            ([key, value], i) => (
              <motion.div
                key={key}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
              >
                <span className="text-sm font-medium text-warm-700 w-24 shrink-0">
                  {categoryLabels[key]}
                </span>
                <div className={cn('flex-1 h-2.5 rounded-full overflow-hidden', getBarBgColor(value))}>
                  <motion.div
                    className={cn('h-full rounded-full', getBarColor(value))}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, delay: 0.4 + i * 0.08, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-sm font-semibold text-warm-900 tabular-nums w-8 text-right">
                  {value}
                </span>
                {percentiles?.[key] && (
                  <span className="text-xs text-warm-400 tabular-nums w-16 text-right">
                    {percentiles[key].team}th %ile
                  </span>
                )}
              </motion.div>
            )
          )}
        </div>
      </div>
    </GlassCard>
  );
}
