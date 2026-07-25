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
 * Responsive: on narrow viewports the rail drops BELOW the primary. The
 * tertiary foot row NEVER degrades to 1-up — it stays 2-up inside one grouped
 * ledger (see TERTIARY_PHONE_GROUP). It used to reflow 4→2→1, which turned
 * each micro-readout into a full-width monolith card on a phone: the exact
 * shape Mobile Doctrine rule 11 bans.
 *
 * Pure presentation, no client hooks → safe in a server component. ADDITIVE
 * ONLY. Renders inside a `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StatStrip } from '@/components/fairway/charts/StatStrip';

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

/**
 * PHONE TIER for the tertiary foot row — one grouped ledger, not N cards.
 *
 * WHAT WAS WRONG. This row used to be `grid grid-cols-1 … sm:grid-cols-N`, so
 * below 640px every micro-readout became a FULL-WIDTH panel: a 40px numeral
 * marooned in a 24px-padded bordered card, four of them stacked down a 390px
 * screen. That is precisely the pattern Mobile Doctrine rule 11 bans ("No
 * full-screen monolith cards — every page is composed"), and it hit all six
 * `tertiary` call sites at once because the shape lived here.
 *
 * WHAT IT IS NOW. The container shape comes from `StatStrip` — the repo's ONE
 * phone-shape rule for KPI strips (2-up; "2 + 1-wide" at three; a snap-rail at
 * five or more). On top of that, the phone tier draws ONE hairline-bordered
 * group and switches the cells' own chrome OFF, so the row reads as a single
 * composed ledger instead of a column of floating cards.
 *
 * `max-sm:` ONLY. Every override below is scoped under the `sm` breakpoint, so
 * desktop renders byte-for-byte what it did before — no `sm:` restore to keep
 * in sync, and no risk of this leaking into the cockpit composition.
 *
 * `!` is load-bearing: `InstrumentPanel`'s surface + hairline come from a CSS
 * module (`.panel`, a single-class selector), which ties with a plain Tailwind
 * utility on specificity and would win or lose on stylesheet order. Important
 * makes the outcome deterministic rather than build-order-dependent.
 */
const TERTIARY_PHONE_GROUP = [
  // The group's own chrome — ONE inset section, the composed alternative to
  // N separate cards. StatStrip's own gap-x-5/gap-y-6 does the separating; no
  // hand-drawn hairlines, deliberately. At three cells StatStrip spans the
  // trailing cell across both columns, and nth-child dividers would then draw
  // a rule down the middle of a full-width row.
  'max-sm:rounded-card max-sm:border max-sm:border-border-subtle',
  'max-sm:bg-surface max-sm:p-4',
  // Cells stop being cards: no surface, no rim, no shadow, no radius, no pad.
  'max-sm:[&_[data-slot=instrument-panel]]:!border-0',
  'max-sm:[&_[data-slot=instrument-panel]]:!bg-transparent',
  'max-sm:[&_[data-slot=instrument-panel]]:!shadow-none',
  'max-sm:[&_[data-slot=instrument-panel]]:!rounded-none',
  'max-sm:[&_[data-slot=instrument-panel]]:!p-0',
  // VALUE FIRST, label under it. A tertiary label is free-form ("Players",
  // "With recent rounds") and at 136px the long ones wrap — which, with the
  // cockpit's label-above-value order, drops that cell's numeral a line below
  // its neighbour's and leaves the row visibly ragged. Ordering the label last
  // makes wrapping harmless: every numeral in a row starts at the same y, and
  // the caption hangs beneath. This is also just the better KPI reading —
  // figure first, name second.
  //
  // `order-last` on the label only (not flex-col-reverse on the container):
  // reversing would hoist a Readout's delta line ABOVE its own value.
  'max-sm:[&_[data-slot=readout-label]]:!order-last',
  'max-sm:[&_[data-slot=readout-label]]:!tracking-[0.05em]',
  // A cockpit hero numeral (40px) is not a foot-row numeral. Stepping it to
  // 30px is what lets four stats sit in ~190px instead of ~290px — the
  // difference between a glanceable block and half a phone screen.
  // `>*:first-child` = the figure itself. Not `>*` — that would also catch
  // the unit suffix ("%", "PPR"), which is deliberately a smaller step.
  'max-sm:[&_[data-slot=readout-value]>*:first-child]:!text-[30px]',
  'max-sm:[&_[data-slot=readout-value]>*:first-child]:!leading-[34px]',
  // StatStrip's gap-y-6 is calibrated for a 40px numeral; at 30px it leaves a
  // visible trough between the two rows.
  'max-sm:!gap-y-4',
].join(' ');

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
 * staying 2-up in one grouped ledger).
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

        {/* ── Tertiary micro-readout foot row ─────────────────────────────
              Shape delegated to StatStrip so this row obeys the same phone
              rule as every other KPI strip in the app, instead of the
              hand-rolled grid that stacked it one-per-screen. */}
        {hasTertiary ? (
          <StatStrip
            count={tertiary.length}
            columns={tertiaryColumns}
            // Never a snap-rail here: a cockpit's foot row is a summary the
            // coach reads at a glance, and swiping to reach the 4th stat
            // would hide it. Threshold above the max tertiary count keeps
            // every case on the grid branch.
            railThreshold={99}
            className={TERTIARY_PHONE_GROUP}
          >
            {tertiary.map((node, i) => (
              <div key={i} className="min-w-0">
                {node}
              </div>
            ))}
          </StatStrip>
        ) : null}
      </div>
    );
  },
);
