'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapLiveStatus } from './use-one-tap-live-round';

/** One line in the standard tracker's chrome while an Upper round's Meridian
 * Live is loading or has stayed off, so the player on the tee knows whether
 * to wait, fix something, or play the hole on standard tracking. Nothing
 * renders for a round Live does not apply to, or once Live is up. An
 * eligible round the player has not switched on carries the switch itself
 * ("Turn on"): the only way Live starts on a phone (`live-opt-in.ts`). */
const OFF_COPY: Record<Extract<OneTapLiveStatus, { phase: 'off' }>['reason'], string> = {
  location_unavailable: 'location is blocked for this site — allow it in Settings › Safari › Location, then reopen the round',
  course_unavailable: 'the course files did not load — check signal, then reopen the round',
  feature_flag_off: 'not enabled in this environment',
  opt_in_off: 'off for this round',
  geometry_hash_not_approved: 'the course package is not approved',
  wrong_course: 'not this course',
  wrong_site: 'the course package is for another site',
  source_candidate_package: 'the course package is unreviewed',
  error: 'something failed while loading',
};
export function liveStatusText(status: OneTapLiveStatus): string | null {
  switch (status.phase) {
    case 'inactive': case 'live': return null;
    case 'loading': return status.step === 'course' ? 'Meridian Live · loading course…' : `Meridian Live · loading hole terrain ${status.loaded + 1}/${status.total}…`;
    case 'off': return `Meridian Live off · ${OFF_COPY[status.reason]}${status.reason === 'error' && status.detail ? ` (${status.detail})` : ''}`;
  }
}
export function OneTapLiveStatusRow({ status, onTurnOn }: { status: OneTapLiveStatus; onTurnOn?: () => void }) {
  const text = liveStatusText(status);
  if (!text) return null;
  const offer = status.phase === 'off' && status.reason === 'opt_in_off' && onTurnOn ? onTurnOn : null;
  return <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-elevated px-3 py-1.5 font-fw-sans" data-slot="one-tap-live-status" data-phase={status.phase} data-reason={status.phase === 'off' ? status.reason : undefined} role="status" aria-live="polite">
    <p className="text-body-sm text-text-secondary">{text}</p>
    {offer && <Button variant="secondary" size="sm" onClick={offer} data-slot="one-tap-live-turn-on" aria-label="Turn on Meridian Live for this round">Turn on</Button>}
  </div>;
}
