'use client';

/**
 * ============================================================================
 * RampMatrix — the band-shaded metric grid (mockup §.matrix/.mcell/.legend)
 * ----------------------------------------------------------------------------
 * A small table: a row-header column (mono) plus one shaded `mcell` per
 * column. Band 0 (no data) reads as a flat sunken cell; bands 1–4 step
 * through the accent ramp, darkest = strongest. `RAMP_CLASSES` is exported
 * so `RankCell` (which derives its band from `rampBandForRank`) can reuse
 * the exact same band→class mapping — ONE place owns the ramp.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { RampMatrixProps } from './types';

/** Ramp band → Tailwind class map. 0 = no data (sunken) … 4 = strongest. */
export const RAMP_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-surface-sunken text-text-tertiary',
  1: 'bg-accent-100 text-accent-900',
  2: 'bg-accent-300 text-accent-900',
  3: 'bg-accent-500 text-text-on-accent',
  4: 'bg-accent-700 text-text-on-accent',
};

export function RampMatrix({ cols, rows, legend }: RampMatrixProps) {
  return (
    <div data-slot="ramp-matrix">
      <table className="w-full border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th scope="col" aria-hidden="true" className="p-0" />
            {cols.map((col) => (
              <th
                key={col}
                scope="col"
                className="px-1.5 py-1 font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="whitespace-nowrap pr-2 text-right font-fw-mono text-caption font-normal text-text-secondary"
              >
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td
                  key={cols[i] ?? i}
                  className={cn(
                    'min-w-[60px] rounded-fw-sm px-1 py-1.5 text-center font-fw-mono text-caption font-normal',
                    RAMP_CLASSES[cell.band],
                  )}
                >
                  {cell.value}
                  {cell.n ? (
                    <span className="block font-fw-sans text-microbadge normal-case tracking-normal opacity-75">
                      {cell.n}
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {legend && legend.length > 0 ? (
        <div className="mt-2 flex gap-3 font-fw-sans text-eyebrow normal-case tracking-normal text-text-tertiary">
          {legend.map((item) => (
            <span key={item.band} className="inline-flex items-center gap-1">
              <i
                aria-hidden="true"
                className={cn(
                  'inline-block h-2 w-2 rounded-fw-sm',
                  RAMP_CLASSES[item.band].split(' ')[0],
                )}
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
