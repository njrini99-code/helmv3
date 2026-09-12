'use client';

/**
 * ============================================================================
 * Fairway · feedback · Meter — a static MEASURE against a range
 * ----------------------------------------------------------------------------
 * "Where does this value sit against a known good range" — battery level,
 * confidence, a stat against par. NOT a running process; that's `Progress`
 * (this same folder). Mirrors the native `<meter>` element's attribute
 * vocabulary (`min`/`max`/`low`/`high`/`optimum`/`value`) and semantics, on
 * `role="meter"` (native `<meter>` itself cannot be restyled to the Fairway
 * track/fill recipe, so this is a styled ARIA equivalent, not a wrapper).
 *
 *   <Meter value={7.4} min={0} max={10} low={4} high={8} optimum={9} label="Confidence" showValue />
 *
 * Tone is COMPUTED from where `value` falls, never passed in — that's the
 * point of a measure (brief: "accent within the optimum band, warning
 * between, danger beyond"):
 *   1. `low`/`high` bound the "good" band (default the full min–max range).
 *   2. `optimum` says which side is better — at/beyond it is the accent band;
 *      unspecified defaults to the middle of the good band (both edges equally
 *      acceptable, degrading outward in either direction).
 *   3. One good-band-width outside the good band is `warning`; further than
 *      that is `danger`.
 * ========================================================================== */

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type MeterSize = 'sm' | 'md';
type MeterTone = 'accent' | 'warning' | 'danger';

export interface MeterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'children'> {
  value: number;
  min?: number;
  max?: number;
  /** Lower bound of the "good" band. Default `min`. */
  low?: number;
  /** Upper bound of the "good" band. Default `max`. */
  high?: number;
  /** Which side of the good band is ideal. Default the band's midpoint. */
  optimum?: number;
  size?: MeterSize;
  /** Render the numeric value beside the track. Default `false`. */
  showValue?: boolean;
  /** Formats the displayed value when `showValue`. Default `Math.round`. */
  formatValue?: (value: number) => string;
  /** Accessible label — REQUIRED. */
  label: string;
  className?: string;
  'data-slot'?: string;
}

const HEIGHT: Record<MeterSize, string> = {
  sm: 'h-1.5',
  md: 'h-2',
};

const FILL: Record<MeterTone, string> = {
  accent: 'bg-accent-650',
  warning: 'bg-fw-warning',
  danger: 'bg-fw-danger',
};

const TEXT: Record<MeterTone, string> = {
  accent: 'text-text-primary',
  warning: 'text-fw-warning-ink',
  danger: 'text-fw-danger-ink',
};

function resolveMeterTone(value: number, low: number, high: number): MeterTone {
  if (value >= low && value <= high) return 'accent';
  const bandWidth = Math.max(high - low, 1e-6);
  const distance = value < low ? low - value : value - high;
  return distance <= bandWidth ? 'warning' : 'danger';
}

export const Meter = forwardRef<HTMLDivElement, MeterProps>(function Meter(
  {
    value,
    min = 0,
    max = 100,
    low,
    high,
    optimum,
    size = 'md',
    showValue = false,
    formatValue = (v) => `${Math.round(v)}`,
    label,
    className,
    'data-slot': dataSlot = 'fw-meter',
    ...props
  },
  ref,
) {
  const lowV = low ?? min;
  const highV = high ?? max;
  const optimumV = optimum ?? (lowV + highV) / 2;

  // `optimum` at or below the band's low edge means lower is better; at or
  // above the high edge means higher is better; the good band above already
  // covers "closer to a mid optimum is better" in either case.
  const effectiveLow = optimumV <= lowV ? min : lowV;
  const effectiveHigh = optimumV >= highV ? max : highV;

  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const tone = resolveMeterTone(clamped, effectiveLow, effectiveHigh);

  return (
    <div data-slot={dataSlot} className={cn('flex items-center gap-2', className)}>
      <div
        ref={ref}
        role="meter"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={formatValue(clamped)}
        data-tone={tone}
        className={cn('relative min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken', HEIGHT[size])}
        {...props}
      >
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', FILL[tone])}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      {showValue ? (
        <span
          className={cn('flex-shrink-0 font-fw-mono text-caption tabular-nums', TEXT[tone])}
          aria-hidden="true"
        >
          {formatValue(clamped)}
        </span>
      ) : null}
    </div>
  );
});
