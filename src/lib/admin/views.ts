// =============================================================================
// src/lib/admin/views.ts
//
// The Bridge's in-page VIEW vocabulary — the mechanism that let 30 nav tabs
// become 19 without losing a single surface.
//
// WHY THIS EXISTS. The Bridge had reached thirty destinations, several of
// which were the same question asked twice: `/admin/golf` and
// `/admin/lenses/golf` render the same subject from the same fetch
// (`fetchGolfTab` is called by both), `/admin/work` and `/admin/work-log`
// both answer "what did engineering do", `/admin/reliability` competes with
// the `reliability` INCIDENT LENS that `src/lib/admin/incidents/types.ts`
// already defines. That file's own comment states the principle this module
// generalises:
//
//   "These are FILTERS OVER ONE MODEL, not separate datasets — which is the
//    whole point. Reliability stopped being a competing incident list the
//    moment it became a lens."
//
// A view is that idea applied to a PAGE rather than to a queue: one
// destination, one data fetch, several framings of it, each addressable.
//
// THREE RULES, and they are the whole contract:
//
//   1. THE DEFAULT VIEW EMITS NO PARAM. `/admin/golf` and
//      `/admin/golf?view=production` are the same page, and only the first is
//      ever generated. A canonical URL per destination keeps the nav's
//      `activeMatch`, the breadcrumb trail and every stored bookmark working
//      unchanged — and means adding views to a page cannot break a link that
//      predates them.
//
//   2. AN UNKNOWN VIEW FALLS BACK, NEVER THROWS. A stale bookmark from before
//      a view was renamed lands on the destination's default framing, not a
//      500. Same reasoning as `parseIncidentLens`, which this mirrors
//      deliberately rather than inventing a second parsing convention.
//
//   3. EVERY OTHER QUERY PARAM SURVIVES A VIEW SWITCH. The window, the sport
//      filter, the severity — a view is one axis among several, and dropping
//      the others on switch is the behaviour that makes segmented controls
//      feel lossy. `hrefForView` below is the only sanctioned way to build a
//      view link for exactly this reason.
//
// PURE + ISOMORPHIC: no 'use client'/'use server', no Supabase, no React —
// data and pure functions only, so a Server Component page and a Client
// Component rail can share one vocabulary (mirrors `nav-registry.ts`).
// =============================================================================

/**
 * Every destination that has views, and the views it has. The FIRST entry in
 * each tuple is that destination's default — the framing someone opening the
 * tab is asking for — and is the one that emits no `?view=` param.
 *
 * Adding a view here is the whole registration: `parseView` accepts it,
 * `hrefForView` links to it, and `admin-redirects.test.ts` will check that any
 * redirect naming it actually resolves.
 */
export const ADMIN_VIEWS = {
  '/admin/golf': ['production', 'journey'],
  '/admin/baseball': ['production', 'journey'],
  '/admin/lifting': ['production', 'flow'],
  '/admin/teams': ['pulse', 'ekg'],
  '/admin/work': ['timeline', 'proof'],
  '/admin/errors': ['list', 'sources', 'loop'],
  '/admin/health': ['features', 'budgets', 'heartbeats'],
  '/admin/database': ['posture', 'performance', 'schema'],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type AdminViewHost = keyof typeof ADMIN_VIEWS;
export type AdminViewOf<H extends AdminViewHost> = (typeof ADMIN_VIEWS)[H][number];

/** The default (param-free) view for a host — always the first registered. */
export function defaultView<H extends AdminViewHost>(host: H): AdminViewOf<H> {
  return ADMIN_VIEWS[host][0] as AdminViewOf<H>;
}

export function isViewHost(pathname: string): pathname is AdminViewHost {
  return Object.prototype.hasOwnProperty.call(ADMIN_VIEWS, pathname);
}

/**
 * Read the view off a `searchParams` value.
 *
 * RULE 2. An unrecognised value — a stale bookmark, a hand-typed param, an
 * array from a duplicated key — resolves to the host's default rather than
 * throwing. A view is a framing, and the honest response to "I don't know that
 * framing" is the standard one, not an error page.
 */
export function parseView<H extends AdminViewHost>(
  host: H,
  raw: string | string[] | undefined,
): AdminViewOf<H> {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const allowed = ADMIN_VIEWS[host] as readonly string[];
  return (allowed.includes(value ?? '') ? value : allowed[0]) as AdminViewOf<H>;
}

/**
 * Build the href for one view of a host, preserving every other query param.
 *
 * RULE 1 (the default emits no param) and RULE 3 (other params survive) both
 * live here, so no call site has to remember either. Pass the page's own
 * `searchParams` as `current` and the switch keeps the window, sport, severity
 * and anything else the page reads.
 */
export function hrefForView<H extends AdminViewHost>(
  host: H,
  view: AdminViewOf<H>,
  current?: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current ?? {})) {
    if (key === 'view' || value === undefined) continue;
    // A repeated key keeps every one of its values — dropping all but the
    // first would silently narrow a multi-select filter on a view switch.
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, one);
  }
  // RULE 1: the default view is the canonical param-free URL.
  if (view !== ADMIN_VIEWS[host][0]) params.set('view', view);
  const query = params.toString();
  return query ? `${host}?${query}` : host;
}

// ---------------------------------------------------------------------------
// Dynamic routes
// ---------------------------------------------------------------------------

/**
 * `/admin/users/[id]`'s views. A DYNAMIC route cannot be a key in
 * `ADMIN_VIEWS` — that map is keyed by real pathnames so `hrefForView` can
 * return one — so the one dynamic host that needs views declares its
 * vocabulary here and uses the two generic helpers below. Same three rules,
 * same parsing behaviour; only the host string is supplied per call.
 *
 * `journey` is the per-user Journey Ribbon that used to be a whole parallel
 * directory at `/admin/lenses/users/[id]`. That lens page's own doc comment
 * admitted the overlap ("/admin/users already carries the full directory
 * experience"), so the ribbon moved onto the detail page every operator was
 * already using and the second directory was deleted.
 */
export const USER_DETAIL_VIEWS = ['overview', 'journey'] as const;
export type UserDetailView = (typeof USER_DETAIL_VIEWS)[number];

/** `parseView` for a vocabulary that is not an `ADMIN_VIEWS` key. */
export function parseViewFrom<V extends string>(
  allowed: readonly [V, ...V[]],
  raw: string | string[] | undefined,
): V {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ((allowed as readonly string[]).includes(value ?? '') ? value : allowed[0]) as V;
}

/** `hrefForView` for a vocabulary that is not an `ADMIN_VIEWS` key. */
export function hrefWithView<V extends string>(
  pathname: string,
  view: V,
  allowed: readonly [V, ...V[]],
  current?: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current ?? {})) {
    if (key === 'view' || value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, one);
  }
  if (view !== allowed[0]) params.set('view', view);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
