/**
 * ============================================================================
 * Fairway · pages · messages — barrel
 * ----------------------------------------------------------------------------
 * The flag-on /golf/dashboard/messages team-inbox surface. Exports ONLY the
 * orchestrator the route forks into. The supporting panes (rail / thread /
 * composer) are internal to FairwayMessages and imported by it via DIRECT PATH;
 * they are intentionally NOT re-exported here.
 *
 * ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork in
 * messages/page.tsx. Renders inside a `.fairway-ds` scope on a `bg-canvas` page
 * (like FairwayPlayerStats), WITHOUT CoachHelmShell (this is a team-management
 * page, not a CoachHelm surface).
 * ========================================================================== */

export { FairwayMessages } from './FairwayMessages';
