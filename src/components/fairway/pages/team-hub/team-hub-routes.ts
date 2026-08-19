/**
 * ============================================================================
 * Fairway · pages/team-hub · team-hub-routes
 * ----------------------------------------------------------------------------
 * The Team Hub's card → detail-page routing contract, in one pure module so
 * the server page (redirects), the bento component (card hrefs), and the unit
 * tests all read the SAME map and can never drift.
 *
 * Two consumers:
 *   • TEAM_HUB_CARD_ROUTES — where each bento card navigates for full detail.
 *   • LEGACY_TAB_ROUTES    — the old tabbed hub's `?tab=` deep links
 *     (Cmd+K palette entries, bookmarks). The server page redirects these to
 *     the canonical detail pages so no pre-redesign link ever 404s or strands
 *     a player on a tab that no longer exists. (`overview` was the hub itself
 *     and simply renders the hub — it is deliberately absent here.)
 * ========================================================================== */

/** Where each bento card routes for the full detail surface. */
export const TEAM_HUB_CARD_ROUTES = {
  tasks: '/golf/dashboard/tasks',
  announcements: '/golf/dashboard/announcements',
  travel: '/golf/dashboard/travel',
  classes: '/golf/dashboard/classes',
  teammates: '/golf/dashboard/roster',
} as const;

/**
 * Legacy `?tab=` values from the tabbed Team Hub → canonical detail pages.
 * Identical to the card routes today, kept as its own name because the two
 * contracts can diverge (a future card could deep-link with query params
 * while the legacy tab keeps redirecting to the bare page).
 */
export const LEGACY_TAB_ROUTES: Record<string, string> = { ...TEAM_HUB_CARD_ROUTES };
