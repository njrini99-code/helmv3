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
 * (see getPlayerHubSummaryData + FairwayPlayerDashboard's actionCenter prop).
 *
 * This route is kept ONLY as a permanent redirect so old links/bookmarks/the
 * command palette's stale entries still land somewhere real, rather than
 * 404ing. No new nav entry points here (removed from the rail — see
 * src/lib/golf/nav-registry.ts).
 * ========================================================================== */
export default function PlayerHubRedirectPage() {
  redirect('/golf/dashboard');
}
