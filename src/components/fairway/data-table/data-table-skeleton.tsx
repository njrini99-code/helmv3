/**
 * ============================================================================
 * Fairway DataTable — loading skeleton (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * Shape-matched skeleton rows that reserve the final table layout so the real
 * rows swap in with no layout shift (CLS budget, §7.5). Per §7.3 the loading
 * state is ALWAYS a skeleton, never a spinner. Shimmer is pure CSS and honors
 * prefers-reduced-motion (the `motion-reduce:animate-none` utility).
 *
 * Rendered inside the table body by <DataTable> when `loading` is true; can
 * also be used standalone.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { densityMetrics } from './density';
import type { DataTableDensity } from './types';

export interface DataTableSkeletonProps {
  /** Number of body columns to mimic. */
  columns: number;
  /** Number of skeleton rows. Default 6. */
  rows?: number;
  density?: DataTableDensity;
  /** Whether a leading selection column is present (renders a checkbox block). */
  selectable?: boolean;
  /** Whether a trailing actions column is present. */
  hasActions?: boolean;
  className?: string;
}

/** A single warm shimmer block. */
function Bar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block h-3.5 rounded-fw-sm',
        'bg-surface-sunken',
        // Warm sheen sweep; collapses under reduced motion.
        'relative overflow-hidden',
        'after:absolute after:inset-0 after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-canvas/70 after:to-transparent',
        'motion-reduce:after:animate-none',
        className,
      )}
    />
  );
}

/**
 * Renders <tr> skeleton rows. Must be placed inside a <tbody>.
 * Widths vary per column to read like real content, not a uniform grid.
 */
export function DataTableSkeleton({
  columns,
  rows = 6,
  density = 'comfortable',
  selectable = false,
  hasActions = false,
  className,
}: DataTableSkeletonProps) {
  const m = densityMetrics(density);
  // Deterministic pseudo-random widths so SSR + client match (no hydration drift).
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5', 'w-3/5'];

  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className={cn('border-b border-border-subtle/60', className)}>
          {selectable && (
            <td className={cn(m.cell, 'px-4 align-middle')}>
              <span
                aria-hidden="true"
                className="block size-[18px] rounded-sm bg-surface-sunken"
              />
            </td>
          )}
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className={cn(m.cell, m.cellX, 'align-middle')}>
              <Bar className={widths[(r + c) % widths.length]} />
            </td>
          ))}
          {hasActions && (
            <td className={cn(m.cell, 'px-3 align-middle')}>
              <span
                aria-hidden="true"
                className="ml-auto block size-7 rounded-fw-sm bg-surface-sunken"
              />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
