import { redirect } from 'next/navigation';

/**
 * ============================================================================
 * /golf/dashboard/hub — WAVE W2 nav consolidation (2026-07-09)
 * ----------------------------------------------------------------------------
 * The Target IA (PRODUCTION_READINESS_MISSION_2026-07-09.md) merges the
 * standalone player "Hub" into the Dashboard — one home, not two. Every piece
 * of the Hub's triage content the Dashboard lacked (pending tasks, awaiting-
 * RSVP events, recent announcements, upcoming trips, the top CoachHelm
 * signal) now renders as an "Action center" section on /golf/dashboard itself
 * (see getPlayerHubSummaryData + FairwayPlayerDashboard's hubData prop).
 *
 * This route is kept ONLY as a permanent redirect so old links/bookmarks/the
 * command palette's stale entries still land somewhere real, rather than
 * 404ing. No new nav entry points here (removed from the rail — see
 * src/lib/golf/nav-registry.ts).
 *
 * BELT-AND-BRACES (2026-07-22): next.config.mjs `redirects()` now intercepts
 * `/golf/dashboard/hub` at the framework routing layer, before this page ever
 * renders — the fix for the React #310 "rendered more hooks" crash on
 * client-navigation into bare redirect() shims. This component is left in
 * place only as a fallback for anything the config layer misses; it should
 * no longer actually execute in normal operation.
 * ========================================================================== */
export default function PlayerHubRedirectPage() {
  redirect('/golf/dashboard');
}
