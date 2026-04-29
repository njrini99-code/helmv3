'use client';

/**
 * PlayerEffectivenessCard — the player-facing equivalent of the coach
 * `/dashboard/analytics/coachhelm` rollup. Renders a compact "Your CoachHelm
 * Impact" panel showing strokes saved per round, improvement ratio, and the
 * top 3 resolved insights over the last 90 days.
 *
 * Data is fetched server-side via `getPlayerEffectiveness` and passed in as
 * the `summary` prop — the parent page (consumer) handles the fetch.
 */

import { memo } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconTrendingDown,
  IconCheckCircle2,
  IconTarget,
} from '@/components/icons';
import type { PlayerEffectivenessSummary } from '@/app/golf/actions/player-effectiveness';

interface PlayerEffectivenessCardProps {
  summary: PlayerEffectivenessSummary;
  className?: string;
}

// Small per-category icon mapping. Falls back to IconTarget. Keeping this
// table-local instead of pulling from a shared registry — the categories on
// `golf_coach_insights.category` are free-form strings and we only need a
// hint, not a strict mapping.
function categoryIcon(category: string) {
  const key = category.toLowerCase();
  if (key.includes('putt')) return IconTarget;
  if (key.includes('approach')) return IconTarget;
  if (key.includes('tee') || key.includes('driving')) return IconTrendingDown;
  if (key.includes('short') || key.includes('scramble')) return IconCheckCircle2;
  return IconSparkles;
}

function PlayerEffectivenessCardImpl({
  summary,
  className,
}: PlayerEffectivenessCardProps) {
  const {
    resolvedCount,
    improvedCount,
    totalStrokesSavedPerRound,
    topResolvedInsights,
    windowDays,
  } = summary;

  const isEmpty = resolvedCount === 0;
  const improvementRatio = resolvedCount > 0 ? improvedCount / resolvedCount : 0;
  const improvementPct = Math.round(improvementRatio * 100);
  const strokesSavedDisplay = Math.abs(totalStrokesSavedPerRound).toFixed(1);

  return (
    <GlassCard className={cn('relative overflow-hidden', className)} glow="subtle">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
          <IconSparkles size={16} className="text-primary-600" />
        </div>
        <h3 className="text-sm font-medium uppercase tracking-wider text-warm-500">
          Your CoachHelm Impact
        </h3>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center">
            <IconTarget size={24} className="text-warm-400" />
          </div>
          <p className="text-sm text-warm-600 max-w-xs">
            Track 5 more rounds and CoachHelm will start measuring your improvement
            here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Big number */}
          <m.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <span className="text-[44px] md:text-[52px] font-light tabular-nums tracking-[-0.025em] leading-none text-primary-600">
              {strokesSavedDisplay}
            </span>
            <span className="mt-2 text-xs text-warm-500 text-center">
              strokes saved per round, last {windowDays} days
            </span>
          </m.div>

          {/* Improvement ratio */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-warm-600">
              <span className="font-medium">Resolved with improvement</span>
              <span className="tabular-nums font-medium text-warm-900">
                {improvedCount} / {resolvedCount}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-warm-100 overflow-clip">
              <m.div
                className="h-full rounded-full bg-primary-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.max(improvementPct, 0), 100)}%` }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              />
            </div>
          </div>

          {/* Top resolved insights */}
          {topResolvedInsights.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-warm-100">
              <p className="text-[11px] font-medium uppercase tracking-wider text-warm-400">
                Biggest wins
              </p>
              <ul className="flex flex-col gap-1.5">
                {topResolvedInsights.map((insight) => {
                  const Icon = categoryIcon(insight.category);
                  const abs = Math.abs(insight.strokeImpactPerRound);
                  return (
                    <li
                      key={insight.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/40 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-md bg-primary-50 flex items-center justify-center shrink-0">
                        <Icon size={14} className="text-primary-600" />
                      </div>
                      <span className="text-sm text-warm-800 flex-1 truncate">
                        {insight.title}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-primary-600 shrink-0">
                        -{abs.toFixed(1)} strokes
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// Memoized — parent dashboards re-render frequently as other tiles stream in;
// the summary prop is referentially stable per server-fetch so we avoid
// re-running the framer animations on unrelated parent updates.
export const PlayerEffectivenessCard = memo(PlayerEffectivenessCardImpl);
