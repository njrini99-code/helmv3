'use client';

/**
 * ============================================================================
 * DivergingBars — a zero-centered strokes-gained tornado row set
 * (mockup §.divg/.dv)
 * ----------------------------------------------------------------------------
 * Each row grows from a center zero-line: rightward for a positive
 * ("over"/worse, by default) delta, leftward for a negative ("under"/better,
 * by default) delta — see `goodDirection` for flipping which side reads as
 * good without ever flipping the geometry or the sign. `max` sets the
 * scale — a delta at ±max spans a full half-rail.
 *
 * `labelWidth` (default `40`) sets the label column's pixel width — mirrors
 * `RailBarsProps.labelWidth`. `referenceTick` draws one extra shared tick
 * (e.g. a team mean) on every row's rail, distinct from the fixed zero
 * marker (roster.v2.md, 2026-09-10).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';
import type { DivergingBarsProps } from './types';

export function DivergingBars({
  rows,
  max,
  labelWidth = 40,
  goodDirection = 'lower',
  referenceTick,
}: DivergingBarsProps) {
  // Position of the shared reference tick, as a 0-100 percent across the
  // full rail (50 = the zero-line center) — clamped so an outlier reference
  // never renders past the rail's own edge.
  const refPct =
    referenceTick && max > 0
      ? 50 + Math.max(-50, Math.min(50, (referenceTick.value / max) * 50))
      : null;

  return (
    <div data-slot="diverging-bars" className="mt-0.5 grid gap-1.5">
      {referenceTick?.label ? (
        // Announced once for assistive tech rather than per row — the same
        // mark repeats on every rail visually, but a screen reader doesn't
        // need it read eight times.
        <span className="sr-only">
          {referenceTick.label}: {referenceTick.value}
        </span>
      ) : null}
      {rows.map((row, index) => {
        const pct = max > 0 ? Math.min(50, (Math.abs(row.delta) / max) * 50) : 0;
        const over = row.delta > 0;
        const barColorClass =
          goodDirection === 'higher'
            ? over ? 'bg-accent-500' : 'bg-fw-warning'
            : over ? 'bg-fw-warning' : 'bg-accent-500';
        return (
          <div
            key={`${index}-${row.label}`}
            className="grid items-center gap-2.5"
            style={{ gridTemplateColumns: `${labelWidth}px 1fr 42px` }}
          >
            <span className="truncate font-fw-sans text-caption text-text-tertiary">{row.label}</span>
            <span className="relative h-[9px] rounded-full bg-surface-sunken">
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -bottom-0.5 left-1/2 w-[2px] bg-warm-400"
              />
              {refPct != null ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -bottom-0.5 w-[1.5px] bg-text-tertiary"
                  style={{ left: `${refPct}%` }}
                />
              ) : null}
              {row.delta !== 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-0 rounded-full',
                    over ? 'left-1/2' : 'right-1/2',
                    barColorClass,
                  )}
                  style={{ width: `${pct}%` }}
                />
              ) : null}
            </span>
            <span
              style={TABULAR_NUMS}
              className="text-right font-fw-mono text-caption font-normal tabular-nums text-text-primary"
            >
              {row.display}
            </span>
          </div>
        );
      })}
    </div>
  );
}
