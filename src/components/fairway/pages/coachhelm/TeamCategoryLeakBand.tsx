'use client';

/**
 * ============================================================================
 * TeamCategoryLeakBand — "where the team is bleeding strokes", team-wide
 * ----------------------------------------------------------------------------
 * `getTeamCategoryInsights` computes a rich per-category rollup (driving /
 * approach / short game / putting / scoring: team avg, trend, per-player
 * breakdown, up-to-3 insights each with `strokesSavedPerRound`) plus a 0-100
 * `teamHealth` score on EVERY /dashboard/intelligence load — and until now it
 * was fetched and thrown away (only `overview.data.playerCount` was ever
 * read). This band is the "rebuilt equivalent" of the orphaned
 * `golf/coachhelm/coach/LeakBoard.tsx` for THIS richer shape: LeakBoard groups
 * a flat list of live signal insights by category (a good "what's open right
 * now" summary), but has no way to carry a team AVERAGE, a category TREND, a
 * ranked per-player worst-offender list, or the team-health DIAL — those only
 * exist on `TeamCategory[]`, so rather than force LeakBoard's shape to fit,
 * this is a fresh, decoupled presentation component over the actual data.
 *
 * Every category card carries at least two visual channels (a trend glyph +
 * an attention-share bar), never text-only, per the CoachHelm design bar.
 * Honest degrade: a category with zero players scored (`players.length===0`)
 * shows "Awaiting rounds" instead of a fabricated 0%; the band itself renders
 * nothing when the fetch failed or the team genuinely has no categories yet
 * (CoachIntelligenceHome's own onboarding gate already covers a truly empty
 * roster before this ever mounts).
 * ========================================================================== */

import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/fairway/controls/badge';
import { Surface } from '@/components/fairway/surfaces/surface';
import { TrendGlyph } from '@/components/fairway/charts/TrendChip';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { RingGauge } from '@/components/fairway/modules/RingGauge';
import type { TeamCategory } from '@/app/golf/actions/team-category-insights';
import { enterTransition, stagger, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

export interface TeamCategoryLeakBandProps {
  categories: TeamCategory[];
  teamHealth: number;
  className?: string;
}

function CategoryCard({ category, index }: { category: TeamCategory; index: number }) {
  const prefersReducedMotion = useReducedMotionGuard();
  const scored = category.players.length;
  const hasData = scored > 0;

  // Worst-first: `players` is already sorted best→worst by the source
  // action, so reversing + filtering to the flagged (>1 stddev off-average)
  // subset keeps the truly worst offenders on top, capped to 2 so the card
  // stays dense rather than dumping the full roster.
  const worstOffenders = [...category.players].reverse().filter((p) => p.needsAttention).slice(0, 2);

  const strokesChips = category.insights
    .filter((insight): insight is typeof insight & { strokesSavedPerRound: number } =>
      typeof insight.strokesSavedPerRound === 'number' && insight.strokesSavedPerRound > 0,
    )
    .slice(0, 2);

  const hiddenState = prefersReducedMotion
    ? (false as const)
    : { opacity: 0, y: 8 };

  return (
    <m.div
      initial={hiddenState}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...enterTransition, delay: stagger(index) }}
    >
      <Surface padding="md" className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-fw-display text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {category.label}
          </p>
          <TrendGlyph direction={category.trend} className="shrink-0 text-caption" />
        </div>

        <p className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">
          {category.teamAvgLabel}
        </p>

        {hasData ? (
          <div className="flex flex-col gap-1.5">
            {/* N-of-`scored` discrete ticks, not a continuous % fill — a
                percentage-shaped bar under a percentage-shaped headline stat
                (e.g. "63% FW") reads as filling to THAT number, not to the
                attention fraction below it. Quantized ticks can't be
                misread that way. */}
            <div aria-hidden="true" className="flex items-center gap-[3px]">
              {Array.from({ length: scored }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 min-w-[3px] flex-1 rounded-sm',
                    i < category.attentionCount ? 'bg-fw-warning' : 'bg-surface-sunken',
                  )}
                />
              ))}
            </div>
            <Badge tone={category.attentionCount > 0 ? 'warning' : 'success'} size="sm" numeric>
              {category.attentionCount > 0
                ? `${category.attentionCount} of ${scored} need work`
                : `${scored} of ${scored} on track`}
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden />
            <Badge tone="neutral" size="sm">
              Awaiting rounds
            </Badge>
          </div>
        )}

        {worstOffenders.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
            {worstOffenders.map((p) => (
              <div
                key={p.playerId}
                className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-caption"
              >
                <span className="min-w-0 truncate text-text-secondary" title={p.playerName}>
                  {p.playerName}
                </span>
                <TrendGlyph
                  direction={p.trend}
                  magnitude={p.trendDelta}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        ) : null}

        {strokesChips.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {strokesChips.map((insight) => (
              <Badge
                key={insight.id}
                tone="accent"
                size="sm"
                numeric
                className="h-auto max-w-full whitespace-normal break-words py-1 text-left leading-snug"
              >
                +{insight.strokesSavedPerRound.toFixed(1)} str/rd available
              </Badge>
            ))}
          </div>
        ) : null}
      </Surface>
    </m.div>
  );
}

export function TeamCategoryLeakBand({ categories, teamHealth, className }: TeamCategoryLeakBandProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  if (categories.length === 0) return null;

  const hiddenState = prefersReducedMotion ? (false as const) : { opacity: 0, y: 8 };

  return (
    <m.div initial={hiddenState} animate={{ opacity: 1, y: 0 }} transition={enterTransition}>
      <InstrumentPanel
        depth="base"
        className={className}
        eyebrow="CoachHelm · team"
        header="Where the team is bleeding strokes"
        readout={
          <div className="flex items-center gap-2.5">
            <RingGauge value={teamHealth} size={44} />
            <div className="flex flex-col">
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">Team health</span>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((category, i) => (
            <CategoryCard key={category.id} category={category} index={i} />
          ))}
        </div>
      </InstrumentPanel>
    </m.div>
  );
}
