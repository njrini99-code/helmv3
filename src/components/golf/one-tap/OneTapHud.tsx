'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapState } from '@/lib/golf/one-tap/one-tap-controller';
import type { OneTapRoundView } from './use-one-tap-round';
import type { OneTapView } from './use-one-tap';

/** Floating status over the course: state, GPS quality and strokes as chips
 * in the top-right corner, a banner when a hole closed by the next-tee
 * fallback, and Recenter while the player holds the camera. It is
 * pointer-transparent and keeps the course itself clear: the distance readout
 * lives in the footer (`OneTapReadout`) so it never covers a mark. */
export const ONE_TAP_STATE_LABELS: Readonly<Record<OneTapState, string>> = Object.freeze({
  HOLE_READY: 'Ready', CAPTURE_PENDING: 'Marking…', ANCHOR_SAVED: 'Marked', LOW_CONFIDENCE: 'Marked · low confidence', OUTSIDE_MODELED_AREA: 'Marked · outside mapped area',
  GPS_UNAVAILABLE: 'No GPS fix', SYNC_QUEUED: 'Saved on phone', MANUAL_CAMERA: 'Your view', ROUND_PAUSED: 'Paused',
});
const chip = 'inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-caption font-semibold text-text-primary shadow-card';

export function OneTapHud({ view, round }: { view: OneTapView; round?: OneTapRoundView | null }) {
  const { snapshot, latestFix, cameraMode } = view;
  const tone = snapshot.state === 'GPS_UNAVAILABLE' || snapshot.state === 'OUTSIDE_MODELED_AREA' ? 'warning' : snapshot.state === 'LOW_CONFIDENCE' ? 'caution' : 'neutral';
  const strokesLabel = round ? round.status === 'COMPLETE' ? `Holed · ${round.strokes}` : `${round.strokes} ${round.strokes === 1 ? 'stroke' : 'strokes'}` : null;
  return <div className="pointer-events-none absolute inset-0 font-fw-sans" data-slot="one-tap-hud">
    <div className="absolute right-3 flex flex-col items-end gap-1.5" style={{ top: 'max(12px, env(safe-area-inset-top))' }} role="status" aria-live="polite" data-hud-reserve>
      <span className={chip} data-slot="one-tap-status" data-tone={tone}>
        {ONE_TAP_STATE_LABELS[snapshot.state]}
        {snapshot.syncPending > 0 && <span className="font-normal text-text-secondary">{' '}· {snapshot.syncPending} to sync</span>}
      </span>
      <span className={`${chip} font-normal text-text-secondary`} data-slot="one-tap-gps">
        {latestFix ? `GPS ±${Math.max(1, Math.round(latestFix.horizontalAccuracyM))} m` : 'No GPS'}
      </span>
      {round && strokesLabel && <span className={chip} data-slot="one-tap-strokes" data-hole-status={round.status}>{strokesLabel}</span>}
    </div>
    {round?.inferredFrom && <div className="pointer-events-auto absolute inset-x-3 flex items-center justify-between gap-2 rounded-control border border-border-subtle bg-surface px-3 py-2 shadow-card"
      style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 96px)' }} data-slot="one-tap-inferred" role="status">
      <span className="text-caption text-text-primary">Hole {round.inferredFrom.ordinal} closed at the next tee (no cup mark).</span>
      <Button variant="ghost" size="sm" onClick={round.takeBackInferred} data-slot="one-tap-inferred-back">Back</Button>
    </div>}
    {cameraMode === 'MANUAL' && <div className="absolute bottom-3 right-3">
      <Button variant="secondary" size="sm" className="pointer-events-auto shadow-card" onClick={view.recenterCamera} data-slot="one-tap-recenter">Recenter</Button>
    </div>}
  </div>;
}
