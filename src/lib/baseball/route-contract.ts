// =============================================================================
// src/lib/baseball/route-contract.ts
//
// BaseballHelm route/shell contract (#374) — pure analysis core.
//
// Reconciles every "this route is reachable" claim made by the nav registry
// (BASEBALL_NAV_REGISTRY + BASEBALL_MESSAGES_NAV) and the hub-definition tab
// arrays against the real App Router disk inventory, a curated redirect-alias
// manifest, a dynamic-route sample-id registry, and the server-guard capability
// map — and returns ONE structured result so the comparison rules live in
// exactly one place, shared by:
//   - the advisory Vitest contract test:
//     src/app/baseball/actions/__tests__/route-shell-contract.test.ts
//   - the report generator:
//     scripts/baseball/generate-route-coverage-report.ts
//
// Gap semantics + the advisory -> hard-gate promotion path are documented in
// docs/operations/baseball-route-contract-runbook.md — read that before
// changing any bucket's enforcement level.
//
// PURE + ISOMORPHIC: no `fs`, no React, no server-only imports. Filesystem
// concerns (walking src/app/baseball/, the alias manifest, the dynamic-route
// sample-id registry, and the middleware guard-policy adapter) live in
// src/test/helpers/baseball-route-inventory.ts — this module only consumes the
// already-built data its caller passes in via `analyzeRouteContract()`.
// =============================================================================

import {
  BASEBALL_NAV_REGISTRY,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavRole,
} from './nav-registry';
import type { BaseballCapability } from './capabilities';
import {
  COACH_TEAM_TABS,
  COACH_STATS_TABS,
  COACH_DEVELOPMENT_TABS,
  COACH_MANAGEMENT_TABS,
  COACH_RECRUITING_TABS,
  COACH_ACADEMICS_TABS,
  PLAYER_STATS_TABS,
  PLAYER_DEVELOPMENT_TABS,
  PLAYER_TEAM_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import type { HubSubNavTab } from '@/app/baseball/(dashboard)/_components/hub-sub-nav';

// -----------------------------------------------------------------------------
// Declared-href layer — every route the nav registry + hub tabs claim exists.
// -----------------------------------------------------------------------------

/** Which hub a tab-origin declared href came from. */
export type HubName =
  | 'coach-team'
  | 'coach-stats'
  | 'coach-development'
  | 'coach-management'
  | 'coach-recruiting'
  | 'coach-academics'
  | 'player-stats'
  | 'player-development'
  | 'player-team';

export type DeclaredHrefOrigin =
  | { kind: 'nav-registry'; id: string; variant: 'href' | 'playerHref' }
  | { kind: 'messages-nav' }
  | { kind: 'hub-tab'; hub: HubName; id: string };

export interface DeclaredHref {
  href: string;
  origin: DeclaredHrefOrigin;
  /** Audience the href is declared for; 'both' covers shared surfaces. */
  role: BaseballNavRole;
  requiredCapability: BaseballCapability | null;
  requiredAnyCapabilities: readonly BaseballCapability[];
  /**
   * Extra route prefixes that should also be treated as "owned" by this
   * declared href (hub tabs only — see HubSubNavTab.matchPrefixes). A disk
   * route under one of these prefixes counts as referenced even when it has
   * no exact href match (e.g. /performance/players/[id] under the
   * Performance tab's /performance prefix).
   */
  matchPrefixes: readonly string[];
}

const HUB_TAB_SOURCES: ReadonlyArray<{
  hub: HubName;
  role: 'coach' | 'player';
  tabs: readonly HubSubNavTab[];
}> = [
  { hub: 'coach-team', role: 'coach', tabs: COACH_TEAM_TABS },
  { hub: 'coach-stats', role: 'coach', tabs: COACH_STATS_TABS },
  { hub: 'coach-development', role: 'coach', tabs: COACH_DEVELOPMENT_TABS },
  { hub: 'coach-management', role: 'coach', tabs: COACH_MANAGEMENT_TABS },
  { hub: 'coach-recruiting', role: 'coach', tabs: COACH_RECRUITING_TABS },
  { hub: 'coach-academics', role: 'coach', tabs: COACH_ACADEMICS_TABS },
  { hub: 'player-stats', role: 'player', tabs: PLAYER_STATS_TABS },
  { hub: 'player-development', role: 'player', tabs: PLAYER_DEVELOPMENT_TABS },
  { hub: 'player-team', role: 'player', tabs: PLAYER_TEAM_TABS },
];

/**
 * Collect every declared href across the nav registry (+ playerHref role
 * overrides), the out-of-registry messages nav, and every hub's sub-tab array
 * — each tagged with its origin and gating metadata so a gap report can say
 * WHERE a stale or orphaned href came from.
 */
export function collectDeclaredHrefs(): DeclaredHref[] {
  const out: DeclaredHref[] = [];

  for (const entry of BASEBALL_NAV_REGISTRY) {
    out.push({
      href: entry.href,
      origin: { kind: 'nav-registry', id: entry.id, variant: 'href' },
      role: entry.role,
      requiredCapability: entry.requiredCapability,
      requiredAnyCapabilities: entry.requiredAnyCapabilities ?? [],
      matchPrefixes: [],
    });
    if (entry.playerHref) {
      out.push({
        href: entry.playerHref,
        origin: { kind: 'nav-registry', id: entry.id, variant: 'playerHref' },
        role: 'player',
        requiredCapability: null,
        requiredAnyCapabilities: [],
        matchPrefixes: [],
      });
    }
  }

  out.push({
    href: BASEBALL_MESSAGES_NAV.href,
    origin: { kind: 'messages-nav' },
    role: 'both',
    requiredCapability: null,
    requiredAnyCapabilities: [],
    matchPrefixes: [],
  });

  for (const source of HUB_TAB_SOURCES) {
    for (const tab of source.tabs) {
      out.push({
        href: tab.href,
        origin: { kind: 'hub-tab', hub: source.hub, id: tab.id },
        role: source.role,
        requiredCapability: tab.requiredCapability ?? null,
        requiredAnyCapabilities: tab.requiredAnyCapabilities ?? [],
        matchPrefixes: tab.matchPrefixes ?? [],
      });
    }
  }

  return out;
}

/** Human-readable origin label, used in gap reasons + the JSON report. */
export function describeOrigin(origin: DeclaredHrefOrigin): string {
  switch (origin.kind) {
    case 'nav-registry':
      return `nav-registry:${origin.id}${origin.variant === 'playerHref' ? ' (playerHref)' : ''}`;
    case 'messages-nav':
      return 'messages-nav';
    case 'hub-tab':
      return `hub-tab:${origin.hub}:${origin.id}`;
  }
}

// -----------------------------------------------------------------------------
// Inputs supplied by the Node-side inventory builder (kept OUT of this pure
// module — see src/test/helpers/baseball-route-inventory.ts).
// -----------------------------------------------------------------------------

export interface DiskRoute {
  /** Canonical route path with dynamic segments intact, e.g. "/baseball/dashboard/players/[id]". */
  routePath: string;
  /** True when any segment is a dynamic `[param]` segment. */
  isDynamic: boolean;
  /** Repo-relative directory backing this route (for traceability in reports). */
  filePath: string;
}

export interface RedirectAlias {
  /** The legacy/old href that should redirect. */
  from: string;
  /** Where the alias lands. */
  to: string;
  /** Why this alias exists — required so every alias is a conscious, reviewed addition. */
  reason: string;
  /** Where the alias is implemented (file:identifier), for traceability. */
  implementedAt: string;
}

export interface DynamicRouteSample {
  /** The dynamic route template, e.g. "/baseball/dashboard/players/[id]". */
  template: string;
  /** A representative concrete value for the bracketed segment(s) (crawler seed). */
  sampleParams: Readonly<Record<string, string>>;
  /** Why this sample was chosen / what entity it represents. */
  reason: string;
}

export interface GuardedRoute {
  href: string;
  requiredCapability: BaseballCapability;
  /** Where the guard policy lives (for traceability). */
  source: string;
}

export interface RouteContractInputs {
  declared: readonly DeclaredHref[];
  disk: readonly DiskRoute[];
  aliases: readonly RedirectAlias[];
  dynamicSamples: readonly DynamicRouteSample[];
  guardedRoutes: readonly GuardedRoute[];
}

// -----------------------------------------------------------------------------
// Gap report
// -----------------------------------------------------------------------------

export interface GapItem {
  href: string;
  origin?: string;
  reason: string;
}

export type GapBucket =
  | 'staleLinks'
  | 'orphanRoutes'
  | 'staticHubTabs'
  | 'missingDynamicSamples'
  | 'guardWithoutNavGating';

export interface RouteContractResult {
  staleLinks: GapItem[];
  orphanRoutes: GapItem[];
  staticHubTabs: GapItem[];
  missingDynamicSamples: GapItem[];
  guardWithoutNavGating: GapItem[];
  counts: Record<GapBucket, number>;
  meta: {
    declaredHrefCount: number;
    diskRouteCount: number;
    aliasCount: number;
    guardedRouteCount: number;
  };
}

/**
 * Every declared href (nav-registry, playerHref, messages-nav, hub-tab) is a
 * CONCRETE path — none of them are themselves a `[param]` template. So a
 * declared href "resolves to a page" iff it equals a disk route exactly; it
 * must NOT wildcard-match an unrelated dynamic disk route just because the
 * segment counts happen to line up (e.g. the static `/baseball/player/today`
 * must not be treated as "covering" the dynamic `/baseball/player/[id]`).
 * Dynamic disk routes are only ever referenced via a hub tab's
 * `matchPrefixes` (a parent list page owns its detail route) or the alias
 * manifest — never via an exact declared href.
 */
function findDiskRoute(href: string, disk: readonly DiskRoute[]): DiskRoute | undefined {
  return disk.find((route) => route.routePath === href);
}

function findAlias(href: string, aliases: readonly RedirectAlias[]): RedirectAlias | undefined {
  return aliases.find((alias) => alias.from === href || alias.to === href);
}

/**
 * The one allowlisted middleware capability route with no 1:1 nav-registry
 * href (a finer write sub-route of Stats Center). Mirrors the same exception
 * already locked by src/lib/baseball/__tests__/nav-capability-gating.test.ts
 * so the two guards never silently disagree.
 */
const GUARD_ALLOWLIST_NON_REGISTRY = new Set<string>(['/baseball/dashboard/stats/upload']);

/**
 * Combine the declared-href layer, the disk inventory, the alias manifest, the
 * dynamic-route sample-id registry, and the server-guard capability map into
 * one structured gap report.
 *
 * Bucket semantics (full detail: docs/operations/baseball-route-contract-runbook.md):
 *   - staleLinks: a nav-registry or messages-nav href that resolves to
 *     neither a real disk page nor a registered alias.
 *   - orphanRoutes: a disk page that is not referenced by any declared href
 *     (exact match), any hub tab's matchPrefixes, or the alias manifest.
 *   - staticHubTabs: a hub-tab href that has no backing disk page (regardless
 *     of whether it also has a top-level nav-registry entry — most hub tabs
 *     intentionally don't, by design).
 *   - missingDynamicSamples: a dynamic disk route template with no
 *     registered representative sample id.
 *   - guardWithoutNavGating: a server-guarded (capability-gated) route whose
 *     nav-registry entry is missing or whose gating metadata doesn't match.
 */
export function analyzeRouteContract(inputs: RouteContractInputs): RouteContractResult {
  const { declared, disk, aliases, dynamicSamples, guardedRoutes } = inputs;

  // --- staleLinks: nav-registry / messages-nav origins only. -----------------
  const staleLinks: GapItem[] = [];
  for (const item of declared) {
    if (item.origin.kind === 'hub-tab') continue;
    if (findDiskRoute(item.href, disk)) continue;
    if (findAlias(item.href, aliases)) continue;
    staleLinks.push({
      href: item.href,
      origin: describeOrigin(item.origin),
      reason: `declared by ${describeOrigin(item.origin)} but resolves to neither a real page nor a registered alias`,
    });
  }

  // --- staticHubTabs: hub-tab origins only. -----------------------------------
  const registryHrefs = new Set(
    declared.filter((d) => d.origin.kind === 'nav-registry').map((d) => d.href),
  );
  const staticHubTabs: GapItem[] = [];
  for (const item of declared) {
    if (item.origin.kind !== 'hub-tab') continue;
    const hasPage = Boolean(findDiskRoute(item.href, disk)) || Boolean(findAlias(item.href, aliases));
    if (hasPage) continue;
    const hasRegistryBacking = registryHrefs.has(item.href);
    staticHubTabs.push({
      href: item.href,
      origin: describeOrigin(item.origin),
      reason: hasRegistryBacking
        ? `hub tab ${describeOrigin(item.origin)} has a nav-registry entry but no backing page on disk`
        : `hub tab ${describeOrigin(item.origin)} has neither a nav-registry entry nor a backing page on disk`,
    });
  }

  // --- orphanRoutes: every disk page, checked for ANY reference. -------------
  const orphanRoutes: GapItem[] = [];
  for (const route of disk) {
    const coveredByHref = declared.some((d) => d.href === route.routePath);
    const coveredByPrefix = declared.some((d) =>
      d.matchPrefixes.some((prefix) => route.routePath === prefix || route.routePath.startsWith(`${prefix}/`)),
    );
    const coveredByAlias = aliases.some((a) => a.from === route.routePath || a.to === route.routePath);
    if (coveredByHref || coveredByPrefix || coveredByAlias) continue;
    orphanRoutes.push({
      href: route.routePath,
      origin: route.filePath,
      reason: `disk page at ${route.filePath} has no nav/hub/alias reference`,
    });
  }

  // --- missingDynamicSamples: every dynamic disk route. -----------------------
  const missingDynamicSamples: GapItem[] = [];
  for (const route of disk) {
    if (!route.isDynamic) continue;
    const hasSample = dynamicSamples.some((sample) => sample.template === route.routePath);
    if (hasSample) continue;
    missingDynamicSamples.push({
      href: route.routePath,
      origin: route.filePath,
      reason: 'dynamic route has no registered representative sample id',
    });
  }

  // --- guardWithoutNavGating: every server-guarded (capability) route. -------
  const guardWithoutNavGating: GapItem[] = [];
  for (const guard of guardedRoutes) {
    if (GUARD_ALLOWLIST_NON_REGISTRY.has(guard.href)) continue;
    const matches = declared.filter((d) => d.origin.kind === 'nav-registry' && d.href === guard.href);
    if (matches.length === 0) {
      guardWithoutNavGating.push({
        href: guard.href,
        origin: guard.source,
        reason: `server guard (${guard.source}) requires ${guard.requiredCapability} but no nav-registry entry declares this href`,
      });
      continue;
    }
    const matched = matches.some(
      (d) => d.requiredCapability === guard.requiredCapability || d.requiredAnyCapabilities.includes(guard.requiredCapability),
    );
    if (!matched) {
      guardWithoutNavGating.push({
        href: guard.href,
        origin: guard.source,
        reason: `server guard (${guard.source}) requires ${guard.requiredCapability} but nav-registry gating does not match`,
      });
    }
  }

  return {
    staleLinks,
    orphanRoutes,
    staticHubTabs,
    missingDynamicSamples,
    guardWithoutNavGating,
    counts: {
      staleLinks: staleLinks.length,
      orphanRoutes: orphanRoutes.length,
      staticHubTabs: staticHubTabs.length,
      missingDynamicSamples: missingDynamicSamples.length,
      guardWithoutNavGating: guardWithoutNavGating.length,
    },
    meta: {
      declaredHrefCount: declared.length,
      diskRouteCount: disk.length,
      aliasCount: aliases.length,
      guardedRouteCount: guardedRoutes.length,
    },
  };
}
