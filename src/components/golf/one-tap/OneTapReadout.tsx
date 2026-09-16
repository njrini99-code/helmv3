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

const feet = (metres: number) => Math.round(metres * 3.28084);
export function OneTapReadout({ view }: { view: OneTapView }) {
  const { readout, distancesBasis, lie, policy, advice } = view;
  const from = distancesBasis === 'live_fix' ? 'from where you stand' : 'from your last mark';
  // Task 16: elevation is the only advice V1 can offer, practice only; the
  // policy has already nulled it in competition, where the caption says so.
  const elevation = advice.elevationDeltaM != null && Math.abs(feet(advice.elevationDeltaM)) >= 1
    ? <span data-slot="one-tap-elevation" data-elevation-ft={feet(advice.elevationDeltaM)}> · {advice.elevationDeltaM > 0 ? '↑' : '↓'} {Math.abs(feet(advice.elevationDeltaM))} ft</span> : null;
  const competition = policy.mode === 'competition' ? <span data-slot="one-tap-competition"> · competition</span> : null;
  return <div className="flex items-end justify-between gap-3 pb-2" data-slot="one-tap-distances" data-basis={distancesBasis ?? ''} data-readout-mode={readout?.mode ?? ''} data-play-mode={policy.mode}>
    {readout?.mode === 'approach' ? <div className="min-w-0">
      <div className="flex items-baseline gap-3 font-fw-display tabular-nums">
        <Distance label="F" value={readout.frontM != null && readout.frontM > 0 ? yards(readout.frontM) : null} />
        <Distance label="C" value={yards(readout.centreM)} emphasis />
        <Distance label="B" value={readout.backM != null ? yards(readout.backM) : null} />
      </div>
      <p className="mt-0.5 text-caption text-text-secondary">yd to green · ±{Math.max(1, yards(readout.sigmaM))} yd · {from}{elevation}{competition}</p>
    </div> : readout ? <div className="min-w-0" data-slot="one-tap-on-green" data-centre-display={readout.centreDisplay}>
      {/* §15.2/§16: on the green the edges are not targets; the pin is unmarked and a short putt gets no fake number. */}
      <p className="font-fw-display text-body-lg font-semibold uppercase tracking-[0.08em]">On green</p>
      {readout.centreDisplay === 'exact'
        ? <p className="mt-0.5 text-caption text-text-secondary">Center {yards(readout.centreM)} yd · ±{Math.max(1, yards(readout.sigmaM))} yd · pin not marked</p>
        : <p className="mt-0.5 text-caption text-text-secondary">Short putt · position approximate · pin not marked</p>}
    </div> : <p className="text-caption text-text-secondary">{view.hasGreen ? 'Waiting for a GPS fix' : 'No mapped green on this hole'}</p>}
    {lie && <p className="shrink-0 text-right text-body-sm font-semibold" data-slot="one-tap-lie" data-lie-display={lie.display} data-lie-rule={lie.rule}>
      {lie.label}
    </p>}
  </div>;
}
