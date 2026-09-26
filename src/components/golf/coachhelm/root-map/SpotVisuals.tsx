/**
 * Small visuals for a measured spot, shared by the chain, the Why view and
 * the coach drill's "See why" sheet:
 *   - `LieSplitBars`: an approach band's strokes split by lie, one bar per
 *     lie scaled to the largest, loss and gain in their own colour;
 *   - `PathCrumbs`: the gated length → par → shape path as steps, the
 *     narrowest last and emphasised.
 */

import { formatStrokes } from '@/lib/coachhelm/root-map/build-root-map';

const NEG = 'var(--fw-viz-div-neg)';
const POS = 'var(--fw-viz-div-pos)';

export interface LieSplitRow {
  label: string;
  /** Strokes gained per round on this lie (negative = lost). */
  sg: number;
  /** Shots; null for the folded "thinner lies" row. */
  n: number | null;
}

export function LieSplitBars({ rows }: { rows: LieSplitRow[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(0.01, ...rows.map((r) => Math.abs(r.sg)));
  return (
    <ul aria-label="Strokes by lie" className="flex flex-col gap-1.5" data-slot="lie-split">
      {rows.map((r) => {
        const lost = r.sg < 0;
        const w = Math.max(2, Math.min(100, (Math.abs(r.sg) / max) * 100));
        return (
          <li key={r.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-caption">
            <span className="truncate text-text-secondary">{r.label}</span>
            <span aria-hidden className="relative block h-3 rounded-sm bg-surface-sunken">
              <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${w}%`, background: lost ? NEG : POS }} />
            </span>
            <span className="text-right">
              <span className="font-fw-mono tabular-nums text-text-primary">{formatStrokes(r.sg)}</span>
              <span className="pl-1 text-text-tertiary">
                {lost ? 'lost' : 'gained'}
                {r.n !== null ? ` · ${r.n} shots` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Split a `contextPathText` string back into its steps. */
export function pathSteps(path: string): string[] {
  return path
    .split(' → ')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PathCrumbs({ steps, label = 'Where it concentrates' }: { steps: readonly string[]; label?: string }) {
  if (steps.length === 0) return null;
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5" data-slot="path-crumbs">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={`${i}-${s}`} className="flex items-center gap-1.5">
            {i > 0 ? (
              <span aria-hidden className="text-text-tertiary">
                ›
              </span>
            ) : null}
            <span
              className={
                last
                  ? 'rounded-full border border-text-primary px-2.5 py-0.5 text-body-sm font-medium text-text-primary'
                  : 'rounded-full border border-border-subtle px-2.5 py-0.5 text-body-sm text-text-secondary'
              }
            >
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
