'use client';

/**
 * ChartLegend + CHART_PALETTE — the canonical series legend and color
 * vocabulary for every data-viz panel (Wave W5A — ultra-audit MASTER
 * synthesis A4 / A2 / §5: one chart palette + one legend treatment, not the
 * dozens of inline `['var(--color-primary-600)', '#2563EB', '#8B5CF6', …]`
 * color arrays and hand-rolled legend rows scattered across admin + coachhelm
 * charts).
 *
 * CHART_PALETTE maps the five canonical data-viz roles onto the design
 * tokens (src/styles/tokens.css), so a series colored `you` is the EXACT same
 * brand green everywhere, `team` is the warm secondary, `pgaTour` is the grey
 * reference line, and so on:
 *
 *   you       — the focal player / primary series  → --color-primary-600
 *   team      — the team / secondary series         → --color-warm-600
 *   pgaTour   — PGA Tour reference baseline          → --color-pga-tour
 *   highlight — a called-out point / positive accent → --color-warning
 *   alert     — a regression / negative accent       → --color-destructive
 *
 * ChartLegend renders one swatch+label per series. It sits top-right on
 * desktop (inline, right-aligned) and pivots to a full-width row that wraps
 * along the bottom on mobile — matching the ChartShell header pivot.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Canonical data-viz palette. Values are CSS-var references so they track the
 * design tokens (and dark-mode / theme overrides) automatically. NEVER inline
 * a raw hex for one of these roles — reach for the role here.
 */
export const CHART_PALETTE = {
  /** Focal player / primary series — brand green. */
  you: 'var(--color-primary-600)',
  /** Team / secondary series — warm secondary. */
  team: 'var(--color-warm-600)',
  /** PGA Tour reference baseline — neutral grey. */
  pgaTour: 'var(--color-pga-tour)',
  /** Called-out point / positive accent — amber. */
  highlight: 'var(--color-warning)',
  /** Regression / negative accent — red. */
  alert: 'var(--color-destructive)',
} as const;

export type ChartPaletteRole = keyof typeof CHART_PALETTE;

export interface ChartLegendItem {
  /** Series label. */
  label: React.ReactNode;
  /**
   * Series color — either a canonical palette role (resolved via
   * CHART_PALETTE) or any raw CSS color string.
   */
  color: ChartPaletteRole | (string & {});
  /** Optional dashed swatch (for reference/baseline lines like PGA Tour). */
  dashed?: boolean;
}

/** Resolve a legend item color: palette role → token var, else pass through. */
function resolveColor(color: ChartLegendItem['color']): string {
  return (CHART_PALETTE as Record<string, string>)[color as string] ?? (color as string);
}

export interface ChartLegendProps
  extends Omit<React.HTMLAttributes<HTMLUListElement>, 'children'> {
  items: ChartLegendItem[];
}

export function ChartLegend({ items, className, ...props }: ChartLegendProps) {
  if (!items || items.length === 0) return null;

  return (
    <ul
      className={cn(
        // Mobile: full-width row, wraps along the bottom of the header pivot.
        // Desktop (sm+): inline, right-aligned cluster (top-right of the shell).
        'flex w-full flex-wrap items-center gap-x-4 gap-y-1.5',
        'sm:w-auto sm:flex-nowrap sm:justify-end',
        className,
      )}
      {...props}
    >
      {items.map((item, i) => {
        const color = resolveColor(item.color);
        return (
          <li key={i} className="flex items-center gap-1.5 text-body-sm text-warm-600">
            {item.dashed ? (
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 shrink-0 rounded-full"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 6px)`,
                }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="whitespace-nowrap">{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

ChartLegend.displayName = 'ChartLegend';
