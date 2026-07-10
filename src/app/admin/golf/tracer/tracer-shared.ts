import type { FwStatusTone } from '@/components/fairway';
import type { TracerIncident } from '@/app/golf/actions/admin-tracer-data';

/** Shared severity → StatusPill tone map — one definition for the main
 *  incidents list (page.tsx) and the round-scoped incident view
 *  (TracerRoundDiagnostic.tsx) so a "critical" incident reads identically
 *  wherever it surfaces. */
export const TRACER_SEVERITY_TONE: Record<TracerIncident['severity'], FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

/** Round status → StatusPill tone, used on the per-player rounds list. */
export const ROUND_STATUS_TONE: Record<string, FwStatusTone> = {
  completed: 'success',
  in_progress: 'warning',
  draft: 'neutral',
};

/**
 * `hours_stuck` is plain arithmetic on a fixed instant already computed
 * server-side (getTracerEnrichedDataImpl) — no locale/timezone involved, so
 * this is safe to call from a Client Component's very first render (unlike
 * `toLocaleString()`, it can't disagree between server and client passes).
 */
export function formatStuckDuration(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)}h stuck`;
  return `${(hours / 24).toFixed(1)}d stuck`;
}
