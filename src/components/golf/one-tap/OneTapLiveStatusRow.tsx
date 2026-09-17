'use client';

import type { OneTapLiveStatus } from './use-one-tap-live-round';

/** One line in the standard tracker's chrome while an Upper round's Meridian
 * Live is loading or has stayed off, so the player on the tee knows whether
 * to wait, fix something, or play the hole on standard tracking. Nothing
 * renders for a round Live does not apply to, or once Live is up. */
const OFF_COPY: Record<Extract<OneTapLiveStatus, { phase: 'off' }>['reason'], string> = {
  location_unavailable: 'location is blocked for this site — allow it in Settings › Safari › Location, then reopen the round',
  course_unavailable: 'the course files did not load — check signal, then reopen the round',
  feature_flag_off: 'not enabled in this environment',
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
export function OneTapLiveStatusRow({ status }: { status: OneTapLiveStatus }) {
  const text = liveStatusText(status);
  if (!text) return null;
  return <p className="border-t border-border-subtle bg-elevated px-3 py-1.5 font-fw-sans text-body-sm text-text-secondary" data-slot="one-tap-live-status" data-phase={status.phase} data-reason={status.phase === 'off' ? status.reason : undefined} role="status" aria-live="polite">{text}</p>;
}
