// =============================================================================
// src/lib/baseball/__tests__/nav-manifest.test.ts
//
// Phase 1 (#383) — pins the navigation manifest to reality:
//   1. Every 'canonical' and 'alias' href resolves to a real page.tsx/route.ts
//      on disk (reusing the route-group-aware filesystem walk from
//      auth-redirects-resolve.test.ts).
//   2. Every 'deprecated'/'removed' legacy-redirect entry is internally
//      consistent: deprecated entries point at a target that IS a canonical
//      manifest entry; removed entries must NOT resolve on disk (otherwise the
//      tombstone is stale and should be deleted, not asserted).
//   3. Every BASEBALL_NAV_REGISTRY entry and every hub-definitions.ts tab href
//      has a corresponding manifest entry — no untracked routes.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  BASEBALL_NAV_MANIFEST,
  manifestHrefsByStatus,
  type NavManifestEntry,
} from '../nav-manifest';
import { BASEBALL_NAV_REGISTRY, BASEBALL_MESSAGES_NAV, type BaseballNavHub } from '../nav-registry';
import { BASEBALL_CAPABILITY_KEYS, type BaseballCapabilityMap } from '../capabilities';
import { BASEBALL_PROGRAM_TYPES, type BaseballProgramType } from '@/lib/types/baseball-settings';
import {
  COACH_HUB_ORDER,
  COACH_HUB_DEFS,
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
import {
  resolveActiveHub,
  filterHubTabsByCapabilities,
  filterHubTabsByProgramType,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..'); // → repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');

// -----------------------------------------------------------------------------
// Filesystem walk — identical contract to auth-redirects-resolve.test.ts:
// resolve an in-product href to a page.tsx/route.ts/default.tsx on disk,
// allowing the URL segments to be nested under any number of route groups.
// -----------------------------------------------------------------------------

function routeExists(href: string): boolean {
  const path = href.split('?')[0]!.split('#')[0]!;
  const segments = path.split('/').filter(Boolean);

  let dirs: string[] = [APP_DIR];

  for (const seg of segments) {
    const next: string[] = [];
    for (const dir of dirs) {
      const direct = join(dir, seg);
      if (existsSync(direct) && statSync(direct).isDirectory()) next.push(direct);
      collectThroughGroups(dir, seg, next);
    }
    if (next.length === 0) return false;
    dirs = next;
  }

  return dirs.some((d) => dirHasRenderable(d));
}

function collectThroughGroups(dir: string, seg: string, out: string[]): void {
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return;
  }
  for (const child of children) {
    if (child.startsWith('(') && child.endsWith(')')) {
      const groupDir = join(dir, child);
      if (!statSync(groupDir).isDirectory()) continue;
      const target = join(groupDir, seg);
      if (existsSync(target) && statSync(target).isDirectory()) out.push(target);
      collectThroughGroups(groupDir, seg, out);
    }
  }
}

function dirHasRenderable(dir: string): boolean {
  const RENDERABLE = ['page.tsx', 'page.ts', 'route.ts', 'route.tsx', 'default.tsx'];
  if (RENDERABLE.some((f) => existsSync(join(dir, f)))) return true;
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return false;
  }
  return children.some(
    (c) =>
      c.startsWith('(') &&
      c.endsWith(')') &&
      statSync(join(dir, c)).isDirectory() &&
      dirHasRenderable(join(dir, c)),
  );
}

describe('BASEBALL_NAV_MANIFEST', () => {
  it('the App Router app dir exists at the resolved path', () => {
    expect(existsSync(APP_DIR)).toBe(true);
  });

  it('is non-empty and covers every classification this test suite checks', () => {
    expect(BASEBALL_NAV_MANIFEST.length).toBeGreaterThan(20);
    const statuses = new Set(BASEBALL_NAV_MANIFEST.map((e) => e.status));
    expect(statuses.has('canonical')).toBe(true);
    expect(statuses.has('alias')).toBe(true);
    expect(statuses.has('deprecated')).toBe(true);
    expect(statuses.has('removed')).toBe(true);
  });

  describe('every canonical href resolves to a real page/route on disk', () => {
    const canonical = manifestHrefsByStatus('canonical');

    it('sanity: canonical hrefs were actually collected', () => {
      expect(canonical.length).toBeGreaterThan(15);
    });

    it.each(canonical.map((href) => [href] as const))('%s resolves', (href) => {
      expect(routeExists(href)).toBe(true);
    });
  });

  describe('every alias href resolves to a real page/route on disk', () => {
    const aliases = manifestHrefsByStatus('alias');

    it('sanity: alias hrefs were actually collected', () => {
      // 7, not 8 — the Demo Mode section (and its #demo-mode alias) was removed
      // from Program Settings (PKT-12); see settings-route-aliases.ts's note.
      expect(aliases.length).toBe(7);
    });

    it.each(aliases.map((href) => [href] as const))('%s base path resolves', (href) => {
      // routeExists already strips the #fragment, so this proves the base
      // settings path is real even though the fragment is a client-side anchor.
      expect(routeExists(href)).toBe(true);
    });
  });

  describe('every deprecated entry points at a canonical target that exists', () => {
    const deprecated = BASEBALL_NAV_MANIFEST.filter((e) => e.status === 'deprecated');
    const canonicalHrefs = new Set(manifestHrefsByStatus('canonical'));

    it('sanity: deprecated entries were actually collected', () => {
      // Coach/player type routes and stats/games/new now redirect via middleware
      // (see src/lib/supabase/middleware.ts); only on-disk redirect() pages remain.
      expect(deprecated.length).toBeGreaterThanOrEqual(2);
    });

    it.each(deprecated.map((e) => [e] as const))(
      '%j declares a target that is a canonical manifest entry',
      (entry: NavManifestEntry) => {
        expect(entry.target, `deprecated entry ${entry.href} must declare a target`).toBeTruthy();
        expect(
          canonicalHrefs.has(entry.target!),
          `target "${entry.target}" of deprecated entry "${entry.href}" must be a canonical manifest entry`,
        ).toBe(true);
        expect(routeExists(entry.target!)).toBe(true);
      },
    );

    it('the deprecated redirect page itself still resolves on disk', () => {
      for (const entry of deprecated) {
        expect(routeExists(entry.href), `deprecated redirect page ${entry.href} must exist`).toBe(
          true,
        );
      }
    });
  });

  describe('every removed entry is a genuine tombstone (does NOT resolve)', () => {
    const removed = BASEBALL_NAV_MANIFEST.filter((e) => e.status === 'removed');

    it('sanity: at least one removed entry exists (the known dead /staff target)', () => {
      expect(removed.length).toBeGreaterThanOrEqual(1);
      expect(removed.some((e) => e.href === '/baseball/dashboard/staff')).toBe(true);
    });

    it.each(removed.map((e) => [e.href] as const))(
      '%s does not resolve to a real page/route',
      (href) => {
        expect(routeExists(href)).toBe(false);
      },
    );
  });

  describe('no untracked routes — every registry + hub-tab href is in the manifest', () => {
    const manifestHrefs = new Set(BASEBALL_NAV_MANIFEST.map((e) => e.href));

    it('every BASEBALL_NAV_REGISTRY href (and playerHref override) is tracked', () => {
      for (const entry of BASEBALL_NAV_REGISTRY) {
        expect(manifestHrefs.has(entry.href), `registry entry "${entry.id}" href ${entry.href} missing from manifest`).toBe(
          true,
        );
        if (entry.playerHref) {
          expect(
            manifestHrefs.has(entry.playerHref),
            `registry entry "${entry.id}" playerHref ${entry.playerHref} missing from manifest`,
          ).toBe(true);
        }
      }
    });

    it('the cross-cutting Messages entry is tracked', () => {
      expect(manifestHrefs.has(BASEBALL_MESSAGES_NAV.href)).toBe(true);
    });

    it('every hub-definitions.ts tab href is tracked', () => {
      const allTabs = [
        ...COACH_TEAM_TABS,
        ...COACH_STATS_TABS,
        ...COACH_DEVELOPMENT_TABS,
        ...COACH_MANAGEMENT_TABS,
        ...COACH_RECRUITING_TABS,
        ...COACH_ACADEMICS_TABS,
        ...PLAYER_STATS_TABS,
        ...PLAYER_DEVELOPMENT_TABS,
        ...PLAYER_TEAM_TABS,
        ...PLAYER_RECRUITING_TABS,
      ];
      for (const tab of allTabs) {
        expect(manifestHrefs.has(tab.href), `hub tab "${tab.id}" href ${tab.href} missing from manifest`).toBe(
          true,
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // COACH_NAV_8TAB_PROPOSAL.md (approved 2026-07-01) — every coach/both
  // registry entry must declare exactly one grouped hub, so hub-definitions.ts
  // can GROUP BY `entry.hub` instead of hand-listing routes per hub. A
  // coach/both entry with no hub (or, structurally impossible via the type
  // system, more than one) is silently invisible to every hub-derived array —
  // the exact "5 unreachable features" bug this field exists to prevent from
  // recurring.
  // ---------------------------------------------------------------------------
  describe('every coach/both registry entry declares exactly one hub', () => {
    const VALID_HUBS: readonly BaseballNavHub[] = [
      'dashboard',
      'messages',
      'team',
      'stats-performance',
      'development',
      'recruiting',
      'academics',
      'management',
    ];

    it('sanity: the registry has a non-trivial coach/both entry set', () => {
      const coachOrBoth = BASEBALL_NAV_REGISTRY.filter((e) => e.role !== 'player');
      expect(coachOrBoth.length).toBeGreaterThan(20);
    });

    it.each(
      BASEBALL_NAV_REGISTRY.filter((e) => e.role !== 'player').map((e) => [e.id] as const),
    )('%s declares a hub from the 8-hub set', (id) => {
      const entry = BASEBALL_NAV_REGISTRY.find((e) => e.id === id)!;
      expect(entry.hub, `registry entry "${id}" (role: ${entry.role}) is missing a hub`).toBeTruthy();
      expect(
        VALID_HUBS.includes(entry.hub!),
        `registry entry "${id}" declares hub "${entry.hub}", which is not one of the 8 grouped hubs`,
      ).toBe(true);
    });

    it('no role: player entry declares a hub (players are never grouped into a coach hub)', () => {
      const playerEntriesWithHub = BASEBALL_NAV_REGISTRY.filter((e) => e.role === 'player' && e.hub);
      expect(playerEntriesWithHub.map((e) => e.id)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // COHERENCE_RULING_2026-07-08.md Ruling 2 — the permanent ≤3-subtabs-per-hub
  // anti-regression lock (item 10 of the A2 task). Four assertions:
  //   (a) every coach/both registry entry has exactly one hub — covered above.
  //   (b) every coach hub renders ≤3 subtabs, for EVERY coach type.
  //   (c) every player hub renders ≤3 subtabs.
  //   (d) every folded (`foldedUnder`-marked) destination still resolves to a
  //       hub via resolve-active-hub (command palette + deep links stay live
  //       even though the destination lost its own hub-tab slot).
  // ---------------------------------------------------------------------------
  describe('Ruling 2 — ≤3 subtabs per hub (permanent anti-regression lock)', () => {
    it('(b) every coach hub renders ≤3 subtabs in the RAW (unfiltered) array', () => {
      // Raw arrays are the ceiling: capability + program-type filtering
      // (filterHubTabsByCapabilities / filterHubTabsByProgramType) only ever
      // REMOVES tabs for a given coach type, never adds — so asserting the
      // unfiltered array proves the cap holds for every coach type at once.
      for (const hubId of COACH_HUB_ORDER) {
        const tabs = COACH_HUB_DEFS[hubId].tabs;
        expect(
          tabs.length,
          `hub "${hubId}" renders ${tabs.length} subtabs (${tabs.map((t) => t.id).join(', ')}) — Ruling 2 caps every hub at 3`,
        ).toBeLessThanOrEqual(3);
      }
    });

    it('(b) every coach hub renders ≤3 subtabs for a fully-capable head coach in every program type', () => {
      // Imported from the canonical source (mirrors BASEBALL_CAPABILITY_KEYS
      // below) rather than hand-listed — a hand-typed literal array would
      // type-check even if BaseballProgramType gains/loses a member, silently
      // losing coverage for the new value. BASEBALL_PROGRAM_TYPES can never
      // drift from BaseballProgramType because it's the array the type is
      // derived from.
      const PROGRAM_TYPES: readonly BaseballProgramType[] = BASEBALL_PROGRAM_TYPES;
      const allCaps = BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as BaseballCapabilityMap);

      for (const programType of PROGRAM_TYPES) {
        for (const hubId of COACH_HUB_ORDER) {
          const capFiltered = filterHubTabsByCapabilities(COACH_HUB_DEFS[hubId].tabs, 'coach', allCaps);
          const visible = filterHubTabsByProgramType(capFiltered, programType);
          expect(
            visible.length,
            `hub "${hubId}" renders ${visible.length} subtabs for a head coach in "${programType}" — Ruling 2 caps every hub at 3`,
          ).toBeLessThanOrEqual(3);
        }
      }
    });

    it('(c) every player hub renders ≤3 subtabs', () => {
      const PLAYER_HUB_ARRAYS: readonly { id: string; tabs: readonly HubSubNavTab[] }[] = [
        { id: 'player-stats', tabs: PLAYER_STATS_TABS },
        { id: 'player-development', tabs: PLAYER_DEVELOPMENT_TABS },
        { id: 'player-team', tabs: PLAYER_TEAM_TABS },
        { id: 'player-recruiting', tabs: PLAYER_RECRUITING_TABS },
      ];
      for (const { id, tabs } of PLAYER_HUB_ARRAYS) {
        expect(
          tabs.length,
          `player hub "${id}" renders ${tabs.length} subtabs (${tabs.map((t) => t.id).join(', ')}) — Ruling 2 caps every hub at 3`,
        ).toBeLessThanOrEqual(3);
      }
    });

    it('(d) every foldedUnder destination still resolves to its owning hub via resolve-active-hub', () => {
      const folded = BASEBALL_NAV_REGISTRY.filter((e) => e.foldedUnder);
      expect(folded.length, 'sanity: at least one entry should be folded').toBeGreaterThan(0);

      const allCaps = BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as BaseballCapabilityMap);

      for (const entry of folded) {
        const resolved = resolveActiveHub({
          pathname: entry.href,
          role: 'coach',
          // A head coach in every recruiting-eligible + showcase-org program
          // type at once isn't a real user, but this test only needs to prove
          // the ROUTE resolves to a hub somewhere — the per-mode ≤3 cap is
          // already locked by the two tests above.
          programType: 'showcase',
          capabilities: allCaps,
        });
        expect(
          resolved,
          `folded destination "${entry.id}" (${entry.href}, foldedUnder: "${entry.foldedUnder}") does not resolve to any hub via resolveActiveHub`,
        ).not.toBeNull();
        // `.not.toBeNull()` alone only proves SOME hub matched — assert the
        // resolved hub is actually the one this entry claims to fold into
        // (its `tabs` must contain the `foldedUnder` tab id), so a
        // wrong-hub resolution fails the test instead of passing silently.
        expect(
          resolved?.tabs.some((t) => t.id === entry.foldedUnder),
          `folded destination "${entry.id}" (${entry.href}) resolved to hub "${resolved?.id}", whose tabs do not include the claimed foldedUnder id "${entry.foldedUnder}"`,
        ).toBe(true);
      }
    });
  });
});
