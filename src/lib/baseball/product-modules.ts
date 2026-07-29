// =============================================================================
// src/lib/baseball/product-modules.ts
//
// CENTRAL PRODUCT-MODULE REGISTRY for BaseballHelm.
//
// WHY THIS EXISTS — AND WHY IT IS NOT ANY OF THE THREE EXISTING GATES
// -----------------------------------------------------------------------------
// BaseballHelm already had three orthogonal gating mechanisms, and recruiting
// was tangled across all of them, which is precisely why it could not be turned
// off cleanly:
//
//   1. `capabilities.ts` — PER-COACH permission ("may THIS staff member do X?"),
//      backed by boolean columns on baseball_team_coach_staff. Answers a
//      question about a *person*.
//   2. `server-route-guards.ts` RECRUITING_PROGRAM_TYPES — PER-PROGRAM mode
//      ("does a college/JUCO/showcase program recruit?"). Answers a question
//      about a *customer's shape*.
//   3. Role (`coach` | `player`) — answers a question about a *seat*.
//
// None of them can express the fourth, product-level question:
//
//      "Does the product SHIP this module at all right now?"
//
// That is what this file adds. A capability check cannot express it (a head
// coach has every capability, so recruiting would still show). A program-type
// check cannot express it (our demo program is a college program, and college
// programs recruit). Trying to force the sunset through either of those would
// have meant lying about a coach's permissions or about a customer's program
// type — corrupting two systems to hide one module.
//
// A module is disabled for EVERYONE regardless of role, capability, or program
// type. It is the outermost gate, and it is checked first.
//
// DESIGN
// -----------------------------------------------------------------------------
// - PURE + ISOMORPHIC: no Supabase, no React, no 'use server'/'use client', no
//   env reads at call time. Safe to import from server components, client
//   components, route guards, and the pure nav registries alike — which is a
//   hard requirement, because nav-registry.ts is itself pure and is imported by
//   both trees.
// - DECLARATIVE: disabling a module is a one-line change here, not a hunt
//   through ~151 files.
// - HONEST: a disabled module is not deleted. Its code, migrations, types, and
//   data all remain. `restore` documents exactly how to bring it back and what
//   must be re-checked first.
// =============================================================================

/** Every product module that can be independently shipped or withheld. */
export type ProductModuleId =
  /** College recruiting: pipeline, discover, colleges, interest, scout packets, camps. */
  | 'recruiting';

export interface ProductModule {
  id: ProductModuleId;
  /** Human label, used in any operator-facing surface that lists modules. */
  label: string;
  /** Ships today? */
  enabled: boolean;
  /** Why it is in its current state — read by whoever is surprised by it. */
  reason: string;
  /** What must be reviewed BEFORE re-enabling. Not optional; see doc below. */
  restore: string;
}

/**
 * THE REGISTRY. This object is the single source of truth for what
 * BaseballHelm currently ships.
 */
export const PRODUCT_MODULES: Readonly<Record<ProductModuleId, ProductModule>> = {
  recruiting: {
    id: 'recruiting',
    label: 'Recruiting',
    enabled: false,
    reason:
      'Sunset 2026-07-29 for the commercial release. BaseballHelm is being sold ' +
      'as a team-operations and player-development product; the recruiting ' +
      'module was the least complete surface area and diluted the pitch. Code, ' +
      'migrations, types, and data are all PRESERVED — this is a visibility ' +
      'switch, not a deletion.',
    restore:
      'Set enabled: true here. Then, BEFORE shipping, re-verify in this order: ' +
      '(1) every href under hub "coach-recruiting"/"player-recruiting" in ' +
      'route-contract.ts still resolves to a live page; (2) the recruiting ' +
      'server route guards in server-route-guards.ts still match the intended ' +
      'program types; (3) recruiting tables still satisfy current RLS — they ' +
      'were not exercised while disabled, so policy drift is likely; ' +
      '(4) recruiting seed data exists, since the demo seeds stopped producing ' +
      'it; (5) re-enable the recruiting nav tests that assert it is hidden ' +
      '(they will correctly fail once it is visible again).',
  },
} as const;

/**
 * Is this module currently shipped?
 *
 * This is the OUTERMOST gate. Check it BEFORE role, capability, or program
 * type — a disabled module is unavailable to everyone, including a primary
 * head coach with every capability on a college program.
 */
export function isModuleEnabled(id: ProductModuleId): boolean {
  return PRODUCT_MODULES[id]?.enabled ?? false;
}

/**
 * Convenience read for the recruiting sunset — the overwhelmingly common call.
 * Named rather than inlined so every recruiting gate in the codebase greps to
 * one symbol.
 */
export function isRecruitingEnabled(): boolean {
  return isModuleEnabled('recruiting');
}

/** Every module id, for tests and operator-facing listings. */
export const PRODUCT_MODULE_IDS = Object.keys(PRODUCT_MODULES) as ProductModuleId[];

/** Modules currently withheld. Used by tests that assert they stay hidden. */
export function disabledModuleIds(): ProductModuleId[] {
  return PRODUCT_MODULE_IDS.filter((id) => !isModuleEnabled(id));
}

/**
 * Nav/registry hub names that belong to a module. A hub listed here is
 * filtered out of navigation, sub-navigation, breadcrumbs, the command
 * palette, and route contracts whenever its module is disabled.
 *
 * Keyed by hub name rather than route so that ONE mapping serves every
 * consumer — nav-registry (`hub: 'recruiting'`), nav-manifest
 * (COACH_/PLAYER_RECRUITING_TABS) and route-contract
 * ('coach-recruiting' | 'player-recruiting') all resolve through here instead
 * of each hard-coding its own recruiting list and drifting apart.
 */
export const MODULE_HUBS: Readonly<Record<ProductModuleId, readonly string[]>> = {
  recruiting: ['recruiting', 'coach-recruiting', 'player-recruiting'],
} as const;

/** True when `hub` belongs to a module that is currently disabled. */
export function isHubDisabled(hub: string | null | undefined): boolean {
  if (!hub) return false;
  for (const id of PRODUCT_MODULE_IDS) {
    if (!isModuleEnabled(id) && MODULE_HUBS[id]?.includes(hub)) return true;
  }
  return false;
}

/**
 * NAV KEYS owned by each module — distinct from `MODULE_HUBS` above.
 *
 * A hub name groups routes for sub-navigation. A nav KEY is what the shell
 * resolves to a concrete rendered item (`byNavKey.get(key)` in
 * BaseballFairwayShell.tsx): bottom-nav differentiator slots
 * (program-type-variants.ts `coachBottomNavHubs` / `playerBottomNavRows`) and
 * player rail-row ids. They overlap but are not the same namespace — the
 * player rail names its recruiting row `player-recruiting-hub`, which is not a
 * hub name any registry uses.
 *
 * This exists because an unresolvable key does not fail loudly: the shell
 * drops it (`.filter(Boolean)`), silently rendering a 3-tab bottom bar where
 * the doctrine requires 4. Callers consult `isNavKeyDisabled` and substitute
 * their own declared fallback rather than emitting a key that will vanish.
 */
export const MODULE_NAV_KEYS: Readonly<Record<ProductModuleId, readonly string[]>> = {
  recruiting: ['recruiting', 'coach-recruiting', 'player-recruiting', 'player-recruiting-hub'],
} as const;

/** True when `key` names a nav item belonging to a currently-disabled module. */
export function isNavKeyDisabled(key: string | null | undefined): boolean {
  if (!key) return false;
  for (const id of PRODUCT_MODULE_IDS) {
    if (!isModuleEnabled(id) && MODULE_NAV_KEYS[id]?.includes(key)) return true;
  }
  return false;
}

/**
 * Route prefixes owned by each module.
 *
 * Used by the server route guards and by tests proving a disabled module is
 * unreachable by direct URL — hiding a link is not the same as closing a door,
 * and a buyer typing a URL must not land on a half-built screen.
 *
 * NOTE ON SCOPE: `/baseball/dashboard/academics` is deliberately ABSENT.
 * Academics reads as recruiting-adjacent (eligibility, transcripts, GPA) but is
 * a compliance surface a non-recruiting college program still needs, so it
 * survives the sunset. Over-matching here would remove a feature the product
 * still sells.
 */
export const MODULE_ROUTE_PREFIXES: Readonly<Record<ProductModuleId, readonly string[]>> = {
  recruiting: [
    '/baseball/dashboard/pipeline',
    '/baseball/dashboard/college-interest',
    '/baseball/dashboard/colleges',
    '/baseball/dashboard/discover',
    '/baseball/dashboard/scouting',
    '/baseball/dashboard/scout-packets',
    '/baseball/dashboard/camps',
    '/baseball/dashboard/comparisons',
    '/baseball/dashboard/compare',
    '/baseball/dashboard/journey',
  ],
} as const;

/**
 * The module owning `pathname`, or null. Longest-prefix wins so a future
 * nested module route cannot be shadowed by a shorter sibling.
 */
export function moduleForPathname(pathname: string): ProductModuleId | null {
  let best: { id: ProductModuleId; len: number } | null = null;
  for (const id of PRODUCT_MODULE_IDS) {
    for (const prefix of MODULE_ROUTE_PREFIXES[id] ?? []) {
      if (
        (pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
        (best === null || prefix.length > best.len)
      ) {
        best = { id, len: prefix.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * True when `pathname` belongs to a module that is currently disabled — i.e.
 * the route must not render its feature. Callers decide the response
 * (redirect or a controlled "unavailable" state); this only answers whether
 * the door is shut.
 */
export function isPathnameModuleDisabled(pathname: string): boolean {
  const id = moduleForPathname(pathname);
  return id !== null && !isModuleEnabled(id);
}
