'use client';

import Link from 'next/link';
import { ArrowRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricCard, Surface } from '@/components/fairway';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import type { FairwayPlayerStatsSummary } from '@/lib/fairway/player-stats-summary';
import { formatSgTotal } from '@/lib/fairway/player-stats-summary';
import { MotionDiv, useStatsMotion } from '@/components/fairway/pages/stats/fairway-stats-motion';
import { StatsStaggerGrid, StatsStaggerItem } from '@/components/fairway/pages/stats/StatsSection';

const TREND_COPY: Record<NonNullable<FairwayPlayerStatsSummary['trend']>, { label: string; tone: string }> = {
  improving: { label: 'Trending better', tone: 'text-fw-success bg-fw-success-bg' },
  declining: { label: 'Needs attention', tone: 'text-fw-warning bg-fw-warning-bg' },
  stable: { label: 'Holding steady', tone: 'text-text-secondary bg-surface-sunken' },
};

export interface FairwayPlayerStatsTeaserProps {
  playerId: string;
  playerName: string;
  summary: FairwayPlayerStatsSummary | null;
  className?: string;
}

/**
 * Roster performance glance — one confident read before the full cockpit.
 * Data from `golf_player_stats_cache`; never fabricates zeros.
 */
export function FairwayPlayerStatsTeaser({
  playerId,
  playerName,
  summary,
  className,
}: FairwayPlayerStatsTeaserProps) {
  const motion = useStatsMotion();
  const statsHref = coachHelmRoutes.playerStats(playerId);
  const hasRounds = (summary?.rounds_played ?? 0) > 0;

  if (!summary || !hasRounds) {
    return (
      <MotionDiv {...motion.section} className={className}>
        <Surface
          elevation="shadow"
          padding="lg"
          className="border border-dashed border-border-subtle bg-surface-sunken/40"
        >
          <div className="flex flex-col items-center gap-4 py-4 text-center sm:flex-row sm:text-left">
            <div className="min-w-0 flex-1">
              <p className="font-fw-display text-h3 font-medium text-text-primary">No rounds yet</p>
              <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
                When {playerName.split(' ')[0] ?? 'this player'} logs completed rounds, their scoring average,
                strokes gained, and leak maps appear here — and in the full stats cockpit.
              </p>
            </div>
            <Link
              href={statsHref}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 py-2',
                'font-fw-sans text-label font-medium text-text-primary',
                'transition-colors hover:border-accent-600/30 hover:bg-accent-600/5',
                'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2',
              )}
            >
              Open stats
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Surface>
      </MotionDiv>
    );
  }

  const sg = summary.sg_total;
  const sgPositive = sg != null && sg > 0;
  const sgNegative = sg != null && sg < 0;
  const trend = summary.trend ? TREND_COPY[summary.trend] : null;

  return (
    <MotionDiv {...motion.section} className={className}>
      <Link
        href={statsHref}
        className={cn(
          'group block rounded-2xl outline-none',
          'focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        )}
      >
        <Surface
          elevation="shadow"
          padding="none"
          className={cn(
            'overflow-hidden border-l-[3px] border-l-accent-600',
            'bg-gradient-to-br from-accent-600/10 via-surface to-surface',
            'transition-shadow duration-300 group-hover:shadow-card-hover',
          )}
        >
          <div className="flex flex-col gap-6 p-5 sm:p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-accent-800">
                  Performance
                </p>
                <h2 className="mt-1 font-fw-display text-h2 font-semibold tracking-[-0.02em] text-text-primary">
                  At a glance
                </h2>
                <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
                  {summary.rounds_played} round{summary.rounds_played !== 1 ? 's' : ''} tracked · tap for the full cockpit
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                {sg != null ? (
                  <div className="text-right">
                    <p className="font-fw-sans text-caption font-medium uppercase tracking-wide text-text-tertiary">
                      SG: Total
                    </p>
                    <p
                      className={cn(
                        'font-fw-mono text-h1 font-semibold tabular-nums leading-none tracking-tight',
                        sgPositive ? 'text-fw-success' : sgNegative ? 'text-fw-warning' : 'text-text-primary',
                      )}
                    >
                      {formatSgTotal(sg)}
                    </p>
                    <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">vs Tour benchmark</p>
                  </div>
                ) : null}
                {trend ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-fw-sans text-caption font-medium',
                      trend.tone,
                    )}
                  >
                    {summary.trend === 'improving' ? (
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                    ) : summary.trend === 'declining' ? (
                      <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {trend.label}
                  </span>
                ) : null}
              </div>
            </div>

            <StatsStaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {summary.scoring_average != null ? (
                <StatsStaggerItem>
                  <MetricCard
                    label="Scoring avg"
                    value={summary.scoring_average}
                    decimals={1}
                    goodDirection="down"
                    density="compact"
                  />
                </StatsStaggerItem>
              ) : null}
              {summary.gir_pct != null ? (
                <StatsStaggerItem>
                  <MetricCard
                    label="GIR"
                    value={summary.gir_pct}
                    suffix="%"
                    decimals={0}
                    density="compact"
                  />
                </StatsStaggerItem>
              ) : null}
              {summary.fairway_pct != null ? (
                <StatsStaggerItem>
                  <MetricCard
                    label="Fairways"
                    value={summary.fairway_pct}
                    suffix="%"
                    decimals={0}
                    density="compact"
                  />
                </StatsStaggerItem>
              ) : null}
              {summary.putts_per_round != null ? (
                <StatsStaggerItem>
                  <MetricCard
                    label="Putts / round"
                    value={summary.putts_per_round}
                    decimals={1}
                    goodDirection="down"
                    density="compact"
                  />
                </StatsStaggerItem>
              ) : null}
            </StatsStaggerGrid>

            <div className="flex items-center justify-between gap-3 border-t border-border-subtle/80 pt-4">
              <p className="font-fw-sans text-body-sm text-text-tertiary">
                Leak maps · 10 categories · round-by-round trends
              </p>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 font-fw-sans text-label font-semibold text-accent-700',
                  'transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none',
                )}
              >
                Full stats
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </div>
          </div>
        </Surface>
      </Link>
    </MotionDiv>
  );
}
