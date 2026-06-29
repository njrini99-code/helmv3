'use client';

/**
 * ============================================================================
 * Fairway · instrument · Readout — the cockpit BIG READOUT display element
 * ----------------------------------------------------------------------------
 * The instrument-display number: a huge Fragment-Mono value + unit, a tiny
 * Fraunces label, an optional signed delta (▲▼), and a live/awaiting state —
 * like the digital readout panel on an aircraft instrument cluster.
 *
 *   ┌──────────────────────────┐
 *   │ STROKES GAINED · OFF TEE │  ← tiny uppercase label (Fraunces)
 *   │  +1.42  sg               │  ← HUGE mono value (Fragment Mono) + unit + ▲
 *   │  ▲ +0.31 vs last 5       │  ← optional signed delta line
 *   └──────────────────────────┘
 *
 * Number-Flow animates the value on change (snaps under prefers-reduced-motion
 * via `respectMotionPreference`). Color is NEVER the only channel — the delta
 * carries a ▲/▼/► glyph + an explicit sign.
 *
 * HONESTY (the instrument-cluster rule): when a figure is starved, pass
 * `state="awaiting"` (optionally `samples={{ have, need }}`). The readout then
 * shows a dim "AWAITING SIGNAL — N of M" calibration display instead of a
 * fabricated 0 — an honest dim instrument, never an authoritative fake value.
 *
 * ADDITIVE ONLY. Renders inside a `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import * as React from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';

type ReadoutSize = 'sm' | 'md' | 'lg' | 'hero';

/** Fragment-Mono value sizes — `hero` is the cockpit centerpiece display. */
const SIZE_VALUE: Record<ReadoutSize, string> = {
  sm: 'text-h2 leading-[32px]',
  md: 'text-display leading-[44px]',
  lg: 'text-[56px] leading-[60px]',
  hero: 'text-[72px] leading-[76px]',
};

const SIZE_UNIT: Record<ReadoutSize, string> = {
  sm: 'text-caption',
  md: 'text-body-sm',
  lg: 'text-body',
  hero: 'text-body-lg',
};

/** Lit / calibrating. `live` = a real value; `awaiting` = a dim, honest gauge. */
export type ReadoutState = 'live' | 'awaiting';

/** Sample progress for the honest "awaiting signal — N of M" calibration line. */
export interface ReadoutSamples {
  /** How many samples we have. */
  have: number;
  /** How many we need before the reading is trustworthy. */
  need: number;
}

export interface ReadoutDelta {
  /** Signed change. Positive → green/up, negative → amber/down. */
  value: number;
  /** Explicit direction override (else inferred from sign). */
  direction?: 'up' | 'down' | 'flat';
  /** Format the magnitude (defaults to a +/− fixed-1 number). */
  format?: (value: number) => string;
  /** Render the magnitude as a percent. */
  percent?: boolean;
  /** Trailing context, e.g. "vs last 5" / "vs team avg". */
  caption?: string;
}

export interface ReadoutProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The value to display (animated). Ignored when `state="awaiting"`. */
  value?: number;
  /** Intl.NumberFormat options forwarded to Number-Flow. */
  format?: Format;
  /**
   * Preformatted display string. When provided (and `state="live"`), this is
   * rendered verbatim with the value styling INSTEAD of Number-Flow formatting
   * `value` — for callers that already own a custom formatter (e.g. a gauge that
   * shows "53" on a 0–100 scale or "71%"). Number-Flow animation is traded for
   * exact formatting control.
   */
  display?: React.ReactNode;
  /** Tiny prefix glued to the value (e.g. a leading symbol). */
  prefix?: string;
  /** Unit suffix rendered beside the value (e.g. "sg", "%", "yds"). */
  unit?: string;
  /** Tiny uppercase label above the value (Fraunces). */
  label?: React.ReactNode;
  /** Visual size step. Default `md`. `hero` is the focal cockpit display. */
  size?: ReadoutSize;
  /** Lit value (`live`, default) or a dim honest gauge (`awaiting`). */
  state?: ReadoutState;
  /** Sample progress for the awaiting calibration line ("N of M"). */
  samples?: ReadoutSamples;
  /** Custom awaiting copy (defaults to "Awaiting signal"). */
  awaitingLabel?: string;
  /** Optional signed delta line under the value. */
  delta?: ReadoutDelta;
  /** Right-align the readout (for a top-right panel slot). */
  align?: 'start' | 'end';
}

/**
 * A cockpit instrument readout. Mount one in a panel's `readout` slot (small),
 * or as the centerpiece of a hero instrument (`size="hero"`). Pass
 * `state="awaiting"` for a starved figure so it reads honestly instead of
 * fabricating a value.
 */
export const Readout = React.forwardRef<HTMLDivElement, ReadoutProps>(function Readout(
  {
    value,
    format,
    display,
    prefix,
    unit,
    label,
    size = 'md',
    state = 'live',
    samples,
    awaitingLabel = 'Awaiting signal',
    delta,
    align = 'start',
    className,
    ...props
  },
  ref,
) {
  const isAwaiting = state === 'awaiting';
  const alignClass = align === 'end' ? 'items-end text-right' : 'items-start text-left';

  return (
    <div
      ref={ref}
      data-slot="readout"
      data-state={state}
      // an awaiting readout is a calibrating instrument, not just dim text
      aria-busy={isAwaiting || undefined}
      className={cn('flex min-w-0 flex-col gap-1', alignClass, className)}
      {...props}
    >
      {label ? (
        <span
          className={cn(
            'font-fw-display text-eyebrow uppercase tracking-[0.14em]',
            isAwaiting ? 'text-text-tertiary/80' : 'text-text-tertiary',
          )}
        >
          {label}
        </span>
      ) : null}

      {isAwaiting ? (
        /* ── Honest dim gauge: "AWAITING SIGNAL — N of M" ─────────────────── */
        <div
          className={cn('flex flex-col gap-1', align === 'end' ? 'items-end' : 'items-start')}
        >
          <span
            className={cn(
              'inline-flex items-center gap-2 font-fw-mono font-semibold tabular-nums',
              // a dim, recessive reading — never an authoritative value
              'text-text-tertiary/70',
              SIZE_VALUE[size],
            )}
          >
            {/* dim em-dash placeholder where the value would sit */}
            <span aria-hidden>—</span>
          </span>
          <span className="font-fw-display text-caption uppercase tracking-[0.1em] text-text-tertiary">
            {awaitingLabel}
            {samples ? (
              <>
                {' — '}
                <span style={TABULAR_NUMS} className="font-fw-mono tabular-nums">
                  {samples.have} of {samples.need}
                </span>
              </>
            ) : null}
          </span>
        </div>
      ) : (
        /* ── Live value: huge mono Number-Flow + unit ─────────────────────── */
        <div
          className={cn(
            'flex items-baseline gap-2',
            align === 'end' && 'flex-row-reverse',
          )}
        >
          {display != null ? (
            // Caller owns the formatting (e.g. a gauge showing "53" / "71%").
            <span
              style={TABULAR_NUMS}
              className={cn(
                'font-fw-mono font-semibold text-text-primary tabular-nums',
                SIZE_VALUE[size],
              )}
            >
              {prefix}
              {display}
            </span>
          ) : (
            <NumberFlow
              value={value ?? 0}
              format={format}
              prefix={prefix}
              respectMotionPreference
              willChange
              style={TABULAR_NUMS}
              className={cn(
                'font-fw-mono font-semibold text-text-primary tabular-nums',
                SIZE_VALUE[size],
              )}
            />
          )}
          {unit ? (
            <span
              className={cn(
                'font-fw-mono font-medium uppercase tracking-wide text-text-tertiary',
                SIZE_UNIT[size],
              )}
            >
              {unit}
            </span>
          ) : null}
        </div>
      )}

      {delta && !isAwaiting ? <DeltaLine {...delta} align={align} /> : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Delta line — signed ▲▼ change + optional caption                           */
/* -------------------------------------------------------------------------- */

function DeltaLine({
  value,
  direction,
  format,
  percent,
  caption,
  align,
}: ReadoutDelta & { align: 'start' | 'end' }) {
  const dir = direction ?? (value > 0 ? 'up' : value < 0 ? 'down' : 'flat');
  const magnitude = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const text = format
    ? format(value)
    : percent
      ? `${sign}${(magnitude * 100).toFixed(1)}%`
      : `${sign}${magnitude.toFixed(1)}`;
  // filled triangles read as instrument indicators (not the line-chart arrows)
  const glyph = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '►';

  return (
    <p
      data-slot="readout-delta"
      data-direction={dir}
      style={TABULAR_NUMS}
      className={cn(
        'flex items-center gap-1.5 font-fw-mono text-caption font-semibold tabular-nums',
        align === 'end' && 'flex-row-reverse',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-0.5',
          dir === 'up' && 'text-fw-success',
          dir === 'down' && 'text-fw-warning',
          dir === 'flat' && 'text-text-tertiary',
        )}
      >
        <span aria-hidden className="text-[0.85em] leading-none">
          {glyph}
        </span>
        <span>{text}</span>
      </span>
      {caption ? (
        <span className="font-fw-sans font-normal normal-case text-text-tertiary">
          {caption}
        </span>
      ) : null}
    </p>
  );
}
