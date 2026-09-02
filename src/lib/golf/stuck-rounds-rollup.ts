/**
 * Shared threshold/formatting for collapsing a list of stuck rounds into a
 * single summary row instead of stacking one row/card per round. Used by
 * both the admin overview "Rounds" card (OverviewBriefing.tsx) and the
 * Tracer tab's alert panel (tracer-utils.ts generateAlerts) so the two
 * surfaces roll up at the same count instead of drifting apart.
 */

/**
 * Above this many concurrently stuck rounds, one row/card per round no
 * longer reads as a short list — it reads as the surface screaming.
 */
export const STUCK_ROLLUP_THRESHOLD = 3;

export function shouldRollupStuckRounds(count: number): boolean {
  return count > STUCK_ROLLUP_THRESHOLD;
}

export function formatStuckRollupLabel(count: number): string {
  return `${count} rounds idle — view in Tracer`;
}
