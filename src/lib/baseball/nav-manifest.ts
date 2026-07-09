// =============================================================================
// src/lib/baseball/nav-manifest.ts
//
// THE SINGLE CLASSIFICATION SOURCE for every BaseballHelm navigation entry,
// across every place a route gets surfaced (or used to get surfaced) to a
// user. This module does not decide what a UI consumer renders — nav-registry
// (sidebar + mobile nav), hub-definitions (hub sub-tab strips), and
// settings-route-aliases (hash-fragment aliases) keep that job. This module
// EXISTS so a reviewer (human or CI) can ask "what is this href, and is it the
// route I should be linking to?" with one authoritative answer, and so the
// completeness tests in __tests__/nav-manifest.test.ts can catch:
//   - an entry whose href no longer resolves to a real page/route on disk
//   - a deprecated/legacy-redirect entry whose target was renamed or removed
//   - a registry or hub-tab href that was added without a manifest entry
//
// Sources (NavSource):
//   - 'registry'        — a BASEBALL_NAV_REGISTRY row (sidebar + mobile nav).
//   - 'hub-tab'         — a hub-definitions.ts sub-tab (HubSubNav strip).
//   - 'alias'           — a BASEBALL_SETTINGS_ALIASES hash-fragment alias.
//   - 'legacy-redirect' — an old route-group page (`(coach-dashboard)`,
//     `(player-dashboard)`, `dashboard/team`, `dashboard/stats`) whose only job
//     is `redirect()` to a canonical route, or a target that USED to be one of
//     those and has since been deleted outright.
//   - 'server-guard'    — reserved for routes whose only nav-adjacent guard is
//     a server-side redirect helper (server-route-guards.ts) rather than a
//     visible nav entry. Not populated yet (#383 scope: classify the entries
//     that exist in nav-registry / hub-definitions / settings-route-aliases /
//     known legacy redirects today); left in the union so a future server-only
//     guard can be classified without widening this type.
//
// Status (NavStatus):
//   - 'canonical'  — the real, current destination. Should resolve on disk.
//   - 'alias'      — a stable alternate href that resolves to a canonical
//     target (settings hash-fragment aliases). Should resolve on disk (the
//     base path before `#fragment` is a real route — the fragment itself is
//     handled client-side by the settings page).
//   - 'hidden'     — exists and resolves, but intentionally not advertised in
//     any nav surface today (e.g. an archived/scaffolded hub). Reserved for
//     future use; not populated yet.
//   - 'deprecated' — an old route kept alive ONLY as a `redirect()` to a
//     canonical target. Should resolve on disk (the redirect page itself) AND
//     declare a `target` that is itself 'canonical' in this manifest.
//   - 'removed'    — a former target that no longer exists. MUST NOT resolve
//     on disk; kept here so the registry never silently re-adds a dead link.
//
// PURE + ISOMORPHIC (matches nav-registry.ts): no 'use client' / 'use server',
// no Supabase, no React. Safe to import from server or client bundles, and
// from filesystem-walking Vitest tests (Node-only `fs` stays in the tests).
// =============================================================================

import { BASEBALL_NAV_REGISTRY, BASEBALL_MESSAGES_NAV } from './nav-registry';
import type { BaseballCapability } from './capabilities';
import { BASEBALL_SETTINGS_ALIASES } from './settings-route-aliases';
import {
  COACH_DASHBOARD_TABS,
  COACH_MESSAGES_TABS,
  COACH_TEAM_TABS,
  COACH_STATS_TABS,
  COACH_DEVELOPMENT_TABS,
  COACH_MANAGEMENT_TABS,
  COACH_RECRUITING_TABS,
  COACH_ACADEMICS_TABS,
  PLAYER_STATS_TABS,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_TEAM_TABS,
  PLAYER_RECRUITING_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import type { HubSubNavTab } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type NavSource =
  | 'registry'
  | 'hub-tab'
  | 'alias'
  | 'legacy-redirect'
  | 'server-guard';

export type NavStatus = 'canonical' | 'alias' | 'hidden' | 'deprecated' | 'removed';

export interface NavManifestEntry {
  /** The href this entry classifies. Absolute, starts with `/baseball`. */
  href: string;
  /** Which navigation layer produced/owns this entry. */
  source: NavSource;
  /** The classification — see the module header for the full contract. */
  status: NavStatus;
  /**
   * For 'alias' and 'deprecated'/'removed' entries: the canonical destination
   * href this one resolves/redirects to. Required for 'deprecated' so the
   * completeness test can assert the target is itself 'canonical' here.
   */
  target?: string;
  /** Capability gate this href carries (registry/hub-tab only), for traceability. */
  capability?: BaseballCapability | null;
  /** Why this entry has this classification — read by humans, not asserted on. */
  note?: string;
}

// -----------------------------------------------------------------------------
// 1. Registry entries — every BASEBALL_NAV_REGISTRY row (sidebar + mobile nav).
// -----------------------------------------------------------------------------

const registryEntries: NavManifestEntry[] = BASEBALL_NAV_REGISTRY.flatMap((entry) => {
  const entries: NavManifestEntry[] = [
    {
      href: entry.href,
      source: 'registry',
      status: 'canonical',
      capability: entry.requiredCapability ?? null,
    },
  ];
  // Shared ('both') entries that diverge by role (playerHref override) point at
  // a SECOND real route — register it too so the player-facing destination is
  // pinned, not just the coach-facing `href`.
  if (entry.playerHref && entry.playerHref !== entry.href) {
    entries.push({
      href: entry.playerHref,
      source: 'registry',
      status: 'canonical',
      capability: null,
      note: `Player-facing override of "${entry.id}" (registry playerHref).`,
    });
  }
  return entries;
});

// The cross-cutting Messages entry — deliberately outside BASEBALL_NAV_REGISTRY
// (see the registry module header), so it is classified here explicitly.
registryEntries.push({
  href: BASEBALL_MESSAGES_NAV.href,
  source: 'registry',
  status: 'canonical',
  capability: null,
  note: 'BASEBALL_MESSAGES_NAV — shared Messages entry, deliberately outside BASEBALL_NAV_REGISTRY.',
});

// -----------------------------------------------------------------------------
// 2. Hub tab entries — every hub-definitions.ts sub-tab (HubSubNav strips).
// -----------------------------------------------------------------------------

const ALL_HUB_TAB_ARRAYS: readonly (readonly HubSubNavTab[])[] = [
  COACH_DASHBOARD_TABS,
  COACH_MESSAGES_TABS,
  COACH_TEAM_TABS,
  COACH_STATS_TABS,
  COACH_DEVELOPMENT_TABS,
  COACH_MANAGEMENT_TABS,
  COACH_RECRUITING_TABS,
  COACH_ACADEMICS_TABS,
  PLAYER_STATS_TABS,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_TEAM_TABS,
  PLAYER_RECRUITING_TABS,
];

const hubTabEntries: NavManifestEntry[] = ALL_HUB_TAB_ARRAYS.flatMap((tabs) =>
  tabs.map((tab) => ({
    href: tab.href,
    source: 'hub-tab' as const,
    status: 'canonical' as const,
    capability:
      tab.requiredCapability ?? tab.requiredAnyCapabilities?.[0] ?? null,
  })),
);

// -----------------------------------------------------------------------------
// 3. Settings aliases — the 8 hash-fragment aliases onto settings/program.
// -----------------------------------------------------------------------------

const settingsAliasEntries: NavManifestEntry[] = Object.values(
  BASEBALL_SETTINGS_ALIASES,
).map((href) => ({
  href,
  source: 'alias',
  status: 'alias',
  target: href.split('#')[0],
  note: 'Settings hash-fragment alias onto /baseball/dashboard/settings/program.',
}));

// -----------------------------------------------------------------------------
// 4. Legacy redirects — old route-group pages whose only job is redirect().
// -----------------------------------------------------------------------------
//
// Each of these pages exists on disk ONLY to call redirect(target) — see
// __tests__/nav-manifest.test.ts for the on-disk + target-resolves assertions.
// `target` for the two coach-type-routed dashboards ('/dashboard/team') is the
// coach landing; the page itself branches between that and the player landing
// at runtime, but every static branch resolves to a canonical entry above.

const legacyRedirectEntries: NavManifestEntry[] = [
  {
    href: '/baseball/dashboard/team',
    source: 'legacy-redirect',
    status: 'deprecated',
    // Branches coach -> command-center / player -> player/today at runtime;
    // the coach arm is the canonical target pinned here (both arms are
    // canonical entries above).
    target: '/baseball/dashboard/command-center',
    note: 'Branches to /baseball/player/today for players at runtime — both arms are canonical.',
  },
  {
    href: '/baseball/dashboard/stats',
    source: 'legacy-redirect',
    status: 'deprecated',
    target: '/baseball/dashboard/stats-center',
  },
  // Demo Mode was removed from Program Settings (PKT-12) with no replacement
  // section, so there is no canonical anchor to alias onto (see the settings
  // aliases' NOTE above — it deliberately has no 'demo-mode' key). This route
  // is kept reachable by redirecting to the Settings hub root rather than a
  // dead Program Settings anchor.
  {
    href: '/baseball/dashboard/settings/demo-mode',
    source: 'legacy-redirect',
    status: 'deprecated',
    target: '/baseball/dashboard/settings',
  },
  // Dead target — no page.tsx exists. A scoped staff member was previously
  // dropped here post-login (see auth-redirects-resolve.test.ts); kept as a
  // 'removed' tombstone so a future redirect literal pointing here fails the
  // manifest's on-disk assertions instead of users hitting a 404.
  {
    href: '/baseball/dashboard/staff',
    source: 'legacy-redirect',
    status: 'removed',
  },
  // Pre-consolidation settings sub-pages (W5 dead-code sweep, 2026-07-09):
  // zero inbound links from nav-registry/hub-definitions/command palettes and
  // no readiness-matrix citation, unlike 'notifications' and 'demo-mode'
  // above — deleted outright rather than kept as redirect stubs. Tombstoned
  // so a future re-add doesn't silently resurrect a dead link.
  {
    href: '/baseball/dashboard/settings/ai',
    source: 'legacy-redirect',
    status: 'removed',
  },
  {
    href: '/baseball/dashboard/settings/appearance',
    source: 'legacy-redirect',
    status: 'removed',
  },
  {
    href: '/baseball/dashboard/settings/data-retention',
    source: 'legacy-redirect',
    status: 'removed',
  },
  {
    href: '/baseball/dashboard/settings/guardian-access',
    source: 'legacy-redirect',
    status: 'removed',
  },
  {
    href: '/baseball/dashboard/settings/player-access',
    source: 'legacy-redirect',
    status: 'removed',
  },
  {
    href: '/baseball/dashboard/settings/showcase-profile',
    source: 'legacy-redirect',
    status: 'removed',
  },
];

// -----------------------------------------------------------------------------
// THE MANIFEST
// -----------------------------------------------------------------------------

export const BASEBALL_NAV_MANIFEST: readonly NavManifestEntry[] = [
  ...registryEntries,
  ...hubTabEntries,
  ...settingsAliasEntries,
  ...legacyRedirectEntries,
];

/** All hrefs in the manifest carrying a given status, de-duplicated. */
export function manifestHrefsByStatus(status: NavStatus): string[] {
  return [
    ...new Set(
      BASEBALL_NAV_MANIFEST.filter((e) => e.status === status).map((e) => e.href),
    ),
  ];
}
