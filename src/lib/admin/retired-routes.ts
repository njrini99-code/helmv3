// =============================================================================
// src/lib/admin/retired-routes.ts
//
// Every Bridge route the 30→19 consolidation retired, and where it now lives.
//
// A ROUTE IS A CONTRACT. These paths are in operators' bookmarks, in Slack
// scrollback, in `rca_analysis` rows and in merged PR bodies. Consolidating the
// nav is an information-architecture decision; breaking a URL is a data-loss
// one. Every entry here becomes a `redirects()` rule in `next.config.mjs`, so a
// retired path keeps resolving to the surface that absorbed it.
//
// `permanent: false` ON EVERY ENTRY, deliberately. A 308 is cached by browsers
// and intermediaries effectively forever; a 307 is not. These folds are a
// judgement about how the console is best organised, and if one proves wrong
// the revert has to be a code change — not a plea for every operator to clear
// their cache. `admin-redirects.test.ts` pins this.
//
// NOT LISTED, and never will be: `/admin/errors/<fingerprint>`. That route is
// stored in `rca_analysis` rows and matched by the repair contract's PR-body
// regex (`src/lib/admin/incidents/repair-link.ts`). It does not move.
// =============================================================================

export interface RetiredRoute {
  /** The path that no longer has a `page.tsx`. */
  from: string;
  /** The destination pathname — always a live nav entry or detail leaf. */
  to: string;
  /** The `?view=` the destination should open on, when it is not the default. */
  view?: string;
  /** Why it was retired — rendered nowhere, read by the next person here. */
  reason: string;
}

/**
 * Step 3 of the consolidation: the Phase 4 "lens" layer.
 *
 * These five pages were built as LENSES over subjects that already had tabs,
 * and then shipped as five more tabs beside them — `/admin/golf` and
 * `/admin/lenses/golf` both call `fetchGolfTab`, from separate pages, in the
 * same nav. `/admin/lenses/users/page.tsx`'s own doc comment admitted the
 * overlap in writing ("/admin/users already carries the full directory
 * experience … See the Phase 4 PR body for the overlap disclosure"). Folding
 * each lens into its subject as a `?view=` is what the word "lens" meant.
 */
export const RETIRED_ADMIN_ROUTES: readonly RetiredRoute[] = [
  {
    from: '/admin/lenses/golf',
    to: '/admin/golf',
    view: 'journey',
    reason: 'Golf Journey River is a framing of the Golf tab, not a second Golf tab.',
  },
  {
    from: '/admin/lenses/baseball',
    to: '/admin/baseball',
    view: 'journey',
    reason: 'Baseball journeys are a framing of the Baseball tab.',
  },
  {
    from: '/admin/lenses/lifting',
    to: '/admin/lifting',
    view: 'flow',
    reason: 'Program Execution Flow is a framing of the Lift Lab tab.',
  },
  {
    from: '/admin/lenses/teams',
    to: '/admin/teams',
    view: 'ekg',
    reason: 'Team EKG is a framing of Teams pulse.',
  },
  {
    from: '/admin/lenses/users',
    to: '/admin/users',
    reason:
      'A second user directory beside /admin/users. The lens page said so itself; the Journey Ribbon it existed to reach now hangs off the user detail page.',
  },
  {
    from: '/admin/work-log',
    to: '/admin/work',
    view: 'proof',
    reason:
      'A second Platform tab over the same PR feed, one join wider. Its own page copy had to explain the difference in prose ("Distinct from the PR-timeline view at /admin/work") — a page that has to tell you which of two tabs you want is one page with two framings.',
  },
  {
    from: '/admin/qualifiers',
    to: '/admin/golf',
    view: 'qualifiers',
    reason:
      'Qualifiers are a golf feature (golf_qualifiers, golf rounds, memory/features/qualifiers.md). "Are the qualifier rules holding?" is a question about golf, asked from the golf destination.',
  },
  {
    from: '/admin/reliability',
    to: '/admin/errors',
    view: 'sources',
    reason:
      'incidents/types.ts already called reliability a LENS over the one incident model ("Reliability stopped being a competing incident list the moment it became a lens") — and then a competing tab shipped beside it anyway. It is the per-source evidence behind the queue.',
  },
  {
    from: '/admin/self-heal',
    to: '/admin/errors',
    view: 'loop',
    reason:
      'Self-healing is what happens TO the incidents on this page. Watching the loop from a different destination than the queue it drains meant answering "is this being worked?" took two tabs and a fingerprint held in your head.',
  },
  {
    from: '/admin/slo',
    to: '/admin/health',
    view: 'budgets',
    reason:
      'Every one of its four read models is a read of FEATURE HEALTH — budgets are per feature, golden paths roll up the same budgets, silence detection reads get_feature_health()\'s own heartbeat signal. A second place to ask a question /admin/health already owned.',
  },
  {
    from: '/admin/billing',
    to: '/admin',
    reason:
      'Production has no Stripe key — verified 2026-09-08: zero STRIPE_* variables across 68 production env vars — so isStripeConfigured() is false and this page could only ever render its own "Invoicing is not available yet" notice. A whole nav section for a surface that cannot act. CreateInvoiceForm and src/lib/stripe/** are untouched: restoring the page is one commit if a key is ever configured.',
  },
];

/**
 * The keyboard shortcuts those retired tabs owned.
 *
 * An operator with muscle memory for Shift+G ("Golf journey lens") should land
 * where that surface went, not nowhere. `AdminShell` consults this after
 * `hrefForShortcut` misses, so a retired letter keeps working without
 * occupying a nav slot. `retired-shortcuts.test.ts` asserts none of these
 * collides with a live `ADMIN_NAV` key or a `RESERVED_LOCAL_SHORTCUTS` entry.
 */
export const RETIRED_SHORTCUTS: Readonly<Record<string, string>> = {
  G: '/admin/golf?view=journey',
  A: '/admin/baseball?view=journey',
  P: '/admin/lifting?view=flow',
  E: '/admin/teams?view=ekg',
  D: '/admin/users',
  Y: '/admin/work?view=proof',
  Q: '/admin/golf?view=qualifiers',
  R: '/admin/errors?view=sources',
  S: '/admin/errors?view=loop',
  O: '/admin/health?view=budgets',
  V: '/admin',
};

/** The full destination for a retired route, including its `?view=`. */
export function retiredDestination(route: RetiredRoute): string {
  return route.view ? `${route.to}?view=${route.view}` : route.to;
}

/**
 * The `redirects()` payload for `next.config.mjs`. Kept here rather than
 * hand-written in the config so the redirect table and the route table are the
 * same list — a retired route that nobody redirected is the failure mode this
 * module exists to prevent.
 */
export function retiredRouteRedirects(): Array<{ source: string; destination: string; permanent: false }> {
  return RETIRED_ADMIN_ROUTES.map((route) => ({
    source: route.from,
    destination: retiredDestination(route),
    permanent: false,
  }));
}
