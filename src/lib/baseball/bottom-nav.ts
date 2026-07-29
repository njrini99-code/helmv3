// =============================================================================
// src/lib/baseball/bottom-nav.ts
//
// M1 packet: baseball-nav-4 (docs/MOBILE_DOCTRINE.md Rule 10 — "Bottom nav =
// the role's actual daily loop (4 destinations + More), declared in the nav
// registry — a daily destination must never be overflow-only.")
//
// THE 4 daily-loop bottom-nav KEYS, per role + program mode. Pure + total —
// no React, no Supabase, no 'use client'/'use server' — mirrors
// nav-registry.ts / program-type-variants.ts purity so this module is
// importable server-side and unit-testable without mounting the 'use client'
// shell (BaseballFairwayShell.tsx is the ONLY client consumer — it resolves
// each returned key to a real NavItem via the `navKey` join field).
//
// THE DESIGN (see docs brief for the full per-mode table): two slots are
// UNIVERSAL for every mode (Dashboard/Today + Team/Schedule for slots 1-2,
// Messages always slot 4 — never buried in More, since it carries the unread
// badge). Those universal slots are hard-coded HERE, never forked into
// program-type-variants.ts, so they can never drift per mode. Slot 3 is the
// mode's DIFFERENTIATOR — the ONE thing that changes — read from
// program-type-variants.ts's `coachBottomNavHubs` / `playerBottomNavRows`
// (each a single-entry array; the shell's job, not the variant's).
//
// Showcase coaches are the one two-level exception (org rail before a team is
// picked, team rail after — the same split BaseballFairwayShell.tsx's
// buildShowcaseOrgSections / buildShowcaseTeamSections already render).
// `showcaseScope` branches independently of the variant's differentiator.
// =============================================================================

import type { BaseballProgramType } from '@/lib/types/baseball-settings';
import { getProgramVariant } from './program-type-variants';
import { BASEBALL_MESSAGES_NAV } from './nav-registry';
import { isNavKeyDisabled } from './product-modules';

export interface BaseballBottomNavContext {
  role: 'coach' | 'player';
  programType: BaseballProgramType | null;
  /** Coach + showcase only: 'org' before a team is picked, 'team' after. */
  showcaseScope?: 'org' | 'team' | null;
}

/** Universal coach slots 1 + 2 — Messages (slot 4) is appended separately. */
const COACH_UNIVERSAL_KEYS = ['dashboard', 'team'] as const;

/** Universal player slots 1 + 2 — Messages (slot 4) is appended separately. */
const PLAYER_UNIVERSAL_KEYS = ['player-today', 'calendar'] as const;

/**
 * Fail-closed default — used both when `programType` hasn't resolved yet
 * (the brief pre-`navContext` window) AND as the showcase TEAM-scope bar
 * (§5D: "team → coach college default"). Every key here is always-visible
 * and capability-free, so the bar never renders <4 or a gated key.
 */
const COACH_FAILCLOSED_KEYS = [
  'dashboard',
  'team',
  'stats-performance',
  BASEBALL_MESSAGES_NAV.id,
] as const;

const PLAYER_FAILCLOSED_KEYS = [
  'player-today',
  'calendar',
  'player-stats-hub',
  BASEBALL_MESSAGES_NAV.id,
] as const;

/** Showcase ORG scope — mirrors buildShowcaseOrgSections's Dashboard/Teams/Events. */
const SHOWCASE_ORG_KEYS = [
  'organization',
  'teams',
  'events',
  BASEBALL_MESSAGES_NAV.id,
] as const;

/**
 * The 4 daily-loop nav keys, in bar order, for a resolved role + program mode.
 * Keys are coach hub ids (BaseballNavHub), player rail-row ids
 * (PLAYER_HUB_ROW_IDS / registry ids), BASEBALL_MESSAGES_NAV.id, or the
 * showcase-org leaf keys ('organization' | 'teams' | 'events'). Pure + total —
 * every branch returns exactly 4 keys.
 */
export function getBaseballBottomNavKeys(
  ctx: BaseballBottomNavContext,
): readonly string[] {
  // Showcase two-level exception — independent of the mode's differentiator,
  // mirrors the shell's own org/team rail split (selectedTeam presence).
  if (ctx.role === 'coach' && ctx.showcaseScope === 'org') {
    return SHOWCASE_ORG_KEYS;
  }
  if (ctx.role === 'coach' && ctx.showcaseScope === 'team') {
    return COACH_FAILCLOSED_KEYS;
  }

  if (!ctx.programType) {
    return ctx.role === 'player' ? PLAYER_FAILCLOSED_KEYS : COACH_FAILCLOSED_KEYS;
  }

  const variant = getProgramVariant(ctx.programType);

  if (ctx.role === 'player') {
    const differentiator = resolveDifferentiator(
      variant.playerBottomNavRows[0],
      'player-stats-hub',
    );
    return [...PLAYER_UNIVERSAL_KEYS, differentiator, BASEBALL_MESSAGES_NAV.id];
  }

  const differentiator = resolveDifferentiator(
    variant.coachBottomNavHubs[0],
    'stats-performance',
  );
  return [...COACH_UNIVERSAL_KEYS, differentiator, BASEBALL_MESSAGES_NAV.id];
}

/**
 * Slot 3 for a mode, with the product-module gate applied.
 *
 * `program-type-variants.ts` declares each mode's INTENT ("transfer exposure is
 * why JUCO mode exists"), and that declaration is deliberately left intact
 * through the recruiting sunset so it is still correct the day the module comes
 * back. But a key naming a disabled module resolves to nothing in the shell
 * (`byNavKey.get(key)` → undefined → dropped by `.filter(Boolean)`), which
 * would silently render a 3-tab bottom bar and violate MOBILE_DOCTRINE Rule 10
 * ("4 destinations + More"). So the gate is applied HERE, at read time, and
 * falls back to the same always-visible, capability-free key this function
 * already used when a mode declared no differentiator at all — the same key
 * COACH_FAILCLOSED_KEYS / PLAYER_FAILCLOSED_KEYS use. Losing a differentiator
 * costs the mode its distinctiveness; losing a tab costs it a doctrine
 * violation, and the second is worse.
 *
 * Affects exactly three bars today: JUCO coach, and JUCO + high-school player.
 * They fall back to Stats. If a better non-recruiting differentiator is chosen
 * for those modes, set it in program-type-variants.ts — this fallback then
 * stops firing on its own.
 */
function resolveDifferentiator(declared: string | undefined, fallback: string): string {
  if (!declared || isNavKeyDisabled(declared)) return fallback;
  return declared;
}
