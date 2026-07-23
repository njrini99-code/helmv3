'use client';

/**
 * ============================================================================
 * RoundSGSummary — the round-level Strokes Gained headline (Wave D)
 * ----------------------------------------------------------------------------
 * Nick's "cooler metric" ask: the ONE number that makes Round Review read as
 * accurate golf analytics, not a generic scorecard. Pure presentation over
 * the round's already-cached `golf_rounds.strokes_gained_{total,tee,
 * approach,around_green,putting}` columns (populated by the DB's
 * `recalculate_round_strokes_gained()` / `sg_expected_strokes()` — no SG math
 * happens in this file, only formatting + honest-empty handling).
 *
 * Three layers, composed in an `InstrumentCluster` to match the stats-tab
 * instrument look (spine-stage drills are the quality bar):
 *
 *   1. SG TOTAL as the hero instrument reading (`primary`) — signed, colored
 *      (helm green = gain, warm amber = loss), animated via `AnimatedNumber`
 *      (@number-flow), tabular-nums — with a small honest baseline caption
 *      naming which curve the number is measured against.
 *   2. SG BY CATEGORY (`secondary`) via the flagship `StrokesGainedTornado` —
 *      reused verbatim, the same chart `TeamStatsBoard.tsx`'s team-level SG
 *      card already ships, never reinvented here.
 *   3. A one-line plain-language takeaway naming the round's biggest gain and
 *      biggest leak category, shown under the hero number AND fed into the
 *      tornado's `aria-label` takeaway.
 *
 * HONESTY (non-negotiable per the wave brief): every branch is null-safe.
 * `strokesGainedTotal === null` (a round that predates SG caching, or hasn't
 * been recomputed yet) renders `Readout`'s `state="awaiting"` — an honest dim
 * gauge, never a fabricated 0.00. Each category bar is included ONLY when
 * its OWN column is a finite number, independent of whether the total or
 * sibling categories are present — a partially-populated round never gets a
 * value invented for the gap.
 *
 * Baseline label mirrors `TeamStatsBoard.tsx`'s `tourLabel()` convention
 * (`isWomens` → "LPGA Tour", else "PGA Tour") — the SAME per-team-gender
 * curve `sg_expected_strokes()` actually used to compute the cached value,
 * so the caption never misstates a women's-team round as "vs PGA Tour".
 *
 * Reduced-motion safe: `AnimatedNumber` already gates its mount-roll on
 * `useReducedMotion` (snaps to the final value, no 0→value spin);
 * `StrokesGainedTornado` has no framer-motion of its own (plain SVG geometry,
 * no draw-in animation) — nothing else here needs gating.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  StrokesGainedTornado,
  formatSigned,
  type SGCategory,
} from '@/components/fairway';

export interface RoundSGCategoryInputs {
  /** `golf_rounds.strokes_gained_tee`. */
  strokesGainedTee: number | null;
  /** `golf_rounds.strokes_gained_approach`. */
  strokesGainedApproach: number | null;
  /** `golf_rounds.strokes_gained_around_green`. */
  strokesGainedAroundGreen: number | null;
  /** `golf_rounds.strokes_gained_putting`. */
  strokesGainedPutting: number | null;
}

export interface RoundSGSummaryProps extends RoundSGCategoryInputs {
  /** `golf_rounds.strokes_gained_total`. `null` when the round predates SG
   *  caching or hasn't been recomputed yet — renders the honest awaiting
   *  gauge instead of a fabricated 0. */
  strokesGainedTotal: number | null;
  /** True when the player's team is women's — swaps the baseline caption
   *  from "PGA Tour" to "LPGA Tour" (the actual curve
   *  `sg_expected_strokes()` used for this round). Defaults to `false`
   *  (men's / unknown — matches every other PGA/LPGA label call site's
   *  default, e.g. `pgaReferenceLabel`/`tourLabel`). */
  isWomens?: boolean;
  className?: string;
}

const CATEGORY_ORDER: ReadonlyArray<{ key: keyof RoundSGCategoryInputs; label: string }> = [
  { key: 'strokesGainedTee', label: 'Off the Tee' },
  { key: 'strokesGainedApproach', label: 'Approach' },
  { key: 'strokesGainedAroundGreen', label: 'Around the Green' },
  { key: 'strokesGainedPutting', label: 'Putting' },
];

/**
 * Builds the `StrokesGainedTornado` data array from the round's cached
 * per-category columns — each category included ONLY when its own value is
 * a finite number (never a fabricated 0 for a null/uncomputed category,
 * independent of whether sibling categories or the total are present).
 */
export function buildSGCategoryData(input: RoundSGCategoryInputs): SGCategory[] {
  const data: SGCategory[] = [];
  for (const { key, label } of CATEGORY_ORDER) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      data.push({ label, value });
    }
  }
  return data;
}

/** "PGA Tour" / "LPGA Tour" — mirrors `TeamStatsBoard.tsx`'s `tourLabel()`
 *  so the same round's baseline reads identically everywhere it's labeled. */
export function sgTourLabel(isWomens?: boolean): string {
  return isWomens ? 'LPGA Tour' : 'PGA Tour';
}

/**
 * One-line plain-language takeaway naming the round's best (most strokes
 * gained) and worst (most strokes lost) category. `null` when there's
 * nothing to compare (no categories computed yet). A single available
 * category reads as its own sentence rather than a degenerate
 * "Best: X · Worst: X"; all-tied categories (every category landing on the
 * exact same value — astronomically unlikely with real float sums, but
 * never claim a "Best"/"Worst" split that isn't actually distinct) collapse
 * to the same flat-statement form.
 */
export function buildSGTakeaway(categories: SGCategory[]): string | null {
  if (categories.length === 0) return null;
  const best = categories.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = categories.reduce((a, b) => (b.value < a.value ? b : a));
  if (categories.length === 1 || best.label === worst.label) {
    return `${best.label} is ${formatSigned(best.value)} vs the baseline this round.`;
  }
  return `Best: ${best.label.toLowerCase()} ${formatSigned(best.value)} · Worst: ${worst.label.toLowerCase()} ${formatSigned(worst.value)}`;
}

/** Signed prefix + color tone for the hero readout — mirrors `Readout`'s own
 *  `DeltaLine` sign/direction convention (rounding-safe: a value that ROUNDS
 *  to 0.00 at 2 decimals never carries a stray +/− sign or gets painted as a
 *  false gain/loss, matching `formatSigned`'s own zero-rounding guard). */
function heroSignTone(value: number): { sign: '' | '+' | '−'; tone: 'gain' | 'loss' | 'even' } {
  const rounded = Number(Math.abs(value).toFixed(2));
  if (rounded === 0) return { sign: '', tone: 'even' };
  return value > 0 ? { sign: '+', tone: 'gain' } : { sign: '−', tone: 'loss' };
}

const TONE_CLASS: Record<'gain' | 'loss' | 'even', string> = {
  gain: 'text-fw-success',
  loss: 'text-fw-warning',
  even: 'text-text-primary',
};

/** Hero digit size for the SG-total readout — the same outside-the-9-step-
 *  scale precedent `Readout.tsx`'s own `SIZE_VALUE.hero` (`text-[72px]`)
 *  already establishes for a cockpit instrument numeral (not prose, so the
 *  canonical text-display/h1/h2/... scale doesn't apply). Kept in a module
 *  constant rather than inline in the JSX className, matching how
 *  `Readout.tsx` stores its own size steps in a lookup object. */
const HERO_VALUE_CLASS = 'text-[64px] leading-[68px]';

/**
 * The round-level Strokes Gained headline panel. Drop-in composable — mount
 * near the top of Round Review (before/above the hole filmstrip) so the
 * reader sees the accuracy-forward headline before the hole-by-hole detail.
 */
export function RoundSGSummary({
  strokesGainedTotal,
  strokesGainedTee,
  strokesGainedApproach,
  strokesGainedAroundGreen,
  strokesGainedPutting,
  isWomens = false,
  className,
}: RoundSGSummaryProps) {
  const categories = buildSGCategoryData({
    strokesGainedTee,
    strokesGainedApproach,
    strokesGainedAroundGreen,
    strokesGainedPutting,
  });
  const takeaway = buildSGTakeaway(categories);
  const tour = sgTourLabel(isWomens);
  const hasBaseline = strokesGainedTotal !== null || categories.length > 0;
  const { sign: heroSign, tone: heroTone } =
    strokesGainedTotal !== null ? heroSignTone(strokesGainedTotal) : { sign: '' as const, tone: 'even' as const };

  const heroPanel = (
    <InstrumentPanel
      depth="raised"
      tone="accent"
      eyebrow="Strokes Gained"
      header="This round"
      className="flex h-full flex-col gap-4"
    >
      {strokesGainedTotal !== null ? (
        <div className="flex flex-col gap-1">
          <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Total
          </span>
          <div className="flex items-baseline gap-2">
            <AnimatedNumber
              value={Math.abs(strokesGainedTotal)}
              decimals={2}
              prefix={heroSign}
              className={cn(
                'font-fw-mono font-semibold tabular-nums',
                HERO_VALUE_CLASS,
                TONE_CLASS[heroTone],
              )}
            />
            <span className="font-fw-mono text-body-lg font-medium uppercase tracking-wide text-text-tertiary">
              sg
            </span>
          </div>
        </div>
      ) : (
        <Readout
          label="Total"
          size="hero"
          state="awaiting"
          awaitingLabel="Not computed for this round"
        />
      )}

      {hasBaseline ? (
        <p className="font-fw-sans text-caption text-text-tertiary">
          vs the {tour} baseline used for this round
        </p>
      ) : null}

      {takeaway ? (
        <p className="border-t border-border-subtle pt-3 font-fw-sans text-body-sm text-text-secondary">
          {takeaway}
        </p>
      ) : null}
    </InstrumentPanel>
  );

  const categoryChart = (
    <StrokesGainedTornado
      overline="Strokes Gained"
      title="By category"
      subtitle={`vs ${tour} baseline`}
      takeaway={takeaway ?? undefined}
      data={categories}
      state={categories.length > 0 ? undefined : 'insufficient-data'}
      stateMessage={
        categories.length > 0 ? undefined : "Strokes Gained isn't computed for this round yet."
      }
    />
  );

  return (
    <div data-slot="round-sg-summary" className={cn('min-w-0', className)}>
      <InstrumentCluster
        ariaLabel="Round Strokes Gained summary"
        primary={heroPanel}
        secondary={[categoryChart]}
      />
    </div>
  );
}
