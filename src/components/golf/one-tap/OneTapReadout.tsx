'use client';

import { metresToYards } from '@/lib/golf/one-tap/hole-distances';
import type { OneTapView } from './use-one-tap';

/** Green distances with their honest ± and the lie of the last mark in its
 * presentation copy (§45–48: "Likely green", "Near tee edge", "Near water"). It sits
 * in the footer above MARK BALL, never over the course, so a mark at the
 * player's feet (the bottom of the tee framing) is never hidden by it. */
const yards = (metres: number) => Math.round(metresToYards(metres));

function Distance({ label, value, emphasis = false }: { label: string; value: number | null; emphasis?: boolean }) {
  // A null value is a front edge already behind the player (on the green):
  // shown as a dash rather than a negative yardage.
  return <span className="flex items-baseline gap-1" data-distance={label}>
    <span className="text-caption font-semibold text-text-secondary">{label}</span>
    <span className={emphasis ? 'text-h3 font-semibold leading-none' : 'text-body-lg font-semibold leading-none'}>{value ?? '–'}</span>
  </span>;
}

export function OneTapReadout({ view }: { view: OneTapView }) {
  const { distances, distancesBasis, lie } = view;
  return <div className="flex items-end justify-between gap-3 pb-2" data-slot="one-tap-distances" data-basis={distancesBasis ?? ''}>
    {distances ? <div className="min-w-0">
      <div className="flex items-baseline gap-3 font-fw-display tabular-nums">
        <Distance label="F" value={distances.frontM > 0 ? yards(distances.frontM) : null} />
        <Distance label="C" value={yards(distances.centreM)} emphasis />
        <Distance label="B" value={yards(distances.backM)} />
      </div>
      <p className="mt-0.5 text-caption text-text-secondary">yd to green · ±{Math.max(1, yards(distances.sigmaM))} yd · {distancesBasis === 'live_fix' ? 'from where you stand' : 'from your last mark'}</p>
    </div> : <p className="text-caption text-text-secondary">{view.hasGreen ? 'Waiting for a GPS fix' : 'No mapped green on this hole'}</p>}
    {lie && <p className="shrink-0 text-right text-body-sm font-semibold" data-slot="one-tap-lie" data-lie-display={lie.display} data-lie-rule={lie.rule}>
      {lie.label}
    </p>}
  </div>;
}
