'use client';

import { Button } from '@/components/fairway/controls/button';
import { metresToYards } from '@/lib/golf/one-tap/hole-distances';
import type { OneTapState } from '@/lib/golf/one-tap/one-tap-controller';
import type { OneTapView } from './use-one-tap';

/** Floating readout over the course: state, GPS quality, green distances
 * with their honest ±, and the lie of the last mark. Everything is
 * pointer-transparent except the one control (Recenter) it can own. */
export const ONE_TAP_STATE_LABELS: Readonly<Record<OneTapState, string>> = Object.freeze({
  HOLE_READY: 'Ready', CAPTURE_PENDING: 'Marking…', ANCHOR_SAVED: 'Marked', LOW_CONFIDENCE: 'Marked · low confidence', OUTSIDE_MODELED_AREA: 'Marked · outside mapped area',
  GPS_UNAVAILABLE: 'No GPS fix', SYNC_QUEUED: 'Saved on phone', MANUAL_CAMERA: 'Your view', ROUND_PAUSED: 'Paused',
});
const yards = (metres: number) => Math.round(metresToYards(metres));
const chip = 'inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-caption font-semibold text-text-primary shadow-card';

function Distance({ label, value, emphasis = false }: { label: string; value: number | null; emphasis?: boolean }) {
  // A null value is a front edge already behind the player (on the green):
  // shown as a dash rather than a negative yardage.
  return <span className="flex items-baseline gap-1" data-distance={label}>
    <span className="text-caption font-semibold text-text-secondary">{label}</span>
    <span className={emphasis ? 'text-h3 font-semibold leading-none' : 'text-body-lg font-semibold leading-none'}>{value ?? '–'}</span>
  </span>;
}

export function OneTapHud({ view }: { view: OneTapView }) {
  const { snapshot, distances, distancesBasis, lie, latestFix, cameraMode } = view;
  const tone = snapshot.state === 'GPS_UNAVAILABLE' || snapshot.state === 'OUTSIDE_MODELED_AREA' ? 'warning' : snapshot.state === 'LOW_CONFIDENCE' ? 'caution' : 'neutral';
  return <div className="pointer-events-none absolute inset-0 font-fw-sans" data-slot="one-tap-hud">
    <div className="absolute right-3 flex flex-col items-end gap-1.5" style={{ top: 'max(12px, env(safe-area-inset-top))' }} role="status" aria-live="polite">
      <span className={chip} data-slot="one-tap-status" data-tone={tone}>
        {ONE_TAP_STATE_LABELS[snapshot.state]}
        {snapshot.syncPending > 0 && <span className="font-normal text-text-secondary">{' '}· {snapshot.syncPending} to sync</span>}
      </span>
      <span className={`${chip} font-normal text-text-secondary`} data-slot="one-tap-gps">
        {latestFix ? `GPS ±${Math.max(1, Math.round(latestFix.horizontalAccuracyM))} m` : 'No GPS'}
      </span>
    </div>
    <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
      <div className="rounded-control border border-border-subtle bg-surface px-3 py-2 shadow-card" data-slot="one-tap-distances" data-basis={distancesBasis ?? ''}>
        {distances ? <>
          <div className="flex items-baseline gap-3 font-fw-display tabular-nums">
            <Distance label="F" value={distances.frontM > 0 ? yards(distances.frontM) : null} />
            <Distance label="C" value={yards(distances.centreM)} emphasis />
            <Distance label="B" value={yards(distances.backM)} />
          </div>
          <p className="mt-0.5 text-caption text-text-secondary">yd to green · ±{Math.max(1, yards(distances.sigmaM))} yd · {distancesBasis === 'live_fix' ? 'from where you stand' : 'from your last mark'}</p>
        </> : <p className="text-caption text-text-secondary">{view.hasGreen ? 'Waiting for a GPS fix' : 'No mapped green on this hole'}</p>}
        {lie && <p className="mt-1 text-body-sm font-semibold" data-slot="one-tap-lie" data-lie-display={lie.display}>
          {lie.label}{lie.display === 'cue' ? ' · likely' : lie.secondaryLabel ? ` / ${lie.secondaryLabel}` : ''}
        </p>}
      </div>
      {cameraMode === 'MANUAL' && <Button variant="secondary" size="sm" className="pointer-events-auto shrink-0 shadow-card" onClick={view.recenterCamera} data-slot="one-tap-recenter">Recenter</Button>}
    </div>
  </div>;
}
