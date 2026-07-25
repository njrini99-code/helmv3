'use client';

/**
 * ============================================================================
 * Numeric — Number Flow value + optional delta chip (§5.3)
 * ----------------------------------------------------------------------------
 * The cheapest premium win: every changing/aligned figure animates with
 * Number Flow, in tabular General Sans (the spec default; mono is the
 * exception). Snaps to the final value under prefers-reduced-motion via
 * Number Flow's own `respectMotionPreference`.
 *
 * Hierarchy (§5.3): big tabular number → tiny uppercase overline label →
 * delta chip (green up / amber down — amber, NOT red, keeps the palette warm).
 * Three weights max.
 * ========================================================================== */

import * as React from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from './theme';

type NumericSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_CLASS: Record<NumericSize, string> = {
  sm: 'text-h3',
  md: 'text-h2',
  lg: 'text-h1',
  // Fairway display numeric (44/48) — the spec's hero stat; no exact canonical
  // text-* token (display is 40), so the size is set explicitly here.
  hero: 'text-[44px] leading-[48px]',
};

export interface NumericProps {
  /** The value to display (animated). */
  value: number;
  /** Intl.NumberFormat options forwarded to Number Flow. */
  format?: Format;
  prefix?: string;
  suffix?: string;
  /** Uppercase overline label under the value. */
  label?: string;
  /** Visual size step. */
  size?: NumericSize;
  /** Use the mono ledger face instead of tabular sans. */
  mono?: boolean;
  /**
   * Value-face tone. `'accent'` (default) paints the figure in the brand green
   * so KPIs read as a cohesive scoreboard; `'neutral'` keeps the dark ink for
   * cases where green would carry no meaning.
   */
  tone?: 'accent' | 'neutral';
  /** Optional delta chip rendered to the right of the value. */
  delta?: DeltaChipProps;
  className?: string;
}

/**
 * Animated, tabular numeric with an optional label + delta chip. Use for
 * StatTile values, scores, SG totals — anything that changes or must align.
 */
export const Numeric = React.forwardRef<HTMLDivElement, NumericProps>(function Numeric(
  { value, format, prefix, suffix, label, size = 'md', mono = false, tone = 'accent', delta, className },
  ref,
) {
  return (
    <div ref={ref} data-slot="numeric" className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex items-baseline gap-2">
        <NumberFlow
          value={value}
          format={format}
          prefix={prefix}
          suffix={suffix}
          respectMotionPreference
          willChange
          // Brand-green value face via inline style (not a `text-accent-700`
          // class): tailwind-merge conflates the custom `text-h*` size
          // utilities with `text-*` colors and strips the color; inline style
          // also reaches NumberFlow's shadow-DOM digits, which inherit `color`.
          style={tone === 'accent' ? { ...TABULAR_NUMS, color: 'var(--fw-color-accent-700)' } : TABULAR_NUMS}
          className={cn(
            'font-semibold text-text-primary',
            mono ? 'font-fw-mono' : 'font-fw-sans',
            SIZE_CLASS[size],
          )}
        />
        {delta ? <DeltaChip {...delta} /> : null}
      </div>
      {label ? (
        <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">{label}</span>
      ) : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Delta chip                                                                 */
/* -------------------------------------------------------------------------- */

export interface DeltaChipProps {
  /** Signed change. Positive → green (up), negative → amber (down). */
  value: number;
  /** Optional explicit direction override (else inferred from sign). */
  direction?: 'up' | 'down' | 'flat';
  /** Format the magnitude (defaults to a +/− fixed-1 number). */
  format?: (value: number) => string;
  /** Render as a percent change. */
  percent?: boolean;
  className?: string;
}

/**
 * A small green-up / amber-down trend chip. Color is NEVER the only channel:
 * an arrow glyph + sign communicate direction for CVD users.
 */
export function DeltaChip({ value, direction, format, percent, className }: DeltaChipProps) {
  const dir = direction ?? (value > 0 ? 'up' : value < 0 ? 'down' : 'flat');
  const magnitude = Math.abs(value);
  const text = format
    ? format(value)
    : percent
      ? `${(magnitude * 100).toFixed(1)}%`
      : magnitude.toFixed(1);
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';

  return (
    <span
      data-slot="delta-chip"
      data-direction={dir}
      style={TABULAR_NUMS}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5',
        'font-fw-sans text-eyebrow font-semibold leading-none tracking-normal normal-case',
        dir === 'up' && 'bg-fw-success-bg text-fw-success-ink',
        dir === 'down' && 'bg-fw-warning-bg text-fw-warning-ink',
        dir === 'flat' && 'bg-inset text-text-tertiary',
        className,
      )}
    >
      <span aria-hidden>{arrow}</span>
      <span>{text}</span>
    </span>
  );
}
