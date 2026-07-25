'use client';

/**
 * ============================================================================
 * CategoryInsightStrip — "WHAT COACHHELM SEES" band for one stat category
 * ----------------------------------------------------------------------------
 * A compact, premium strip meant for the TOP of a single stat drill
 * (Putting/Driving/Approach/Short Game/Scoring — one category per mount):
 * an eyebrow, up to 2 mined-pattern insights for THAT category (title +
 * strokeImpact chip + a one-line recommendation), and an inline mini trend
 * (Sparkline) with a delta chip when a series exists for the category.
 *
 * Pure presentation — every prop comes straight off `buildStatsViewModel`'s
 * view model (`buildCategoryInsights(...)`.<category>` for `insights`,
 * `buildCategoryTrends(...).{category}` for `series`/`delta`/`trendLabel`).
 * This component does not fetch, does not categorize, does not know about
 * `golf_patterns_v2` — it only renders what it's handed.
 *
 * HONEST EMPTY STATE: when there is neither an insight NOR a usable trend
 * series, the strip renders NOTHING (`null`) rather than a tall empty box —
 * short game / strokes-gained genuinely have no server-side trend series
 * anywhere in the codebase today, and a cold-start player may have zero
 * mined patterns for a category yet; both are honest, common states.
 *
 * Motion: gates its OWN `initial` prop on `useReducedMotionGuard()` (not raw
 * `useReducedMotion`), per the v3 motion contract — reduced-motion users see
 * the strip in its final state immediately, never a suppressed-but-still-
 * animating one. Renders via `m.*` (framer-motion `LazyMotion` is already
 * mounted at the `/golf/dashboard` shell layer — see FairwayDashboardShell).
 * ========================================================================== */

import { m } from 'framer-motion';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useReducedMotionGuard, enterTransition, stagger } from '@/lib/coachhelm/v3/motion';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import { TrendChip, type GoodDirection } from '@/components/fairway/charts/TrendChip';
import type { SpineLedgerRow } from '@/components/fairway/modules';

/** One "what CoachHelm sees" row — matches `CategoryInsight` from
 *  `buildStatsViewModel.ts` structurally (kept as a local, narrower type so
 *  this component has no import-time dependency on the view-model module). */
export interface CategoryInsightStripInsight {
  /** The pattern's cause (or an honest pattern-type fallback). */
  title: string;
  /** Signed strokes/round — negative renders as a leak, positive a strength. */
  strokeImpact: number;
  recommendation?: string | null;
}

export interface CategoryInsightStripProps {
  /** Up to `max` are rendered (default 2); pass the already-ranked array from
   *  `buildCategoryInsights(...)[category]` — this component never re-sorts. */
  insights?: ReadonlyArray<CategoryInsightStripInsight>;
  /** Cap on rendered insight rows. Default 2. */
  max?: number;
  /** Optional trend series, oldest → newest (from `buildCategoryTrends(...)
   *  [category]?.series`). Fewer than 2 finite points reads as "no series"
   *  (Sparkline's own honesty contract — never a fabricated flat line). */
  series?: ReadonlyArray<number> | null;
  /** Direction-aware delta chip (from `buildCategoryTrends(...)[category]?.delta`). */
  delta?: NonNullable<SpineLedgerRow['delta']>;
  /** What the trend series represents (e.g. "Fairways hit") — feeds the
   *  Sparkline's sr-only summary and the delta chip's implicit context. */
  trendLabel?: string;
  /** Which raw direction of the series is GOOD — mirrors Sparkline's own
   *  prop. Defaults to `'up'`. */
  goodDirection?: GoodDirection;
  className?: string;
}

export function CategoryInsightStrip({
  insights = [],
  max = 2,
  series,
  delta,
  trendLabel,
  goodDirection = 'up',
  className,
}: CategoryInsightStripProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const rows = insights.slice(0, max);
  const finiteSeries = (series ?? []).filter((v): v is number => Number.isFinite(v));
  const hasSeries = finiteSeries.length >= 2;

  // Honest empty state — no pattern AND no series → render nothing, never a
  // tall empty box.
  if (rows.length === 0 && !hasSeries) return null;

  return (
    <m.div
      data-slot="category-insight-strip"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={enterTransition}
      className={cn(
        // overflow-clip: containment safety net for the header row below.
        'overflow-clip rounded-card border border-border-subtle bg-surface p-4',
        className,
      )}
    >
      {/* `flex-wrap` (+ `gap-y`) is the real fix: the eyebrow and the
          sparkline+chip group are both `whitespace-nowrap`/`shrink-0`, so on
          a narrow card (390px) with a long delta label they could outgrow
          the row's width. Wrapping to a second line keeps every character
          on screen and legible instead of clipping or scrolling. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
          What CoachHelm sees
        </span>
        {hasSeries ? (
          // `ml-auto`: on the common (single-line) width this is a no-op
          // next to `justify-between`, but when the row wraps (verified at
          // 390px — the eyebrow + sparkline + chip genuinely don't fit on
          // one line), it keeps this group pinned to the right on its own
          // line instead of falling back to flex-start, so the wrap reads
          // as an intentional second row rather than a stray left dangle.
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Sparkline
              data={finiteSeries}
              goodDirection={goodDirection}
              label={trendLabel}
              width={56}
              height={18}
            />
            {delta ? (
              <TrendChip
                direction={delta.direction === 'flat' ? 'flat' : delta.good ? 'improving' : 'declining'}
                label={delta.text}
                size="sm"
                numeric
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className={cn('grid gap-3', hasSeries ? 'mt-3' : 'mt-2', rows.length > 1 && 'sm:grid-cols-2')}>
          {rows.map((insight, i) => {
            const isLeak = insight.strokeImpact < 0;
            const magnitude = Math.abs(insight.strokeImpact).toFixed(1);
            return (
              <m.div
                key={`${insight.title}-${i}`}
                data-slot="category-insight-row"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...enterTransition, delay: stagger(i) }}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-fw-mono text-eyebrow font-semibold tabular-nums',
                      isLeak ? 'bg-fw-warning-bg text-fw-warning-ink' : 'bg-fw-success-bg text-fw-success-ink',
                    )}
                  >
                    {isLeak ? (
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    )}
                    {isLeak ? `−${magnitude}` : `+${magnitude}`}
                  </span>
                  <p className="min-w-0 flex-1 font-fw-sans text-body-sm leading-snug text-text-primary">
                    {insight.title}
                  </p>
                </div>
                {insight.recommendation ? (
                  <p
                    className="truncate font-fw-sans text-caption leading-snug text-text-tertiary"
                    title={insight.recommendation}
                  >
                    <span className="font-medium text-text-secondary">Fix · </span>
                    {insight.recommendation}
                  </p>
                ) : null}
              </m.div>
            );
          })}
        </div>
      ) : null}
    </m.div>
  );
}
