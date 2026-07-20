'use client';

/**
 * ============================================================================
 * RailBars — labeled horizontal bar rows on a sunken rail (mockup §.bars/.bar)
 * ----------------------------------------------------------------------------
 * Small metric-vs-benchmark rows: a label, a sunken rail with a green fill
 * (dim variant for secondary rows) and an optional neutral benchmark tick,
 * then a right-aligned mono value. Used inside bento cells (e.g. the putting
 * distance-bucket breakdown) and drill panels.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { clampPct } from './logic';
import { TABULAR_NUMS } from '../charts/theme';
import type { RailBarsProps } from './types';

export function RailBars({ rows, labelWidth = 56 }: RailBarsProps) {
  return (
    <div data-slot="rail-bars" className="mt-0.5 grid gap-1.5">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid items-center gap-2.5"
          style={{ gridTemplateColumns: `${labelWidth}px 1fr 38px` }}
        >
          <span className="truncate font-fw-sans text-caption text-text-tertiary">{row.label}</span>
          <span className="relative h-[9px] rounded-full bg-surface-sunken">
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                row.dim ? 'bg-accent-300' : 'bg-accent-500',
              )}
              style={{ width: `${clampPct(row.pct)}%` }}
            />
            {row.tickPct != null ? (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-warm-400"
                style={{ left: `${clampPct(row.tickPct)}%` }}
              />
            ) : null}
          </span>
          <span
            style={TABULAR_NUMS}
            className="text-right font-fw-mono text-caption font-normal tabular-nums text-text-primary"
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
