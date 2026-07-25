'use client';

/**
 * ============================================================================
 * Fairway · MetricCard (primitive group "cards-insight")
 * ----------------------------------------------------------------------------
 * THE single-metric tile (§6 "MetricCard"): a big tabular numeric in Fragment
 * Mono that rolls on change via Number Flow (@number-flow/react), an overline
 * label, an optional up/down delta chip (accent green improving / amber
 * declining — NEVER danger red, see AUDIT-0724 finding #7 below), and an
 * optional quiet sparkline slot. Calm, low-chrome, matte by default.
 *
 * Surface policy (§4.1/§4.2): matte opaque `bg-surface`, `rounded-card` (20px),
 * border-OR-shadow-never-both at rest. Resting = warm `border-border-subtle`,
 * no shadow. Interactive variant lifts to `shadow-soft` + a ≤1px upward drift
 * on hover, settles on active. All motion honors `prefers-reduced-motion` and
 * Number Flow snaps to final value when reduced.
 *
 * DELTA CHIP TONE (AUDIT-0724/stats-visual-accuracy.md findings #2/#6/#7):
 * the chip's tone is classified via the charts cluster's ONE shared
 * `classifyTrend()` (the same function Sparkline/TrendChip use) instead of a
 * locally-duplicated sign check — previously this was the one place in the
 * cluster painting a "declining" verdict in real danger-red while every
 * sibling (Sparkline, TrendChip, Numeric's DeltaChip) used warm amber for
 * the identical verdict, AND a caller could hand this chip a `delta.value`
 * computed by a different algorithm than the Sparkline plotted next to it
 * (see `computeSeriesTrend()` in `charts/seriesTrend.ts` — the fix is for
 * both to derive from ONE call on the SAME series). The arrow glyph still
 * reflects the raw sign of `delta.value` (a "what actually moved" fact,
 * independent of whether that move was good) — only the background/ink tone
 * is goodDirection-aware.
 *
 * Imports the shared classifier from `../charts/TrendChip` — no longer
 * fully self-contained inside cards-insight (it already imported Skeleton
 * from `../feedback`), but this is the deliberate fix for the finding above.
 * ============================================================================
 */

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/fairway/feedback';
// The ONE shared trend classifier (AUDIT-0724 #2/#6/#7) — see the file header
// above. Direct-file import (not the `charts` barrel) mirrors how Sparkline
// itself imports these from the same module.
import { classifyTrend, TREND_TONE_CLASS } from '@/components/fairway/charts/TrendChip';

/** Visual weight of the tile. `default` is the everyday KPI; `hero` gets a
 *  touch more air + a slightly larger numeric for the one lead metric. */
export type MetricCardVariant = 'default' | 'hero';

/** Tile density — `compact` for dense KPI grids (tighter padding, smaller value). */
export type MetricCardDensity = 'default' | 'compact';

/** Semantic direction of a delta. `auto` derives from the sign of `value`. */
export type MetricDeltaDirection = 'up' | 'down' | 'neutral' | 'auto';

/**
 * Which direction reads as "good". For most stats higher is better (score
 * trending up = green). For golf scoring, lower is better — pass
 * `goodDirection="down"` so a negative delta is rendered in accent green.
 */
export type MetricGoodDirection = 'up' | 'down';

export interface MetricDelta {
  /** The change amount (sign drives direction unless `direction` is set). */
  value: number;
  /** Override the derived direction (defaults to the sign of `value`). */
  direction?: MetricDeltaDirection;
  /** Number of fraction digits for the delta readout. Defaults to the
   *  metric's own `decimals`. */
  decimals?: number;
  /** Prefix the delta number (e.g. "$"). Sign is rendered automatically. */
  prefix?: string;
  /** Suffix the delta number (e.g. "%", " SG"). */
  suffix?: string;
  /** Tiny trailing label, e.g. "vs last week". */
  label?: string;
  /**
   * Magnitude deadzone (in the delta's own units) at or below which the tone
   * reads `flat` (gray "Flat") regardless of sign — routed through the
   * shared `classifyTrend()`. Defaults to `0`, matching prior behavior
   * (only an exact `value === 0` read as flat) for every existing caller.
   * AUDIT-0724 finding #2: "a series this noisy shouldn't claim a direction
   * with more confidence than the data supports" — callers computing
   * `value` via `computeSeriesTrend()` should pass its own threshold here
   * too so the chip and the sparkline agree on WHERE the flat band starts,
   * not just on which side of zero they landed.
   */
  flatThreshold?: number;
}

export interface MetricCardProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'prefix'> {
  /** Uppercase eyebrow above the value (the metric name). */
  label: ReactNode;
  /** The numeric value. Rolls on change via Number Flow. */
  value: number;
  /** Fraction digits for the value. Default 0. */
  decimals?: number;
  /** Rendered immediately before the value (e.g. "$"). */
  prefix?: string;
  /** Rendered immediately after the value (e.g. "%", "yds"). */
  suffix?: string;
  /** Full Intl number-format override. Wins over `decimals`. */
  format?: Format;
  /** Optional delta chip. Omit for a calm value-only tile. */
  delta?: MetricDelta;
  /** Which direction is "good" — colors the delta. Default `up`. */
  goodDirection?: MetricGoodDirection;
  /** Optional sparkline / micro-chart slot, right- or bottom-aligned. */
  sparkline?: ReactNode;
  /** Tiny supporting line under the value (e.g. "of 40 attempts"). */
  footnote?: ReactNode;
  /** Lead icon rendered in the header row, tertiary tone. */
  icon?: ReactNode;
  /** Visual weight. Default `default`. */
  variant?: MetricCardVariant;
  /** Tile density. `compact` tightens padding + drops the value one step for
   *  dense 5/6-up KPI grids. Ignored when `variant='hero'`. Default `default`. */
  density?: MetricCardDensity;
  /**
   * How many lines the uppercase eyebrow `label` may wrap onto before it's cut
   * off. `1` (default) is the original single-line ellipsis truncation —
   * unchanged for every existing caller. `2` lets a longer/compound label
   * (e.g. "Showing patterns") wrap onto a second line instead of clipping
   * mid-word at narrow tile widths, and reserves a fixed 2-line-tall slot
   * (`min-h-8`, matching the eyebrow token's 16px line-height) so sibling
   * tiles in the same row keep their values aligned regardless of how many
   * lines any one label actually needs.
   */
  labelLines?: 1 | 2;
  /** Adds hover/active affordances (lift + drift). Default false (calm). */
  interactive?: boolean;
  /** Loading → shape-matched skeleton (never a spinner). */
  loading?: boolean;
  /** When true the value reads as `insufficient-data` rather than a real 0. */
  empty?: boolean;
  /** Message shown in the empty state. Default "Not enough data yet". */
  emptyMessage?: string;
  /**
   * Value-face tone. `'accent'` (default) paints the figure in the brand green
   * so KPI cards read as a cohesive scoreboard; `'neutral'` keeps the dark ink.
   */
  tone?: 'accent' | 'neutral';
}

/* -- delta helpers ---------------------------------------------------------- */

/**
 * The RAW movement direction (arrow glyph only) — a "what actually moved"
 * fact, independent of whether that move was good or bad. Respects an
 * explicit `direction` override (no current caller sets one against the
 * sign of `value`; kept for API compatibility), else derives from sign.
 * Tone is a SEPARATE concern below — see `classifyTrend` at the call site.
 */
function resolveDirection(d: MetricDelta): Exclude<MetricDeltaDirection, 'auto'> {
  if (d.direction && d.direction !== 'auto') return d.direction;
  if (d.value > 0) return 'up';
  if (d.value < 0) return 'down';
  return 'neutral';
}

/*
 * NOTE (AUDIT-0724 findings #2/#6/#7): tone used to be derived here by a
 * locally-duplicated `deltaTone()` + `TONE_CLASS` map — including a real
 * danger-red `negative` entry, the one place in the trend cluster not using
 * warm amber for a "declining" verdict. Both are gone. Tone is now computed
 * at the `DeltaChip` call site via the shared `classifyTrend()` +
 * `TREND_TONE_CLASS` imported from `charts/TrendChip` — the SAME classifier
 * Sparkline uses, so a card's chip and its sparkline can never again render
 * the same series through two different rules.
 */

/* -- sparkline slot: measure-then-fill ---------------------------------------
 * Sparkline draws to EXACTLY the pixel `width`/`height` it's handed (its own
 * `toPoints()` maps the series into that box) — it doesn't stretch to fill a
 * CSS `w-full` wrapper on its own, and an inline SVG's default
 * `preserveAspectRatio="xMidYMid meet"` means a plain CSS-width override
 * would just letterbox the plot rather than genuinely widen it. Rather than
 * edit Sparkline's own internals (owned by the charts cluster), this slot
 * measures its OWN rendered width via ResizeObserver and clones the
 * `sparkline` element with that width — a real full-card-width trend using
 * Sparkline's already-public `width`/`height` props, nothing else touched.
 * Falls back to leaving the element's own defaults alone until measured (SSR,
 * pre-mount, and jsdom in tests all read 0) — never a guessed width that
 * could overshoot a narrow card. -------------------------------------------- */
function useSparklineWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/* -- component -------------------------------------------------------------- */

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  function MetricCard(
    {
      label,
      value,
      decimals = 0,
      prefix,
      suffix,
      format,
      delta,
      goodDirection = 'up',
      sparkline,
      footnote,
      icon,
      variant = 'default',
      density = 'default',
      labelLines = 1,
      interactive = false,
      loading = false,
      empty = false,
      emptyMessage = 'Not enough data yet',
      tone = 'accent',
      className,
      ...rest
    },
    ref,
  ) {
    const prefersReduced = useReducedMotion();
    const { ref: sparklineWrapRef, width: sparklineWidth } = useSparklineWidth();

    const numberFormat = useMemo<Format>(
      () =>
        format ?? {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        },
      [format, decimals],
    );

    const deltaFormat = useMemo<Format>(() => {
      const dec = delta?.decimals ?? decimals;
      return {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
        // Always show a leading sign on the delta so direction is explicit.
        signDisplay: 'exceptZero',
      };
    }, [delta?.decimals, decimals]);

    const isHero = variant === 'hero';
    // Compact: a tighter tile for dense 5/6-up KPI grids where full p-6 reads
    // cramped. Hero always wins over compact.
    const isCompact = density === 'compact' && !isHero;

    // Full-width baseline trend: once the slot below has a measured width,
    // hand the sparkline element that width (+ a taller, more premium height
    // than its 20px inline default) via cloneElement. `sparkline` is typed as
    // an opaque ReactNode (this file imports nothing from the charts
    // cluster), so the clone is generic — it only fires for a real element
    // that accepts numeric width/height, and no-ops for anything else.
    const sparklineHeight = isHero ? 40 : isCompact ? 24 : 32;
    const sparklineNode =
      sparkline && sparklineWidth > 0 && isValidElement<{ width?: number; height?: number }>(sparkline)
        ? cloneElement(sparkline, { width: sparklineWidth, height: sparklineHeight })
        : sparkline;

    const base = cn(
      'group relative flex flex-col rounded-card bg-surface',
      // resting: warm hairline + a whisper shadow with a lit top edge so the KPI
      // tile reads as a premium physical surface, not a flat outlined box.
      // --fw-shadow-card is light-cards-only (carries the warm-white top edge).
      'border border-border-subtle [box-shadow:var(--fw-shadow-card)]',
      'transition-[box-shadow,transform,border-color] ease-soft',
      isHero ? 'p-8 gap-3' : isCompact ? 'p-4 gap-1.5' : 'p-6 gap-2',
      interactive && [
        'cursor-pointer will-change-transform',
        '[transition-duration:240ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        'hover:shadow-raise hover:-translate-y-[2px] hover:border-transparent',
        'active:translate-y-0 active:shadow-soft active:[transition-duration:110ms]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
      ],
      !interactive && 'duration-base',
      className,
    );

    /* -- loading: shape-matched skeleton -- */
    if (loading) {
      return (
        <div
          ref={ref}
          aria-busy="true"
          aria-live="polite"
          className={cn(base, 'pointer-events-none select-none')}
          {...rest}
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24 rounded-full" />
            {icon ? <Skeleton className="h-5 w-5 rounded-md" /> : null}
          </div>
          <Skeleton
            className={cn(
              'mt-1 rounded-fw-md',
              isHero ? 'h-12 w-40' : isCompact ? 'h-7 w-20' : 'h-9 w-28',
            )}
          />
          <Skeleton className="h-3 w-20 rounded-full" />
        </div>
      );
    }

    const interactiveProps = interactive
      ? { tabIndex: 0, role: 'button' as const }
      : {};

    return (
      <div ref={ref} className={base} {...interactiveProps} {...rest}>
        {/* header: overline label + optional icon */}
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'min-w-0 font-fw-sans text-eyebrow uppercase text-text-tertiary',
              labelLines === 2
                ? // Wrap up to 2 lines instead of a hard single-line ellipsis —
                  // the fixed `min-h-8` (16px eyebrow line-height × 2) reserves
                  // the same slot whether a given tile's label needs 1 or 2
                  // lines, so sibling tiles in the same KPI row stay aligned.
                  'line-clamp-2 min-h-8 break-words'
                : 'truncate',
            )}
          >
            {label}
          </span>
          {icon ? (
            <span className="shrink-0 text-text-tertiary [&_svg]:h-5 [&_svg]:w-5">
              {icon}
            </span>
          ) : null}
        </div>

        {/* value row */}
        {empty ? (
          // Null metric: recede it so it reads as "no data yet", not as a value
          // competing with live figures next to it (premium-polish pass).
          <p className="font-fw-sans text-h3 font-normal text-text-tertiary opacity-50">
            {emptyMessage}
          </p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div
              className={cn(
                'font-fw-mono font-medium tabular-nums text-text-primary',
                // canonical scale: display (40px) lead, h1 (32px) default, h2 (24px) compact
                isHero ? 'text-display' : isCompact ? 'text-h2' : 'text-h1',
              )}
              // The brand-green value face is applied via inline style, NOT a
              // `text-accent-700` class: tailwind-merge conflates our custom
              // `text-h1`/`text-display` size utilities with `text-*` color
              // utilities and would strip the color. Inline style also reliably
              // reaches NumberFlow's shadow-DOM digits (which inherit `color`).
              style={{
                fontFeatureSettings: '"tnum" 1, "lnum" 1',
                ...(tone === 'accent' ? { color: 'var(--fw-color-accent-700)' } : null),
              }}
            >
              <NumberFlow
                value={value}
                prefix={prefix}
                suffix={suffix}
                format={numberFormat}
                animated={!prefersReduced}
                transformTiming={{ duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                spinTiming={{ duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                respectMotionPreference
              />
            </div>
          </div>
        )}

        {/* delta chip + footnote */}
        {(delta && !empty) || footnote ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {delta && !empty ? (
              <DeltaChip
                delta={delta}
                format={deltaFormat}
                goodDirection={goodDirection}
                prefersReduced={Boolean(prefersReduced)}
              />
            ) : null}
            {footnote ? (
              <span className="font-fw-sans text-caption text-text-tertiary">
                {footnote}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Trendline — a full-width baseline mini-trend anchored along the
            BOTTOM of the card, below the value + delta, never a cramped
            squiggle floating beside the value (was `min-w-0 shrink` in the
            value row — read as broken at a glance). `overflow-hidden` +
            `w-full` on this slot is a hard backstop: even mid-resize, before
            useSparklineWidth's next measurement lands, the trend can never
            escape the card (#957-style containment). Hidden alongside the
            value when the metric itself is `empty` — Sparkline's own honesty
            contract already refuses to plot <2 points, but a trend under a
            value that's explicitly marked insufficient-data is its own kind
            of dishonest. */}
        {sparkline && !empty ? (
          <div
            ref={sparklineWrapRef}
            className="mt-1 w-full min-w-0 overflow-hidden text-text-tertiary"
          >
            {sparklineNode}
          </div>
        ) : null}
      </div>
    );
  },
);

/* -- delta chip ------------------------------------------------------------- */

function DeltaChip({
  delta,
  format,
  goodDirection,
  prefersReduced,
}: {
  delta: MetricDelta;
  format: Format;
  goodDirection: MetricGoodDirection;
  prefersReduced: boolean;
}) {
  // Arrow glyph: the RAW movement (what the number actually did), never
  // masked by whether that move was good.
  const direction = resolveDirection(delta);
  // Tone: routed through the shared `classifyTrend()` (AUDIT-0724 #2/#6/#7)
  // instead of a locally-duplicated good/bad check, so this chip and a
  // Sparkline fed the SAME delta can never disagree on what counts as
  // improving/flat/declining — and `TREND_TONE_CLASS.declining` is warm
  // amber, never the danger-red this chip used to reach for.
  const verdict = classifyTrend(delta.value, {
    goodDirection,
    flatThreshold: delta.flatThreshold ?? 0,
  });
  // Flat if EITHER the raw movement is neutral (delta.value === 0, or an
  // explicit `direction: 'neutral'` override) OR the shared classifier's
  // magnitude deadzone says this delta is too small to claim a direction —
  // whichever check fires, don't render a confident-looking colored pill.
  const isFlat = direction === 'neutral' || verdict === 'flat';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span className="inline-flex items-center gap-1.5">
      <motion.span
        initial={prefersReduced ? false : { opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
          'font-fw-mono text-caption font-medium tabular-nums',
          isFlat ? TREND_TONE_CLASS.flat : TREND_TONE_CLASS[verdict],
        )}
        style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
      >
        {isFlat ? (
          // No real movement (delta.value === 0) — a Minus glyph next to a
          // literal "0%" read as a stray "— 0%" (#950). Say "Flat" instead of
          // pairing a dash icon with a zero value that isn't really a number
          // worth reading.
          <span className="font-fw-sans normal-case tracking-normal">Flat</span>
        ) : (
          <>
            <Icon aria-hidden className="h-3 w-3" strokeWidth={1.5} />
            <NumberFlow
              value={delta.value}
              prefix={delta.prefix}
              suffix={delta.suffix}
              format={format}
              animated={!prefersReduced}
              respectMotionPreference
            />
          </>
        )}
      </motion.span>
      {delta.label ? (
        <span className="font-fw-sans text-caption text-text-tertiary">
          {delta.label}
        </span>
      ) : null}
    </span>
  );
}
