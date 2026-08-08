/**
 * ============================================================================
 * Bridge severity tiers — the ONE definition of "what counts"
 * ----------------------------------------------------------------------------
 * The Bridge had two incompatible answers to "is this an error?", hand-written
 * at seven call sites:
 *
 *   .in('severity', ['error','critical'])   — activity, briefing, release-ledger
 *   .neq('severity', 'info')                — errors, incident-feed, team-detail
 *
 * Both are defensible. Neither was written down, so nothing stopped a new
 * surface picking either one, and the two never agreed on screen: over the 30
 * days to 2026-08-06 the feed showed 667 events while the KPI tiles counted
 * 390 — **41.5% of what an operator could see did not exist in the headline
 * number**. That is what "none of these are in sync, they're all over the
 * place" looks like from the outside.
 *
 * The fix is NOT to collapse them into one tier. A warning genuinely belongs in
 * the feed (an operator may want to look) and genuinely does not belong in a
 * "things are broken" count. The fix is that the distinction is declared once,
 * here, so no surface can drift and every surface can say which tier it means.
 *
 * `admin_events.severity` is `text NOT NULL` and carries exactly these four
 * values in production (verified 2026-08-06: error 82,965 · info 6,710 ·
 * warning 4,700 · critical 166), so `.neq('info')` and
 * `.in(INCIDENT_SEVERITIES)` are equivalent — the refactor to the latter
 * changes no rows, only the ability to drift.
 * ========================================================================== */

export type AdminSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Every severity, ordered least → most urgent. */
export const ALL_SEVERITIES: AdminSeverity[] = ['info', 'warning', 'error', 'critical'];

/**
 * What an OPERATOR SEES — the incident feed, error clusters, a team's page.
 *
 * Excludes `info`, which is routine narration ("no completed rounds yet") that
 * an operator can never act on. Includes `warning`: an expected-but-notable
 * outcome that is worth a look, not a page.
 */
export const INCIDENT_SEVERITIES: AdminSeverity[] = ['warning', 'error', 'critical'];

/**
 * What the HEADLINE COUNTS — KPI tiles, the briefing, the release ledger.
 *
 * Only severities that mean something is actually broken. A surface using this
 * tier MUST label itself accordingly ("errors", not "incidents"), or its number
 * reads as contradicting the feed sitting next to it.
 */
export const FAILURE_SEVERITIES: AdminSeverity[] = ['error', 'critical'];

/** Is this severity shown in the incident feed? */
export function isIncidentSeverity(severity: string): boolean {
  return (INCIDENT_SEVERITIES as string[]).includes(severity);
}

/** Does this severity mean something is broken (counts toward headline KPIs)? */
export function isFailureSeverity(severity: string): boolean {
  return (FAILURE_SEVERITIES as string[]).includes(severity);
}
