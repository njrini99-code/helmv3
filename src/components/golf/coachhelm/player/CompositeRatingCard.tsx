'use client';

import { memo } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconInfo,
} from '@/components/icons';

interface CompositeRatingCardProps {
  // Typed props (used when data is pre-parsed)
  composite?: number;
  categories?: {
    teeGame: number;
    approach: number;
    shortGame: number;
    putting: number;
    scoring: number;
  };
  percentiles?: Record<string, { team: number }>;
  trend?: { direction: 'improving' | 'stable' | 'declining'; delta: number };
  // Raw data prop (from server action — parsed internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any>;
  playerState?: string;
  playerName?: string;
}

const categoryLabels: Record<string, string> = {
  teeGame: 'Tee Game',
  approach: 'Approach',
  shortGame: 'Short Game',
  putting: 'Putting',
  scoring: 'Scoring',
};

// P157 single-accent: this card renders inside the Fairway `.fairway-ds` premium
// scope (FairwayPlayerCoachHelm Overview), which mandates ONE green. The two
// former green tiers (emerald ≥80 + primary ≥60) were a second accent. Both now
// resolve to the locked Fairway helm-green accent scale (a darker accent-600 for
// the top tier, accent-500 below it — same hue, never a second green). amber/red
// stay as honest warning/danger STATUS tones for the degraded tiers, not accents.
function getRatingColor(value: number): string {
  if (value >= 80) return 'text-accent-600';
  if (value >= 60) return 'text-accent-500';
  if (value >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getRingColor(value: number): string {
  if (value >= 80) return 'stroke-accent-600';
  if (value >= 60) return 'stroke-accent-500';
  if (value >= 40) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function getBarColor(value: number): string {
  if (value >= 80) return 'bg-accent-600';
  if (value >= 60) return 'bg-accent-500';
  if (value >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getBarBgColor(value: number): string {
  if (value >= 80) return 'bg-accent-100';
  if (value >= 60) return 'bg-accent-100';
  if (value >= 40) return 'bg-amber-100';
  return 'bg-red-100';
}

const trendConfig = {
  // P157 single-accent: "Improving" uses the locked Fairway accent (was a second
  // green via primary-600). stable/declining stay neutral/danger status tones.
  improving: { icon: IconTrendingUp, color: 'text-accent-600', label: 'Improving' },
  stable: { icon: IconMinus, color: 'text-warm-400', label: 'Stable' },
  declining: { icon: IconTrendingDown, color: 'text-red-500', label: 'Declining' },
};

function CompositeRatingCardImpl({
  composite,
  categories,
  percentiles,
  trend,
  profileData,
  playerState: _playerState,
  playerName: _playerName,
}: CompositeRatingCardProps) {
  const prefersReducedMotion = useReducedMotion();
  // Resolve props: prefer typed props, fall back to parsing from profileData
  const resolvedComposite = composite ?? (profileData?.composite as number | undefined);
  const resolvedCategories = categories ?? (profileData?.categories as typeof categories | undefined);
  const resolvedPercentiles = percentiles ?? (profileData?.percentiles as typeof percentiles | undefined);
  const resolvedTrend = trend ?? (profileData?.trend as typeof trend | undefined);

  // Show empty state when no real data exists (avoids contradictory 0 composite / 50 categories)
  const hasData = resolvedComposite != null || resolvedCategories != null;
  if (!hasData) {
    return (
      <Card variant="overlay" padding="md" className="relative overflow-hidden" glow="subtle">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600" />
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-sm font-medium uppercase tracking-wider text-warm-500">
            Game Strength
          </p>
          <EmptyState
            variant="minimal"
            icon={<IconInfo size={20} />}
            description="Not enough data yet. Complete more rounds to unlock your game rating."
          />
        </div>
      </Card>
    );
  }

  const displayComposite = Math.max(0, Math.min(100, Number(resolvedComposite ?? 0)));
  const displayCategories = resolvedCategories ?? { teeGame: 50, approach: 50, shortGame: 50, putting: 50, scoring: 50 };

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (displayComposite / 100) * circumference;

  return (
    <Card variant="overlay" padding="md" className="relative overflow-hidden" glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600" />

      <div className="flex flex-col items-center gap-6">
        {/* Header */}
        <p className="text-sm font-medium uppercase tracking-wider text-warm-500">
          Game Strength
        </p>

        {/* Composite ring */}
        <m.div
          className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, ease: 'easeOut' })}
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
            <m.circle
              cx="70"
              cy="70"
              r="54"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={getRingColor(displayComposite)}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 1, ease: 'easeOut', delay: 0.2 })}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-display font-light tabular-nums tracking-[-0.025em] leading-none', getRatingColor(displayComposite))}>
              {Math.round(displayComposite)}
            </span>
            <span className="mt-0.5 text-eyebrow font-medium uppercase tracking-wider text-warm-400">
              / 100
            </span>
          </div>
        </m.div>

        {/* Trend indicator */}
        {resolvedTrend && (
          <m.div
            className={cn('flex items-center gap-1.5 text-sm font-medium', trendConfig[resolvedTrend.direction].color)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.6 })}
          >
            {(() => {
              const TrendIcon = trendConfig[resolvedTrend.direction].icon;
              return <TrendIcon size={16} />;
            })()}
            <span>
              {trendConfig[resolvedTrend.direction].label}{' '}
              <span className="tabular-nums">
                {Number(resolvedTrend.delta ?? 0) > 0 ? '+' : ''}{Number(resolvedTrend.delta ?? 0).toFixed(1)}
              </span>{' '}
              over 30 days
            </span>
          </m.div>
        )}

        {/* Category bars */}
        <div className="w-full space-y-3">
          {(Object.entries(displayCategories) as [keyof typeof displayCategories, number][])
            .filter(([key]) => key in categoryLabels)
            .map(([key, value], i) => (
              <div
                key={key}
                className="flex items-center gap-3"
              >
                <span className="text-sm font-medium text-warm-700 w-24 shrink-0">
                  {categoryLabels[key]}
                </span>
                <div className={cn('flex-1 h-2.5 rounded-full overflow-clip', getBarBgColor(value))}>
                  <m.div
                    className={cn('h-full rounded-full', getBarColor(value))}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.6, delay: 0.1 + i * 0.04, ease: [0.25, 0.1, 0.25, 1] })}
                  />
                </div>
                <span className="text-sm font-medium text-warm-900 tabular-nums w-8 text-right">
                  {Math.round(value)}
                </span>
                {resolvedPercentiles?.[key] && (
                  <span className="text-xs text-warm-400 tabular-nums w-16 text-right">
                    {resolvedPercentiles[key].team}th %ile
                  </span>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

// Memoized export — prevents unnecessary re-animation of the SVG ring when
// the parent dashboard re-renders but the rating data is unchanged.
export const CompositeRatingCard = memo(CompositeRatingCardImpl);
