'use client';

/**
 * DistanceLadder: approach strokes gained by distance band (DD-01).
 *
 * One row per band: the yardage, a centered bar (loss left, gain right), the
 * shot-level strokes gained per approach shot, and the shot count. Approach
 * shots only: tee shots and putts are left out, and the caption says so.
 *
 * A dead zone is marked in words ("Dead zone") on its row, not with a red
 * fill across the row, so the ladder reads as one ledger rather than a
 * warning banner.
 */

import { formatMetricText } from '@/lib/golf/metrics/display-registry';

export interface DistanceLadderBand {
  rangeStart: number;
  rangeEnd: number;
  avgSG: number;
  shotCount: number;
}

export interface DistanceLadderProps {
  bands: DistanceLadderBand[];
  deadZones?: Array<{ rangeStart: number; rangeEnd: number }>;
  /** The read window in words, e.g. "last 90 days". */
  windowLabel: string;
}

export function DistanceLadder({ bands, deadZones, windowLabel }: DistanceLadderProps) {
  const maxAbs = Math.max(...bands.map((b) => Math.abs(Number(b.avgSG ?? 0))), 0.1);
  const isDead = (b: DistanceLadderBand) =>
    deadZones?.some((dz) => dz.rangeStart === b.rangeStart && dz.rangeEnd === b.rangeEnd) ?? false;

  return (
    <section className="space-y-2" aria-labelledby="distance-ladder-title" data-slot="distance-ladder">
      <h3 id="distance-ladder-title" className="text-body-sm font-medium text-text-primary">
        Approach by distance
      </h3>
      <p className="text-caption text-text-secondary">
        Strokes gained per approach shot, {windowLabel}. Tee shots and putts are left out.
      </p>
      <ul className="divide-y divide-border-subtle">
        {bands.map((band) => {
          const sg = Number(band.avgSG ?? 0);
          const gain = sg >= 0;
          const width = (Math.abs(sg) / maxAbs) * 50;
          const dead = isDead(band);
          return (
            <li key={`${band.rangeStart}-${band.rangeEnd}`} className="flex items-center gap-2 py-2">
              <span className="w-24 shrink-0 text-caption tabular-nums text-text-secondary">
                {band.rangeStart}–{band.rangeEnd} yd
                {dead ? <span className="block font-medium text-fw-danger-ink">Dead zone</span> : null}
              </span>
              <div className="flex h-4 flex-1 items-center" aria-hidden="true">
                <div className="flex w-1/2 justify-end">
                  {!gain ? <div className="h-2.5 rounded-l-sm bg-fw-danger" style={{ width: `${width}%` }} /> : null}
                </div>
                <div className="h-4 w-px shrink-0 bg-border-strong" />
                <div className="w-1/2">
                  {gain ? <div className="h-2.5 rounded-r-sm bg-accent-fill" style={{ width: `${width}%` }} /> : null}
                </div>
              </div>
              <span
                className={
                  'w-14 shrink-0 text-right text-caption font-medium tabular-nums ' +
                  (gain ? 'text-fw-success-ink' : 'text-fw-danger-ink')
                }
              >
                {formatMetricText('sg_approach', sg)}
              </span>
              <span className="w-16 shrink-0 text-right text-caption tabular-nums text-text-tertiary">
                {band.shotCount} {band.shotCount === 1 ? 'shot' : 'shots'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
