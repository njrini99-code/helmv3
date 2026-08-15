'use client';

/**
 * ChartTooltip — the canonical hover tooltip for every data-viz panel
 * (Wave W5A — ultra-audit MASTER synthesis A4 / A2: one tooltip treatment,
 * not the dozen hand-rolled Recharts `content={…}` tooltip cards that each
 * re-invented their own surface, swatch, and number formatting).
 *
 * Surface (look-preserving with the prominent glass chrome used by nav +
 * modals): a translucent `bg-glass-prominent` panel with a `backdrop-blur-md`,
 * a 10px `rounded-md` radius, and the `md` elevation shadow so it floats
 * cleanly above the plot.
 *
 * Each row is `swatch + name + value`: a small rounded color swatch (the
 * series color), the series name, and the right-aligned value run through the
 * `formatter` number formatter. An optional `label` (typically the x-axis
 * category — a date, a hole number, a club) sits at the top.
 *
 * This is a presentational primitive: it accepts an already-resolved list of
 * rows, so it is decoupled from any specific charting library. A thin
 * `RechartsTooltipAdapter` shape can map a Recharts `TooltipProps` payload
 * onto `rows` at the call site without this primitive depending on Recharts.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ChartTooltipRow {
  /** Series display name. */
  name: React.ReactNode;
  /** Raw numeric (or pre-formatted) value for this series. */
  value: number | string;
  /** Series swatch color — a CSS color string (token var or hex). */
  color?: string;
  /** Optional per-row unit/suffix appended after the formatted value. */
  suffix?: string;
}

export interface ChartTooltipProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Optional heading (x-axis category: date, hole, club…). */
  label?: React.ReactNode;
  /** The series rows to render, top to bottom. */
  rows: ChartTooltipRow[];
  /**
   * Number formatter applied to each numeric row value. Defaults to a
   * locale-aware integer/decimal formatter. String values pass through
   * untouched so pre-formatted callers keep their formatting.
   */
  formatter?: (value: number) => string;
}

const defaultFormatter = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US') : String(value);

export function ChartTooltip({
  label,
  rows,
  formatter = defaultFormatter,
  className,
  ...props
}: ChartTooltipProps) {
  if (!rows || rows.length === 0) return null;

  return (
    <div
      role="tooltip"
      className={cn(
        // Prominent glass surface — blurred, rounded, elevated; floats above
        // the plot the same way nav/modal chrome does.
        'bg-glass-prominent backdrop-blur-md rounded-md shadow-md',
        'border border-[color:var(--color-border-subtle)]',
        'px-3 py-2 min-w-[8rem] max-w-[16rem] pointer-events-none',
        className,
      )}
      {...props}
    >
      {label != null && label !== '' && (
        <p className="mb-1.5 text-caption font-medium text-warm-500">{label}</p>
      )}
      <ul className="space-y-1">
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 text-body-sm"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {row.color && (
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: row.color }}
                />
              )}
              <span className="truncate text-warm-600">{row.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-warm-900">
              {typeof row.value === 'number' ? formatter(row.value) : row.value}
              {row.suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

ChartTooltip.displayName = 'ChartTooltip';
