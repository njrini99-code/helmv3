'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapState } from '@/lib/golf/one-tap/one-tap-controller';
import type { OneTapView } from './use-one-tap';

/** Floating status over the course: state and GPS quality as chips in the
 * top-right corner, plus Recenter while the player holds the camera. It is
 * pointer-transparent and keeps the course itself clear: the distance readout
 * lives in the footer (`OneTapReadout`) so it never covers a mark. */
export const ONE_TAP_STATE_LABELS: Readonly<Record<OneTapState, string>> = Object.freeze({
  HOLE_READY: 'Ready', CAPTURE_PENDING: 'Marking…', ANCHOR_SAVED: 'Marked', LOW_CONFIDENCE: 'Marked · low confidence', OUTSIDE_MODELED_AREA: 'Marked · outside mapped area',
  GPS_UNAVAILABLE: 'No GPS fix', SYNC_QUEUED: 'Saved on phone', MANUAL_CAMERA: 'Your view', ROUND_PAUSED: 'Paused',
});
const chip = 'inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-caption font-semibold text-text-primary shadow-card';

export function OneTapHud({ view }: { view: OneTapView }) {
  const { snapshot, latestFix, cameraMode } = view;
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
    {cameraMode === 'MANUAL' && <div className="absolute bottom-3 right-3">
      <Button variant="secondary" size="sm" className="pointer-events-auto shadow-card" onClick={view.recenterCamera} data-slot="one-tap-recenter">Recenter</Button>
    </div>}
  </div>;
}
