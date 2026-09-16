'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapState } from '@/lib/golf/one-tap/one-tap-controller';
import { OneTapHoleComplete } from './OneTapHoleComplete';
import { OneTapStatusToast } from './OneTapStatusToast';
import type { OneTapRoundView } from './use-one-tap-round';
import type { OneTapView } from './use-one-tap';

/** Floating status over the course (master plan §11, §70). Healthy play
 * shows nothing in the corner: no Ready, no GPS ±3 m, no "N to sync", no
 * 0 shots. A chip appears only for something the golfer should know —
 * Offline · saved, Sync issue, Location weak, Locating…, Paused — plus the
 * shot count once there is one, the post-hole completion card (§19), and
 * Recenter while the player holds the camera. The transient "✓ Saved … Undo" status sits at the
 * bottom of the stage. Pointer-transparent; the readout lives in the footer. */
export const ONE_TAP_STATE_LABELS: Readonly<Record<OneTapState, string>> = Object.freeze({
  HOLE_READY: 'Ready', CAPTURE_PENDING: 'Marking…', ANCHOR_SAVED: 'Marked', LOW_CONFIDENCE: 'Marked · low confidence', OUTSIDE_MODELED_AREA: 'Marked · outside mapped area',
  GPS_UNAVAILABLE: 'No GPS fix', SYNC_QUEUED: 'Saved on phone', MANUAL_CAMERA: 'Your view', ROUND_PAUSED: 'Paused',
});
const chip = 'inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-caption font-semibold text-text-primary shadow-card';
const LOCATION_CHIP: Partial<Record<OneTapView['locationQuality'], string>> = { poor: 'Location weak', stale: 'Location weak', none: 'Locating…' };

export function OneTapHud({ view, round }: { view: OneTapView; round?: OneTapRoundView | null }) {
  const { snapshot, cameraMode, locationQuality, syncIssue } = view;
  const location = view.locationKind === 'none' ? 'No location' : LOCATION_CHIP[locationQuality] ?? null;
  const shots = round ? round.status === 'COMPLETE' ? `Holed · ${round.strokes} ${round.strokes === 1 ? 'shot' : 'shots'}` : round.strokes > 0 ? `${round.strokes} ${round.strokes === 1 ? 'shot' : 'shots'}` : null : null;
  return <div className="pointer-events-none absolute inset-0 font-fw-sans" data-slot="one-tap-hud">
    <div className="absolute right-3 flex flex-col items-end gap-1.5" style={{ top: 'max(12px, env(safe-area-inset-top))' }} role="status" aria-live="polite" data-hud-reserve>
      {syncIssue && <span className={chip} data-slot="one-tap-sync" data-tone="caution">{syncIssue === 'offline' ? 'Offline · saved' : 'Sync issue'}</span>}
      {location && <span className={`${chip} font-normal text-text-secondary`} data-slot="one-tap-location" data-quality={locationQuality}>{location}</span>}
      {snapshot.paused && <span className={chip} data-slot="one-tap-paused">Paused</span>}
      {round && shots && <span className={chip} data-slot="one-tap-shots" data-hole-status={round.status}>{shots}</span>}
    </div>
    {round && <OneTapHoleComplete round={round} />}
    <OneTapStatusToast view={view} />
    {cameraMode === 'MANUAL' && <div className="absolute bottom-3 right-3">
      <Button variant="secondary" size="sm" className="pointer-events-auto shadow-card" onClick={view.recenterCamera} data-slot="one-tap-recenter">Recenter</Button>
    </div>}
  </div>;
}
