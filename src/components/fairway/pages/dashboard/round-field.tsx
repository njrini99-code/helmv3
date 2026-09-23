'use client';

/**
 * ============================================================================
 * RoundField: every round a player has logged, against their own average
 * ----------------------------------------------------------------------------
 * The stage instrument for player home. One bar per scored round: it rises
 * above the player's scoring average in amber and drops below it in green, so
 * the shape of a season reads in one pass and every individual round is still
 * a thing you can point at.
 *
 * PAGE-LOCAL BY DESIGN. Not in `modules/`, not in the barrel, not registered,
 * per IMPLEMENTING.md. It joins them when a second screen needs it AND the
 * lead agrees.
 *
 * WHY THE AVERAGE IS THE BASELINE AND NOT PAR. The only series long enough to
 * be a stage is `enhancedData.scoringTrend`, which carries every scored round
 * (`dashboard-data.ts:1192`, deliberately not sliced) but carries only a label
 * and a total. There is no par in it. `data.recentRounds` has `total_to_par`
 * but is five rows (`:1294`). Drawing a par baseline under the long series
 * would mean inventing a par, so the baseline is the player's own scoring
 * average, which the page already shows and which is the more useful reference
 * on a player's own home page anyway.
 *
 * Mechanics copied from `modules/ScoreField.tsx` rather than imported, for the
 * reason the development screen copied them: ScoreField is deliberately
 * single-purpose and bending it to a second host makes it a chart library.
 * Percentage geometry, no measurement pass, no SVG scaling, a stagger capped
 * at 16, `useReducedMotionGuard`.
 *
 * ONE COLUMN, NO SPLIT. Same finding as FocusField, same shell: the stage's
 * usable width does not rise with the viewport because the shell keeps a right
 * rail, so a split beside the instrument starves it. The readouts sit above on
 * phone and beside the header on desktop, never in a column that competes with
 * the plot for width.
 * ========================================================================== */

import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { StageRound, StageState } from './player-home-logic';

const DAY_MS = 86_400_000;
const STAGGER_STEP = 0.012;
const STAGGER_CAP = 16;
const HALF_HEIGHT_PX = 46;
const MIN_BAR_PX = 2;
function dayMs(date: string): number {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return Number.NaN;
  return Date.UTC(y, mo - 1, d);
}

/**
 * Where each round sits across the plot, 0 to 100.
 *
 * Ordinal spacing is inset by half a step at both ends so the first and last
 * bars are not half outside the box, which is the same clipping the
 * development stage had to fix at its rules.
 */
export function roundPositions(state: StageState): number[] {
  const n = state.rounds.length;
  if (n === 0) return [];
  if (n === 1) return [50];
  if (state.axis === 'date') {
    const days = state.rounds.map((r) => dayMs(r.date ?? ''));
    const start = Math.min(...days.filter(Number.isFinite));
    const end = Math.max(start + DAY_MS, ...days.filter(Number.isFinite));
    return days.map((d) =>
      Number.isFinite(d) ? Math.min(100, Math.max(0, ((d - start) / (end - start)) * 100)) : 0,
    );
  }
  const step = 100 / n;
  return state.rounds.map((_, i) => step / 2 + i * step);
}

/**
 * Strokes that reach a full-height bar: the player's own largest swing away
 * from their average, held between 3 and 12 so one blow-up round does not
 * flatten a whole season into a row of stubs.
 */
export function deviationCap(rounds: readonly StageRound[], average: number): number {
  let max = 0;
  for (const r of rounds) max = Math.max(max, Math.abs(r.score - average));
  return Math.min(12, Math.max(3, Math.ceil(max)));
}

export interface RoundFieldProps {
  state: StageState;
  /** The baseline. Without it the field draws marks and no tone. */
  scoringAverage: number | null;
  /** Called with the round the reader picked, when the host can route to it. */
  hrefFor?: (round: StageRound) => string | undefined;
  className?: string;
  ariaLabel?: string;
}

function Bar({
  round,
  x,
  average,
  cap,
  index,
  reduced,
  last,
}: {
  round: StageRound;
  x: number;
  average: number;
  cap: number;
  index: number;
  reduced: boolean;
  last: boolean;
}) {
  const deviation = round.score - average;
  const over = deviation > 0;
  const under = deviation < 0;
  const height =
    deviation === 0
      ? MIN_BAR_PX
      : Math.max(MIN_BAR_PX, Math.round((Math.abs(deviation) / cap) * HALF_HEIGHT_PX));

  return (
    <m.span
      aria-hidden="true"
      initial={reduced ? false : { scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{
        duration: DURATION.short,
        delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP,
        ease: EASE_CINEMATIC,
      }}
      style={{
        height,
        left: `${x}%`,
        transformOrigin: over ? 'bottom' : 'top',
        ...(over ? { bottom: '50%' } : under ? { top: '50%' } : { top: 'calc(50% - 1px)' }),
      }}
      className={cn(
        'absolute block -translate-x-1/2 rounded-full',
        last ? 'w-[5px]' : 'w-[3px]',
        over && 'bg-fw-warning',
        under && 'bg-accent-500',
        !over && !under && 'bg-text-tertiary',
      )}
    />
  );
}

export function RoundField({
  state,
  scoringAverage,
  hrefFor,
  className,
  ariaLabel = 'Your rounds against your scoring average',
}: RoundFieldProps) {
  const reduced = useReducedMotionGuard();
  const positions = useMemo(() => roundPositions(state), [state]);
  const average = scoringAverage;
  const cap = useMemo(
    () => (average == null ? 1 : deviationCap(state.rounds, average)),
    [state.rounds, average],
  );

  const first = state.rounds[0];
  const last = state.rounds[state.rounds.length - 1];

  return (
    <LazyMotion features={loadFeatures}>
      <div data-slot="round-field" className={cn('flex min-w-0 flex-col gap-1', className)}>
        <div
          role="img"
          aria-label={ariaLabel}
          className="relative h-[104px] min-w-0"
        >
          {/* The baseline IS the player's average, so it is labelled as one.
              An unlabelled centre rule would read as par, which it is not. */}
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />

          {average != null
            ? state.rounds.map((round, i) => {
                const x = positions[i] ?? 0;
                const href = hrefFor?.(round);
                const bar = (
                  <Bar
                    round={round}
                    x={x}
                    average={average}
                    cap={cap}
                    index={i}
                    reduced={reduced}
                    last={i === state.rounds.length - 1}
                  />
                );
                const label = `${round.label}: ${round.score}`;
                return href ? (
                  <a
                    key={round.key}
                    href={href}
                    title={label}
                    aria-label={label}
                    style={{ left: `${x}%` }}
                    className="absolute top-0 block h-full w-4 -translate-x-1/2 rounded-fw-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
                  >
                    {bar}
                  </a>
                ) : (
                  <span
                    key={round.key}
                    title={label}
                    style={{ left: `${x}%` }}
                    className="absolute top-0 block h-full w-4 -translate-x-1/2"
                  >
                    <span className="sr-only">{label}</span>
                    {bar}
                  </span>
                );
              })
            : null}

          {/* Without an average there is no baseline to measure against, so the
              field says so rather than drawing bars from a guessed centre. */}
          {average == null && state.rounds.length > 0 ? (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 bg-surface pr-2 font-fw-sans text-caption text-text-tertiary">
              Your average draws the line these are measured against.
            </span>
          ) : null}
        </div>

        {/* The axis names what x actually is. Ordinal until every round carries
            a real date, because "Sep 10" has no year and a time scale built
            from it would be invented. */}
        <div aria-hidden="true" className="relative h-4 min-w-0">
          {first ? (
            <span className="absolute left-0 top-0 font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-text-tertiary">
              {state.axis === 'date' ? first.label : 'Oldest'}
            </span>
          ) : null}
          {last && state.rounds.length > 1 ? (
            <span
              className="absolute right-0 top-0 font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-accent-700"
            >
              {state.axis === 'date' ? last.label : 'Newest'}
            </span>
          ) : null}
          {state.rounds.length > 1 ? (
            <span className="absolute left-1/2 top-0 -translate-x-1/2 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
              {state.rounds.length} rounds
            </span>
          ) : null}
        </div>

        {state.thinCaption ? (
          <p className="font-fw-sans text-caption text-text-tertiary">{state.thinCaption}</p>
        ) : null}
      </div>
    </LazyMotion>
  );
}
