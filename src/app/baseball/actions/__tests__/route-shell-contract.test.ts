// =============================================================================
// src/app/baseball/actions/__tests__/route-shell-contract.test.ts
//
// BaseballHelm route/shell contract (#374) — advisory-first.
//
// Calls analyzeRouteContract() ONCE and drives every assertion from the single
// result, so this test and the report generator
// (scripts/baseball/generate-route-coverage-report.ts) can never compute gaps
// differently — they share the same analysis core
// (src/lib/baseball/route-contract.ts).
//
// ENFORCEMENT MODEL (full semantics: docs/operations/baseball-route-contract-runbook.md):
//   - HARD sanity guards: the registry/hub extraction + disk walk actually
//     found data (the `>= 4` / `pages.length > 0` sentinel pattern from
//     auth-redirects-resolve.test.ts and cmd-k-coverage.test.mjs).
//   - HARD named regressions: a tight, curated set of known-good invariants
//     (every visible nav/hub href resolves for the known-good set, the
//     /dashboard/team legacy alias resolves through the manifest,
//     /dashboard/staff stays a non-target, and guardWithoutNavGating is empty).
//   - ADVISORY buckets (staleLinks / orphanRoutes / staticHubTabs /
//     missingDynamicSamples): console.warn only, never fail the suite. An
//     ADVISORY_ALLOWLIST documents known-intentional entries (deep-link detail
//     pages, public/auth/onboarding entry points, legacy redirect stubs) with
//     a kept-honest check that every allowlisted href still exists. Promoting
//     a bucket to a hard gate is the one-line change documented in the
//     runbook.
// =============================================================================

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  analyzeRouteContract,
  collectDeclaredHrefs,
  type GapBucket,
  type RouteContractResult,
} from '@/lib/baseball/route-contract';
import {
  buildBaseballRouteInventory,
  buildGuardedRoutes,
  DYNAMIC_ROUTE_SAMPLES,
  REDIRECT_ALIAS_MANIFEST,
} from '@/test/helpers/baseball-route-inventory';
import { BASEBALL_NAV_REGISTRY, BASEBALL_MESSAGES_NAV } from '@/lib/baseball/nav-registry';
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

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..'); // -> repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');

// -----------------------------------------------------------------------------
// ADVISORY_ALLOWLIST — the escape hatch for the four ADVISORY buckets ONLY
// (staleLinks / orphanRoutes / staticHubTabs / missingDynamicSamples).
// guardWithoutNavGating is NOT advisory and has no allowlist — see the runbook.
//
// Modeled on scripts/__tests__/cmd-k-coverage.test.mjs's ALLOWLIST: every
// entry requires a documented reason, and a "kept honest" test below asserts
// every allowlisted href still corresponds to a real disk route.
// -----------------------------------------------------------------------------

interface AllowlistEntry {
  bucket: Exclude<GapBucket, 'guardWithoutNavGating'>;
  href: string;
  reason: string;
}

const ADVISORY_ALLOWLIST: readonly AllowlistEntry[] = [
  // --- orphanRoutes: dynamic deep-link detail pages reached from a parent
  // list page, never meant to carry their own nav/hub entry. ---
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/players/[id]', reason: 'deep-link detail page reached from Roster' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/players/[id]/passport', reason: 'deep-link sub-view reached from the player profile' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/players/[id]/profile', reason: 'deep-link sub-view reached from Roster' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/players/[id]/scout-packet', reason: 'deep-link sub-view reached from the player profile' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/players/[id]/scout-packet/preview', reason: 'deep-link print preview reached from the scout packet' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/players/[id]/stats', reason: 'deep-link sub-view reached from the player profile' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/camps/[id]', reason: 'deep-link detail page reached from the Camps list' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/messages/[id]', reason: 'deep-link thread page reached from the Messages inbox' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/stats/games/[gameId]', reason: 'deep-link box score reached from the Games list' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/stats/games/create', reason: 'sub-action reached from the Games list' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/stats/games/new', reason: 'sub-action reached from the Games list' },

  // --- orphanRoutes: backward-compatible redirect-only landing stubs. ---
  { bucket: 'orphanRoutes', href: '/baseball/dashboard', reason: 'backward-compatible bookmark dispatcher; server-redirects by role' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/stats', reason: 'legacy redirect-only stub -> /dashboard/stats-center' },
  { bucket: 'orphanRoutes', href: '/baseball/dashboard/team/high-school', reason: 'legacy redirect-only stub -> command-center' },
  { bucket: 'orphanRoutes', href: '/baseball/coach/college', reason: 'legacy per-coach-type stub; redirects to command-center' },
  { bucket: 'orphanRoutes', href: '/baseball/coach/high-school', reason: 'legacy per-coach-type stub; redirects to command-center' },
  { bucket: 'orphanRoutes', href: '/baseball/coach/juco', reason: 'legacy per-coach-type stub; redirects to command-center' },
  { bucket: 'orphanRoutes', href: '/baseball/coach/showcase', reason: 'legacy per-coach-type stub; redirects to command-center' },
  { bucket: 'orphanRoutes', href: '/baseball/player/college', reason: 'legacy per-program-type stub; redirects to player today' },
  { bucket: 'orphanRoutes', href: '/baseball/player/high-school', reason: 'legacy per-program-type stub; redirects to player today' },
  { bucket: 'orphanRoutes', href: '/baseball/player/juco', reason: 'legacy per-program-type stub; redirects to player today' },
  { bucket: 'orphanRoutes', href: '/baseball/player/showcase', reason: 'legacy per-program-type stub; redirects to player today' },

  // --- orphanRoutes: public marketing / auth / onboarding / join entry
  // points — pre-login surfaces that are intentionally outside the
  // authenticated dashboard nav shell this contract reconciles. ---
  { bucket: 'orphanRoutes', href: '/baseball', reason: 'marketing/landing root, not a dashboard nav destination' },
  { bucket: 'orphanRoutes', href: '/baseball/login', reason: 'auth entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/signup', reason: 'auth entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/demo', reason: 'auth entry point (demo login)' },
  { bucket: 'orphanRoutes', href: '/baseball/forgot-password', reason: 'auth entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/reset-password', reason: 'auth entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/complete-signup', reason: 'auth entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/coach', reason: 'coach onboarding entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/coach-onboarding', reason: 'coach onboarding entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/player', reason: 'player onboarding entry point' },
  { bucket: 'orphanRoutes', href: '/baseball/join/[code]', reason: 'team join-by-code flow, shared via invite link' },
  { bucket: 'orphanRoutes', href: '/baseball/staff/join/[code]', reason: 'staff join-by-code flow, shared via invite link' },
  { bucket: 'orphanRoutes', href: '/baseball/packet/[token]', reason: 'public scout-packet share link, no app nav' },
  { bucket: 'orphanRoutes', href: '/baseball/packet/[token]/csv', reason: 'CSV export of the public scout-packet share link' },
  { bucket: 'orphanRoutes', href: '/baseball/player/[id]', reason: 'public player share page, no app nav' },
  { bucket: 'orphanRoutes', href: '/baseball/program/[id]', reason: 'public program share page, no app nav' },
  { bucket: 'orphanRoutes', href: '/baseball/team/[id]', reason: 'public team share page, no app nav' },
];

function allowlistedHrefs(bucket: GapBucket): Set<string> {
  return new Set(ADVISORY_ALLOWLIST.filter((entry) => entry.bucket === bucket).map((entry) => entry.href));
}

/**
 * Resolve a CONCRETE href (every nav-registry / hub-tab href, never a
 * `[param]` template itself) against the disk inventory. Exact match only —
 * see the matching rationale in src/lib/baseball/route-contract.ts.
 */
function diskHasRoute(href: string, disk: ReturnType<typeof buildBaseballRouteInventory>): boolean {
  return disk.some((route) => route.routePath === href);
}

/** Print an advisory (non-failing) report for one gap bucket, honoring the allowlist. */
function reportAdvisory(bucket: GapBucket, items: { href: string; reason: string }[]): void {
  const allowlisted = allowlistedHrefs(bucket);
  const unallowlisted = items.filter((item) => !allowlisted.has(item.href));
  if (unallowlisted.length === 0) return;
  // Intentional advisory surface (console-reported drift) — see module header.
  console.warn(
    `[route-shell-contract] ${bucket}: ${unallowlisted.length} new/uncategorized item(s) ` +
      `(see docs/operations/baseball-route-contract-runbook.md to allowlist or fix):\n` +
      unallowlisted.map((item) => `  - ${item.href} :: ${item.reason}`).join('\n'),
  );
}

describe('BaseballHelm route/shell contract (#374)', () => {
  const declared = collectDeclaredHrefs();
  const disk = buildBaseballRouteInventory();
  const guardedRoutes = buildGuardedRoutes();
  const result: RouteContractResult = analyzeRouteContract({
    declared,
    disk,
    aliases: REDIRECT_ALIAS_MANIFEST,
    dynamicSamples: DYNAMIC_ROUTE_SAMPLES,
    guardedRoutes,
  });

  // ---------------------------------------------------------------------------
  // HARD sanity guards — a broken walk/extraction must not silently pass.
  // ---------------------------------------------------------------------------
  describe('sanity guards', () => {
    it('the App Router app dir exists at the resolved path', () => {
      expect(existsSync(APP_DIR)).toBe(true);
    });

    it('extracts a non-trivial nav registry', () => {
      expect(BASEBALL_NAV_REGISTRY.length).toBeGreaterThanOrEqual(4);
    });

    it('extracts a non-trivial hub-tab set', () => {
      const hubTabCount =
        COACH_TEAM_TABS.length +
        COACH_STATS_TABS.length +
        COACH_DEVELOPMENT_TABS.length +
        COACH_MANAGEMENT_TABS.length +
        COACH_RECRUITING_TABS.length +
        COACH_ACADEMICS_TABS.length +
        PLAYER_STATS_TABS.length +
        PLAYER_DEVELOPMENT_TABS.length +
        PLAYER_TEAM_TABS.length;
      expect(hubTabCount).toBeGreaterThanOrEqual(4);
    });

    it('the disk inventory walk finds a non-trivial page set', () => {
      expect(disk.length).toBeGreaterThan(0);
      expect(disk.length).toBeGreaterThanOrEqual(50);
    });

    it('the declared-href collector produced entries from every origin kind', () => {
      expect(declared.some((d) => d.origin.kind === 'nav-registry')).toBe(true);
      expect(declared.some((d) => d.origin.kind === 'messages-nav')).toBe(true);
      expect(declared.some((d) => d.origin.kind === 'hub-tab')).toBe(true);
    });

    it('the guard-policy adapter found capability-gated routes', () => {
      expect(guardedRoutes.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ---------------------------------------------------------------------------
  // HARD named regressions — the curated known-good set.
  // ---------------------------------------------------------------------------
  describe('named regressions', () => {
    it('every top-level nav-registry href resolves to a real page or a registered alias', () => {
      const broken = BASEBALL_NAV_REGISTRY.filter(
        (entry) => !diskHasRoute(entry.href, disk) && !REDIRECT_ALIAS_MANIFEST.some((a) => a.from === entry.href || a.to === entry.href),
      ).map((entry) => `${entry.id} -> ${entry.href}`);
      expect(broken).toEqual([]);
    });

    it('every nav-registry playerHref resolves to a real page or a registered alias', () => {
      const broken = BASEBALL_NAV_REGISTRY.filter((entry) => entry.playerHref)
        .filter(
          (entry) =>
            !diskHasRoute(entry.playerHref!, disk) &&
            !REDIRECT_ALIAS_MANIFEST.some((a) => a.from === entry.playerHref || a.to === entry.playerHref),
        )
        .map((entry) => `${entry.id} -> ${entry.playerHref}`);
      expect(broken).toEqual([]);
    });

    it('BASEBALL_MESSAGES_NAV resolves to a real page', () => {
      expect(diskHasRoute(BASEBALL_MESSAGES_NAV.href, disk)).toBe(true);
    });

    it('the /baseball/dashboard/team legacy alias resolves through the manifest', () => {
      const alias = REDIRECT_ALIAS_MANIFEST.find((a) => a.from === '/baseball/dashboard/team');
      expect(alias).toBeDefined();
      expect(alias!.to).toBe('/baseball/dashboard/command-center');
      // The alias target must itself be a real page.
      expect(diskHasRoute(alias!.to, disk)).toBe(true);
    });

    it('regression: /baseball/dashboard/staff remains a non-target (carries forward the auth-redirects guard intent)', () => {
      expect(diskHasRoute('/baseball/dashboard/staff', disk)).toBe(false);
      expect(BASEBALL_NAV_REGISTRY.some((entry) => entry.href === '/baseball/dashboard/staff')).toBe(false);
      expect(REDIRECT_ALIAS_MANIFEST.some((a) => a.from === '/baseball/dashboard/staff' || a.to === '/baseball/dashboard/staff')).toBe(
        false,
      );
    });

    it('guardWithoutNavGating is empty for the known (capability-guarded) set', () => {
      expect(result.guardWithoutNavGating).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // ADVISORY buckets — console-report new drift, never fail the suite.
  //
  // To promote a bucket to a hard gate once it is stable, replace the
  // `reportAdvisory(...)` call with:
  //   expect(unallowlisted(result.<bucket>)).toEqual([]);
  // (see docs/operations/baseball-route-contract-runbook.md for the full
  // promotion checklist).
  // ---------------------------------------------------------------------------
  describe('advisory drift reporting', () => {
    it('reports staleLinks drift (advisory — does not fail)', () => {
      reportAdvisory('staleLinks', result.staleLinks);
      expect(true).toBe(true);
    });

    it('reports orphanRoutes drift (advisory — does not fail)', () => {
      reportAdvisory('orphanRoutes', result.orphanRoutes);
      expect(true).toBe(true);
    });

    it('reports staticHubTabs drift (advisory — does not fail)', () => {
      reportAdvisory('staticHubTabs', result.staticHubTabs);
      expect(true).toBe(true);
    });

    it('reports missingDynamicSamples drift (advisory — does not fail)', () => {
      reportAdvisory('missingDynamicSamples', result.missingDynamicSamples);
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Kept-honest check — every allowlisted entry must still correspond to a
  // real route/href, so a stale allowlist entry can never mask a future
  // genuinely-missing one.
  // ---------------------------------------------------------------------------
  describe('ADVISORY_ALLOWLIST stays honest', () => {
    it('every allowlisted orphanRoutes href still exists on disk', () => {
      const stale = ADVISORY_ALLOWLIST.filter((entry) => entry.bucket === 'orphanRoutes' && !diskHasRoute(entry.href, disk)).map(
        (entry) => entry.href,
      );
      expect(stale).toEqual([]);
    });

    it('every allowlisted entry has a non-empty documented reason', () => {
      const undocumented = ADVISORY_ALLOWLIST.filter((entry) => entry.reason.trim().length === 0).map((entry) => entry.href);
      expect(undocumented).toEqual([]);
    });
  });
});
