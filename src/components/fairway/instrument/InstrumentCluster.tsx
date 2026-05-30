/**
 * ============================================================================
 * Fairway · instrument · InstrumentCluster — the cockpit layout primitive
 * ----------------------------------------------------------------------------
 * The organized backbone every instrument surface mounts into. NOT a dashboard
 * of equal cards — a clearly-ranked, asymmetric cockpit composition:
 *
 *   ┌───────────────────────────┬───────────────┐
 *   │                           │  SECONDARY    │   primary = the ONE dominant
 *   │        PRIMARY            ├───────────────┤   instrument (focal, large).
 *   │   (focal, large)          │  SECONDARY    │   secondary[] = flanking
 *   │                           │               │   readout panels (stacked rail).
 *   ├───────────────────────────┴───────────────┤
 *   │  TERTIARY · TERTIARY · TERTIARY · TERTIARY │   tertiary[] = a row of micro-
 *   └────────────────────────────────────────────┘   readouts along the foot.
 *
 * Ranking is the whole point: the primary spans the dominant column, the
 * secondary panels stack in a flanking rail, the tertiary micro-readouts run as
 * an even foot row. Generous but purposeful negative space (gap-5/6).
 *
 * Responsive: on narrow viewports the rail drops BELOW the primary and the
 * tertiary row reflows from 4-up → 2-up → 1-up, so the hierarchy degrades
 * gracefully (primary always first, never cramped).
 *
 * Pure presentation, no client hooks → safe in a server component. ADDITIVE
 * ONLY. Renders inside a `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** How wide the focal primary column is relative to the flanking rail. */
export type ClusterBalance = 'focal' | 'even';

const BALANCE_GRID: Record<ClusterBalance, string> = {
  // the primary dominates (≈ 2fr : 1fr) — the default cockpit ranking
  focal: 'lg:grid-cols-[2fr_minmax(15rem,1fr)]',
  // a calmer split (≈ 3fr : 2fr) for two near-peer instruments
  even: 'lg:grid-cols-[3fr_2fr]',
};

/** Tertiary foot-row density (how many micro-readouts sit across at desktop). */
export type ClusterTertiaryColumns = 2 | 3 | 4;

const TERTIARY_COLS: Record<ClusterTertiaryColumns, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export interface InstrumentClusterProps extends HTMLAttributes<HTMLDivElement> {
  /** The ONE dominant instrument in the focal position (required). */
  primary: ReactNode;
  /** Flanking secondary readout panels — stacked in the side rail. */
  secondary?: ReactNode[];
  /** A foot row of tertiary micro-readouts. */
  tertiary?: ReactNode[];
  /** Focal column weight. Default `focal` (the primary dominates). */
  balance?: ClusterBalance;
  /** Tertiary foot-row column count at desktop. Default `4`. */
  tertiaryColumns?: ClusterTertiaryColumns;
  /**
   * Optional accessible label for the whole cluster (rendered as a labelled
   * `section` region). Omit to keep it a plain grouping `div`.
   */
  ariaLabel?: string;
}

/**
 * The asymmetric cockpit grid. Mount one focal `primary` instrument, an
 * optional `secondary` rail, and an optional `tertiary` micro-readout row.
 * Stacks gracefully on narrow screens (primary first, rail below, tertiary
 * reflowing 4→2→1).
 */
export const InstrumentCluster = forwardRef<HTMLDivElement, InstrumentClusterProps>(
  function InstrumentCluster(
    {
      primary,
      secondary,
      tertiary,
      balance = 'focal',
      tertiaryColumns = 4,
      ariaLabel,
      className,
      ...props
    },
    ref,
  ) {
    const hasRail = Array.isArray(secondary) && secondary.length > 0;
    const hasTertiary = Array.isArray(tertiary) && tertiary.length > 0;

    return (
      <div
        ref={ref}
        data-slot="instrument-cluster"
        // a labelled landmark region when named, else a plain grouping
        {...(ariaLabel ? { role: 'group', 'aria-label': ariaLabel } : {})}
        className={cn('flex flex-col gap-5 sm:gap-6', className)}
        {...props}
      >
        {/* ── Primary + flanking rail ───────────────────────────────────── */}
        <div
          data-slot="cluster-deck"
          className={cn(
            'grid grid-cols-1 gap-5 sm:gap-6',
            hasRail && BALANCE_GRID[balance],
          )}
        >
          {/* The ONE dominant instrument — always first in DOM + stacking. */}
          <div data-slot="cluster-primary" className="min-w-0">
            {primary}
          </div>

          {/* Flanking secondary rail — stacks below the primary on narrow. */}
          {hasRail ? (
            <div
              data-slot="cluster-secondary"
              className="flex min-w-0 flex-col gap-5 sm:gap-6"
            >
              {secondary.map((node, i) => (
                <div key={i} className="min-w-0">
                  {node}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Tertiary micro-readout foot row ───────────────────────────── */}
        {hasTertiary ? (
          <div
            data-slot="cluster-tertiary"
            className={cn(
              'grid grid-cols-1 gap-4',
              TERTIARY_COLS[tertiaryColumns],
            )}
          >
            {tertiary.map((node, i) => (
              <div key={i} className="min-w-0">
                {node}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
