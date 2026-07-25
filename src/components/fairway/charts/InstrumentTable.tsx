'use client';

/**
 * ============================================================================
 * InstrumentTable — the "view as table" a11y readout for hero chart instruments
 * ----------------------------------------------------------------------------
 * The four cockpit instruments (RadialGauge / Ribbon / Dial / SegmentBar) mount
 * into the signature `instrument` InstrumentPanel (a frosted-glass bezel that
 * does NOT itself provide a tabular fallback). This tiny helper adds the
 * mandated "view as table" path for the data-bearing instruments: a toggle
 * button (top-right of the bezel) and the matte numeric table, rendered on a
 * SOLID inner fill (never glass-on-glass) so dense data stays WCAG-legible.
 *
 * It reuses ChartFrame's ChartTableData shape so the table contract is shared
 * across every Fairway chart. Headless-ish: the host owns the toggle state and
 * passes `show` + `onToggle`; this renders the button OR the table accordingly.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from './theme';
import type { ChartTableData } from './ChartFrame';

export interface InstrumentTableToggleProps {
  show: boolean;
  onToggle: () => void;
}

/**
 * The small warm toggle button — mount in the panel's `readout` bezel slot. Owns
 * its full hover / focus-visible / active contract with a visible green focus
 * ring (raw <button> by design — a self-contained Fairway DS primitive).
 */
export function InstrumentTableToggle({ show, onToggle }: InstrumentTableToggleProps) {
  return (
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={show}
      data-slot="instrument-view-toggle"
      className={cn(
        'inline-flex h-7 min-w-[24px] items-center gap-1.5 rounded-fw-sm px-2.5',
        // 28px visual chip, 44px tap target via invisible hit-slop (audit M10).
        "relative before:absolute before:-inset-2 before:content-['']",
        'font-fw-sans text-caption font-medium text-text-secondary',
        'transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'hover:bg-surface hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'active:translate-y-[0.5px]',
        show && 'bg-surface text-text-primary',
      )}
    >
      {show ? 'View instrument' : 'View as table'}
    </button>
  );
}

/**
 * The matte numeric readout table on a SOLID fill (legible inside the glass
 * panel). Numeric columns are right-aligned + tabular mono.
 */
export function InstrumentTable({ data }: { data: ChartTableData }) {
  return (
    <div className="overflow-auto rounded-fw-md border border-border-subtle bg-surface">
      <table className="w-full border-collapse font-fw-sans text-body-sm">
        {data.caption ? <caption className="sr-only">{data.caption}</caption> : null}
        <thead>
          <tr className="border-b border-border-strong bg-surface-tint">
            {data.columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-3 py-2 font-semibold text-text-secondary',
                  col.numeric ? 'text-right' : 'text-left',
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border-subtle last:border-0">
              {data.columns.map((col) => (
                <td
                  key={col.key}
                  style={col.numeric ? TABULAR_NUMS : undefined}
                  className={cn(
                    'px-3 py-2 text-text-primary',
                    col.numeric ? 'text-right' : 'text-left',
                    col.numeric && 'font-fw-mono',
                  )}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
