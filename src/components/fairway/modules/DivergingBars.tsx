'use client';

/**
 * ============================================================================
 * DivergingBars — a zero-centered strokes-gained tornado row set
 * (mockup §.divg/.dv)
 * ----------------------------------------------------------------------------
 * Each row grows from a center zero-line: rightward in warm amber for a
 * positive ("over"/worse) delta, leftward in helm green for a negative
 * ("under"/better) delta. `max` sets the scale — a delta at ±max spans a
 * full half-rail.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';
import type { DivergingBarsProps } from './types';

export function DivergingBars({ rows, max }: DivergingBarsProps) {
  return (
    <div data-slot="diverging-bars" className="mt-0.5 grid gap-1.5">
      {rows.map((row) => {
        const pct = max > 0 ? Math.min(50, (Math.abs(row.delta) / max) * 50) : 0;
        const over = row.delta > 0;
        return (
          <div key={row.label} className="grid grid-cols-[40px_1fr_42px] items-center gap-2.5">
            <span className="truncate font-fw-sans text-caption text-text-tertiary">{row.label}</span>
            <span className="relative h-[9px] rounded-full bg-surface-sunken">
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -bottom-0.5 left-1/2 w-[2px] bg-warm-400"
              />
              {row.delta !== 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-0 rounded-full',
                    over ? 'left-1/2 bg-fw-warning' : 'right-1/2 bg-accent-500',
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
