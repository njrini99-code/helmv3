'use client';

/**
 * ============================================================================
 * TrendChip — categorical direction pill + the ONE shared trend classifier
 * ----------------------------------------------------------------------------
 * The §5.4 "consumes the ONE shared trend function" primitive. Two jobs:
 *
 *   1. `classifyTrend()` — the SINGLE source of trend math for the whole
 *      cluster (Sparkline color, StatTile chip, MetricCard delta all route
 *      through it so trends are classified ONE way, never divergently).
 *   2. <TrendChip>       — the categorical-direction pill (improving / flat /
 *      declining or a signed delta) backed by that classifier.
 *
 * THE HONESTY CONTRACT lives in the classifier:
 *   • AMBER, NOT RED, for the "bad" direction — red is reserved for true errors
 *     and the palette must stay warm (DESIGN-SYSTEM §5.3).
 *   • `goodDirection`-aware — golf is LOWER-IS-BETTER (scoring average, handicap,
 *     putts), so a falling number is GOOD. The caller declares which way is good;
 *     the classifier maps raw direction → improving/flat/declining semantics.
 *   • A `flat` band (deadzone) so tiny noise never reads as a confident trend.
 *
 * DeltaChip (charts/Numeric.tsx) stays for pure SIGNED-NUMBER deltas; TrendChip
 * is its categorical sibling and reuses the same arrow/color token language.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from './theme';
import {
  TREND_ARROW as CANONICAL_TREND_ARROW,
  TREND_TEXT_TONE as CANONICAL_TREND_TEXT_TONE,
  TREND_LABEL as CANONICAL_TREND_LABEL,
  type TrendVerdict as CanonicalTrendVerdict,
} from '@/lib/coachhelm/trend';

/* -------------------------------------------------------------------------- */
/* The ONE shared trend classifier (exported — others import this)            */
/* -------------------------------------------------------------------------- */

/** Which direction of the underlying number is the GOOD one. */
export type GoodDirection = 'up' | 'down';

/** The semantic verdict — what the trend MEANS for the player, not its sign. */
export type TrendDirection = 'improving' | 'flat' | 'declining';

export interface ClassifyTrendOptions {
  /**
   * Which way the raw number should move to be GOOD. Golf is mostly
   * lower-is-better (scoring, putts, handicap) → `'down'`; percentile / make-rate
   * style figures are higher-is-better → `'up'`. Defaults to `'up'`.
   */
  goodDirection?: GoodDirection;
  /**
   * Deadzone: |delta| at or below this reads as `flat` (kills noise). Expressed
   * in the same units as the values. Defaults to `0` (any change is a trend).
   */
  flatThreshold?: number;
}

/**
 * Classify a raw change into the cluster's ONE trend vocabulary.
 *
 * `delta` is `latest - previous` in the metric's own units. The verdict is
 * goodDirection-aware: a negative delta on a lower-is-better metric is
 * `improving`, a positive delta on the same metric is `declining`.
 *
 * @returns the semantic verdict (`improving` | `flat` | `declining`).
 */
export function classifyTrend(delta: number, options: ClassifyTrendOptions = {}): TrendDirection {
  const { goodDirection = 'up', flatThreshold = 0 } = options;

  if (!Number.isFinite(delta) || Math.abs(delta) <= Math.max(0, flatThreshold)) {
    return 'flat';
  }

  const rawRising = delta > 0;
  const isGood = goodDirection === 'up' ? rawRising : !rawRising;
  return isGood ? 'improving' : 'declining';
}

/**
 * Convenience: classify from a `previous → latest` pair (computes the delta).
 * Returns `'flat'` for non-finite inputs so an honest no-trend never reads as a
 * confident one.
 */
export function classifyTrendFromValues(
  previous: number,
  latest: number,
  options: ClassifyTrendOptions = {},
): TrendDirection {
  if (!Number.isFinite(previous) || !Number.isFinite(latest)) return 'flat';
  return classifyTrend(latest - previous, options);
}

/**
 * The CSS-var color a trend verdict maps to (amber for declining — NEVER the
 * danger red). Shared so Sparkline, TrendChip, and MetricCard all paint the
 * same trend the same hue.
 */
export const TREND_COLOR: Record<TrendDirection, string> = {
  improving: 'var(--fw-color-accent-500)', // helm green
  flat: 'var(--fw-color-text-tertiary)', // recessive warm neutral
  declining: 'var(--fw-color-warning)', // warm amber — NOT red
};

/** The arrow glyph for each verdict (direction is never color-only). */
export const TREND_ARROW: Record<TrendDirection, string> = {
  improving: '↑',
  flat: '→',
  declining: '↓',
};

/**
 * The HONEST arrow — points the way the RAW number actually moved, not the way
 * the verdict "feels". For a lower-is-better metric (golf scoring/putts/handicap,
 * `goodDirection: 'down'`) a *falling* number is `improving`, so the arrow must
 * point DOWN, not up: "↓ Improving" (green) reads correctly as "your average
 * came down — good", and a worsening round reads "↑ Declining" (amber) — the
 * number went up. The old verdict-keyed arrow drew a ↓ next to a rising average
 * (Nick, 07-24: "a declining score in golf is good lol"). For higher-is-better
 * metrics (the default) this is identical to the verdict arrow, so existing
 * call sites are unaffected.
 */
export function trendArrow(verdict: TrendDirection, goodDirection: GoodDirection): string {
  if (verdict === 'flat') return TREND_ARROW.flat;
  // improving+up OR declining+down ⇒ the raw number ROSE; otherwise it FELL.
  const rose = (verdict === 'improving') === (goodDirection === 'up');
  return rose ? '↑' : '↓';
}

/** Default human label for each verdict. */
const TREND_LABEL: Record<TrendDirection, string> = {
  improving: 'Improving',
  flat: 'Flat',
  declining: 'Declining',
};

/** Accessible verbalization for screen readers (never relies on the glyph). */
const TREND_SR: Record<TrendDirection, string> = {
  improving: 'Trend improving',
  flat: 'Trend flat',
  declining: 'Trend declining',
};

/* -------------------------------------------------------------------------- */
/* TrendChip                                                                   */
/* -------------------------------------------------------------------------- */

export interface TrendChipProps {
  /**
   * Either pass a pre-computed `direction`, OR pass `delta` (+ `goodDirection` /
   * `flatThreshold`) and let the chip classify via the shared fn. `direction`
   * wins if both are supplied.
   */
  direction?: TrendDirection;
  /** Raw change (`latest - previous`) — classified via the shared fn. */
  delta?: number;
  /** Which way is good (see classifyTrend). Defaults to `'up'`. */
  goodDirection?: GoodDirection;
  /** Deadzone for the `flat` band (see classifyTrend). */
  flatThreshold?: number;
  /**
   * Optional label override. When omitted, shows the verdict word
   * (Improving / Flat / Declining). Pass a string to show a signed magnitude
   * (e.g. "−0.4 strokes") instead — the verdict still drives the color + arrow.
   */
  label?: React.ReactNode;
  /** Hide the verbal label and show the arrow only (compact inline use). */
  iconOnly?: boolean;
  /** Render numeric labels with tabular figures (aligned columns). */
  numeric?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-5 px-1.5 text-eyebrow gap-0.5',
  md: 'h-6 px-2 text-caption gap-1',
};

const TONE: Record<TrendDirection, string> = {
  improving: 'bg-fw-success-bg text-fw-success',
  flat: 'bg-inset text-text-tertiary',
  declining: 'bg-fw-warning-bg text-fw-warning',
};

/**
 * A categorical trend pill backed by the cluster's ONE trend classifier. Color
 * is NEVER the only channel: the arrow glyph + the label (or sr-only verdict)
 * communicate direction for CVD users. Amber — never red — for `declining`.
 */
export const TrendChip = React.forwardRef<HTMLSpanElement, TrendChipProps>(function TrendChip(
  {
    direction,
    delta,
    goodDirection = 'up',
    flatThreshold = 0,
    label,
    iconOnly = false,
    numeric = false,
    size = 'md',
    className,
  },
  ref,
) {
  const verdict: TrendDirection =
    direction ??
    (typeof delta === 'number'
      ? classifyTrend(delta, { goodDirection, flatThreshold })
      : 'flat');

  const text = label ?? TREND_LABEL[verdict];

  return (
    <span
      ref={ref}
      data-slot="trend-chip"
      data-direction={verdict}
      style={numeric ? TABULAR_NUMS : undefined}
      className={cn(
        'inline-flex items-center rounded-full align-middle whitespace-nowrap',
        'font-fw-sans font-semibold leading-none tracking-normal normal-case',
        SIZE[size],
        TONE[verdict],
        numeric && 'font-fw-mono',
        className,
      )}
    >
      <span aria-hidden="true">{trendArrow(verdict, goodDirection)}</span>
      {iconOnly ? (
        <span className="sr-only">{TREND_SR[verdict]}</span>
      ) : (
        <span>{text}</span>
      )}
    </span>
  );
});

/* -------------------------------------------------------------------------- */
/* TrendGlyph — chrome-free rendering counterpart of the canonical            */
/* `@/lib/coachhelm/trend` verdict (#945)                                      */
/* -------------------------------------------------------------------------- */

export interface TrendGlyphProps {
  /**
   * The verdict from `classifyTrendDelta`/`computeSeriesTrend`
   * (`@/lib/coachhelm/trend`). The arrow is ALWAYS the performance
   * direction — up-ish for improving, down-ish for declining — never the raw
   * metric's own sign.
   */
  direction: CanonicalTrendVerdict;
  /**
   * Unsigned magnitude rendered after the verdict word (e.g. the "3.4" in
   * "Declining 3.4"). Always WITHOUT a +/− sign — this glyph communicates
   * direction via the arrow + verdict word; a raw SIGNED metric delta (e.g.
   * a cockpit readout's "−7.0") is a different concern the caller renders
   * itself. Ignored when `label` is passed, or when `direction` is
   * `'stable'` (a flat trend has no magnitude to report).
   */
  magnitude?: number;
  /** Decimal places for `magnitude`. Defaults to 1. */
  magnitudeDigits?: number;
  /** Verdict word override. Defaults to Improving / Steady / Declining. */
  label?: React.ReactNode;
  className?: string;
}

/**
 * Chrome-free "arrow + verdict word [+ magnitude]" primitive — the rendering
 * counterpart of the canonical `@/lib/coachhelm/trend` classifier used by the
 * Players roster, Team Stats (trajectory + player cards), and Team Pulse.
 * Unlike `TrendChip`, no background/padding/height is imposed, so it drops
 * into a surface's OWN existing typography (a roster row, a player-card
 * trend line) — unifying the SEMANTICS (which arrow means what) across
 * surfaces without touching each surface's SKIN (size/typography stay
 * whatever `className` supplies).
 */
export function TrendGlyph({
  direction,
  magnitude,
  magnitudeDigits = 1,
  label,
  className,
}: TrendGlyphProps) {
  const magnitudeText =
    magnitude != null && Number.isFinite(magnitude) && direction !== 'stable'
      ? Math.abs(magnitude).toFixed(magnitudeDigits)
      : null;
  const text =
    label ??
    (magnitudeText != null ? (
      <>
        {CANONICAL_TREND_LABEL[direction]}{' '}
        <span className="font-fw-mono tabular-nums">{magnitudeText}</span>
      </>
    ) : (
      CANONICAL_TREND_LABEL[direction]
    ));

  return (
    <span
      data-slot="trend-glyph"
      data-direction={direction}
      className={cn(
        'inline-flex items-center gap-1',
        CANONICAL_TREND_TEXT_TONE[direction],
        className,
      )}
    >
      <span aria-hidden="true">{CANONICAL_TREND_ARROW[direction]}</span>
      <span>{text}</span>
    </span>
  );
}
