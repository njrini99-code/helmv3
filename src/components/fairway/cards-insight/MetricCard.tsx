'use client';

/**
 * ============================================================================
 * Fairway · MetricCard (primitive group "cards-insight")
 * ----------------------------------------------------------------------------
 * THE single-metric tile (§6 "MetricCard"): a big tabular numeric in Fragment
 * Mono that rolls on change via Number Flow (@number-flow/react), an overline
 * label, an optional up/down delta chip (accent green up / danger down), and an
 * optional quiet sparkline slot. Calm, low-chrome, matte by default.
 *
 * Surface policy (§4.1/§4.2): matte opaque `bg-surface`, `rounded-card` (20px),
 * border-OR-shadow-never-both at rest. Resting = warm `border-border-subtle`,
 * no shadow. Interactive variant lifts to `shadow-soft` + a ≤1px upward drift
 * on hover, settles on active. All motion honors `prefers-reduced-motion` and
 * Number Flow snaps to final value when reduced.
 *
 * ADDITIVE ONLY — this file is self-contained inside the cards-insight folder
 * and imports nothing from the live app except the shared `cn()` helper. It is
 * styled to render correctly inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ============================================================================
 */

import {
  forwardRef,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Visual weight of the tile. `default` is the everyday KPI; `hero` gets a
 *  touch more air + a slightly larger numeric for the one lead metric. */
export type MetricCardVariant = 'default' | 'hero';

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
  /** Adds hover/active affordances (lift + drift). Default false (calm). */
  interactive?: boolean;
  /** Loading → shape-matched skeleton (never a spinner). */
  loading?: boolean;
  /** When true the value reads as `insufficient-data` rather than a real 0. */
  empty?: boolean;
  /** Message shown in the empty state. Default "Not enough data yet". */
  emptyMessage?: string;
}

/* -- delta helpers ---------------------------------------------------------- */

function resolveDirection(d: MetricDelta): Exclude<MetricDeltaDirection, 'auto'> {
  if (d.direction && d.direction !== 'auto') return d.direction;
  if (d.value > 0) return 'up';
  if (d.value < 0) return 'down';
  return 'neutral';
}

/** Map a movement direction + what-counts-as-good into a tone. */
function deltaTone(
  direction: Exclude<MetricDeltaDirection, 'auto'>,
  good: MetricGoodDirection,
): 'positive' | 'negative' | 'neutral' {
  if (direction === 'neutral') return 'neutral';
  const isGood = direction === good;
  return isGood ? 'positive' : 'negative';
}

const TONE_CLASS: Record<'positive' | 'negative' | 'neutral', string> = {
  // Green up = the plant in the room; danger red for a bad move; warm neutral otherwise.
  positive: 'text-fw-success bg-fw-success-bg',
  negative: 'text-fw-danger bg-fw-danger-bg',
  neutral: 'text-text-tertiary bg-surface-sunken',
};

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
      interactive = false,
      loading = false,
      empty = false,
      emptyMessage = 'Not enough data yet',
      className,
      ...rest
    },
    ref,
  ) {
    const prefersReduced = useReducedMotion();

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

    const base = cn(
      'group relative flex flex-col rounded-card bg-surface',
      'border border-border-subtle',
      'transition-[box-shadow,transform,border-color] ease-soft',
      isHero ? 'p-8 gap-3' : 'p-6 gap-2',
      interactive && [
        'cursor-pointer',
        'duration-fast',
        'hover:shadow-soft hover:-translate-y-px hover:border-transparent',
        'active:translate-y-[0.5px] active:shadow-flat',
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
            <span className="h-3 w-24 animate-pulse rounded-full bg-surface-sunken" />
            {icon ? (
              <span className="h-5 w-5 animate-pulse rounded-md bg-surface-sunken" />
            ) : null}
          </div>
          <span
            className={cn(
              'mt-1 animate-pulse rounded-fw-md bg-surface-sunken',
              isHero ? 'h-12 w-40' : 'h-9 w-28',
            )}
          />
          <span className="h-3 w-20 animate-pulse rounded-full bg-surface-sunken" />
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
          <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
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
          <p className="font-fw-sans text-h3 font-semibold text-text-tertiary">
            {emptyMessage}
          </p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div
              className={cn(
                'font-fw-mono font-medium tabular-nums text-text-primary',
                // canonical scale: display (40px) for the lead metric, h1 (32px) otherwise
                isHero ? 'text-display' : 'text-h1',
              )}
              style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
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

            {/* sparkline floats with the value when present (default tile) */}
            {sparkline && !isHero ? (
              <div className="min-w-0 shrink text-text-tertiary">{sparkline}</div>
            ) : null}
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

        {/* hero sparkline spans the full width beneath the value */}
        {sparkline && isHero ? (
          <div className="mt-1 w-full text-text-tertiary">{sparkline}</div>
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
  const direction = resolveDirection(delta);
  const tone = deltaTone(direction, goodDirection);
  const Icon =
    direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span className="inline-flex items-center gap-1.5">
      <motion.span
        initial={prefersReduced ? false : { opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
          'font-fw-mono text-caption font-medium tabular-nums',
          TONE_CLASS[tone],
        )}
        style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
      >
        <Icon aria-hidden className="h-3 w-3" strokeWidth={2.5} />
        <NumberFlow
          value={delta.value}
          prefix={delta.prefix}
          suffix={delta.suffix}
          format={format}
          animated={!prefersReduced}
          respectMotionPreference
        />
      </motion.span>
      {delta.label ? (
        <span className="font-fw-sans text-caption text-text-tertiary">
          {delta.label}
        </span>
      ) : null}
    </span>
  );
}
