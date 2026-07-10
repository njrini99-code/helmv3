// =============================================================================
// src/lib/golf/nav-registry.test.ts
//
// WAVE W2 (2026-07-09) — pins GolfHelm's 8-tab coach / 8-tab player Target IA
// (docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md § Target IA) to
// reality:
//   1. Both roles' rail item count is EXACTLY 8.
//   2. Every hub sub-tab href resolves to a real page.tsx on disk.
//   3. Every OLD flat-nav destination (the pre-W2 15/12-item rail) remains
//      reachable — either as a rail item itself, a hub sub-tab, or (What's
//      New) the documented Dashboard CTA.
//   4. Active-state correctness: a hub's rail item stays lit for every route
//      in its cluster, INCLUDING deep routes (rounds/[id], qualifiers/[id],
//      roster/[id], players/[playerId]); resolveActiveGolfHub resolves the
//      right hub + tab for the same deep routes.
//   5. The CoachHelm cluster fix (P410): /golf/dashboard/players is now part
//      of the coach cluster (previously the rail lost its highlight there).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  GOLF_COACH_HUBS,
  GOLF_PLAYER_HUBS,
  buildCoachRailSections,
  buildPlayerRailSections,
  buildCoachBottomNavItems,
  buildPlayerBottomNavItems,
  resolveActiveGolfHub,
  isCoachHelmCoachCluster,
  isCoachHelmPlayerCluster,
  type GolfNavBadgeCounts,
  type GolfHubDef,
} from './nav-registry';
import type { NavSection } from '@/components/fairway/app-shell/types';

const REPO_ROOT = join(__dirname, '..', '..', '..'); // src/lib/golf -> repo root
const APP_DIR = join(REPO_ROOT, 'src', 'app');

const ZERO_BADGES: GolfNavBadgeCounts = {
  messages: 0,
  coachhelm: 0,
  calendarNotifications: 0,
  announcements: 0,
  travel: 0,
  tasks: 0,
};

// -----------------------------------------------------------------------------
// Filesystem walk — resolve an in-product href to a real page.tsx/route.ts,
// allowing the URL segments to be nested under any number of route groups
// (mirrors the equivalent helper in baseball's nav-manifest.test.ts).
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
    (c) => c.startsWith('(') && c.endsWith(')') && statSync(join(dir, c)).isDirectory() && dirHasRenderable(join(dir, c)),
  );
}

describe('golf nav-registry — Target IA (WAVE W2, 2026-07-09)', () => {
  it('the App Router app dir exists at the resolved path', () => {
    expect(existsSync(APP_DIR)).toBe(true);
  });

  describe('rail item counts — exactly 8 per role', () => {
    it('coach rail has exactly 8 items', () => {
      const sections = buildCoachRailSections(ZERO_BADGES);
      const items = sections.flatMap((s) => s.items);
      expect(items.map((i) => i.label)).toEqual([
        'Dashboard',
        'CoachHelm AI',
        'Team',
        'Calendar',
        'Rounds & Stats',
        'Messages',
        'Operations',
        'Courses',
      ]);
      expect(items).toHaveLength(8);
    });

    it('player rail has exactly 8 items', () => {
      const sections = buildPlayerRailSections(ZERO_BADGES);
      const items = sections.flatMap((s) => s.items);
      expect(items.map((i) => i.label)).toEqual([
        'Dashboard',
        'CoachHelm AI',
        'My Rounds',
        'My Stats',
        'Calendar',
        'Team',
        'Messages',
        'Courses',
      ]);
      expect(items).toHaveLength(8);
    });

    it('mobile bottom nav keeps 5 items per role (Target IA)', () => {
      expect(buildCoachBottomNavItems(ZERO_BADGES).map((i) => i.label)).toEqual([
        'Home',
        'CoachHelm',
        'Team',
        'Calendar',
        'Messages',
      ]);
      expect(buildPlayerBottomNavItems().map((i) => i.label)).toEqual([
        'Home',
        'CoachHelm',
        'Rounds',
        'Stats',
        'Team',
      ]);
    });
  });

  describe('every hub sub-tab href resolves to a real page on disk', () => {
    const allTabs = [
      ...GOLF_COACH_HUBS.flatMap((h) => h.tabs),
      ...GOLF_PLAYER_HUBS.flatMap((h) => h.tabs),
    ];

    it('sanity: hub tabs were actually collected', () => {
      expect(allTabs.length).toBeGreaterThan(5);
    });

    it.each(allTabs.map((t) => [`${t.id} → ${t.href}`, t.href] as const))(
      '%s resolves',
      (_label, href) => {
        expect(routeExists(href)).toBe(true);
      },
    );
  });

  describe('every top-level rail href resolves to a real page on disk', () => {
    const coachHrefs = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items.map((i) => i.href));
    const playerHrefs = buildPlayerRailSections(ZERO_BADGES).flatMap((s) => s.items.map((i) => i.href));

    it.each([...new Set([...coachHrefs, ...playerHrefs])].map((href) => [href] as const))(
      '%s resolves',
      (href) => {
        expect(routeExists(href)).toBe(true);
      },
    );
  });

  describe('no orphaned destinations — every pre-W2 flat-nav route is still reachable', () => {
    // The 15-item coach rail + 12-item player rail this wave replaced
    // (FairwayDashboardShell.tsx pre-W2, see PRODUCTION_READINESS_MISSION_
    // 2026-07-09.md "Nav counts today"). Every one of these must resolve to
    // SOMETHING in the new 8-tab IA: a rail item itself, a hub sub-tab, OR
    // (What's New only) the documented coach Dashboard CTA.
    const PRE_W2_COACH_ROUTES = [
      '/golf/dashboard',
      '/golf/dashboard/intelligence',
      '/golf/dashboard/roster',
      '/golf/dashboard/rounds',
      '/golf/dashboard/calendar',
      '/golf/dashboard/stats',
      '/golf/dashboard/messages',
      '/golf/dashboard/announcements',
      '/golf/dashboard/travel',
      '/golf/dashboard/documents',
      '/golf/dashboard/tasks',
      '/golf/dashboard/courses',
      '/golf/dashboard/recruiting',
      '/golf/dashboard/qualifiers',
      // What's New: rail entry REMOVED by design (Target IA item 1) — folds
      // into the Dashboard hero CTA instead (FairwayCoachDashboard.tsx).
      // Asserted separately below, not against the nav registry.
    ];

    const PRE_W2_PLAYER_ROUTES = [
      '/golf/dashboard',
      // /golf/dashboard/hub: REMOVED by design (Target IA item 1 — merged
      // into Dashboard, route now server-redirects). Asserted separately.
      '/golf/dashboard/coachhelm',
      '/golf/dashboard/rounds',
      '/golf/dashboard/courses',
      '/golf/dashboard/calendar',
      '/golf/dashboard/stats',
      '/golf/dashboard/messages',
      '/golf/dashboard/my-qualifiers',
      '/golf/dashboard/roster',
      '/golf/dashboard/team',
      '/golf/dashboard/team-hub',
    ];

    function allReachableHrefs(railSections: readonly NavSection[], hubs: readonly GolfHubDef[]) {
      const railHrefs = railSections.flatMap((s) => s.items.map((i) => i.href));
      const tabHrefs = hubs.flatMap((h) => h.tabs.map((t) => t.href));
      return new Set([...railHrefs, ...tabHrefs]);
    }

    it.each(PRE_W2_COACH_ROUTES.map((href) => [href] as const))('coach: %s is still reachable', (href) => {
      const reachable = allReachableHrefs(buildCoachRailSections(ZERO_BADGES), GOLF_COACH_HUBS);
      expect(reachable.has(href), `${href} is not a coach rail item OR hub sub-tab`).toBe(true);
    });

    it.each(PRE_W2_PLAYER_ROUTES.map((href) => [href] as const))('player: %s is still reachable', (href) => {
      const reachable = allReachableHrefs(buildPlayerRailSections(ZERO_BADGES), GOLF_PLAYER_HUBS);
      expect(reachable.has(href), `${href} is not a player rail item OR hub sub-tab`).toBe(true);
    });
  });

  describe('active-state correctness — rail highlights the owning hub for every deep route', () => {
    it('coach Team rail item activeMatch covers roster/[id] detail routes', () => {
      const items = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items);
      const team = items.find((i) => i.label === 'Team')!;
      expect(team.activeMatch?.('/golf/dashboard/roster/abc-123')).toBe(true);
    });

    it('coach Rounds & Stats rail item activeMatch covers rounds/[id], qualifiers/[id], and stats/team', () => {
      const items = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items);
      const roundsStats = items.find((i) => i.label === 'Rounds & Stats')!;
      expect(roundsStats.activeMatch?.('/golf/dashboard/rounds/round-1')).toBe(true);
      expect(roundsStats.activeMatch?.('/golf/dashboard/rounds/new')).toBe(true);
      expect(roundsStats.activeMatch?.('/golf/dashboard/qualifiers/q-1')).toBe(true);
      expect(roundsStats.activeMatch?.('/golf/dashboard/stats/team')).toBe(true);
    });

    it('coach CoachHelm AI rail item stays lit on /golf/dashboard/players/[playerId] (P410 fix)', () => {
      const items = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items);
      const coachHelm = items.find((i) => i.label === 'CoachHelm AI')!;
      expect(coachHelm.activeMatch?.('/golf/dashboard/players/player-1')).toBe(true);
      expect(isCoachHelmCoachCluster('/golf/dashboard/players/player-1')).toBe(true);
    });

    it('player Team rail item activeMatch covers roster/[id] and every Team sub-tab', () => {
      const items = buildPlayerRailSections(ZERO_BADGES).flatMap((s) => s.items);
      const team = items.find((i) => i.label === 'Team')!;
      expect(team.activeMatch?.('/golf/dashboard/roster/abc-123')).toBe(true);
      expect(team.activeMatch?.('/golf/dashboard/team')).toBe(true);
      expect(team.activeMatch?.('/golf/dashboard/team-hub')).toBe(true);
      expect(team.activeMatch?.('/golf/dashboard/my-qualifiers')).toBe(true);
    });

    it('player CoachHelm AI cluster does not falsely light on unrelated routes', () => {
      expect(isCoachHelmPlayerCluster('/golf/dashboard/rounds')).toBe(false);
      expect(isCoachHelmPlayerCluster('/golf/dashboard/my-development')).toBe(true);
    });
  });

  describe('bottom-nav activeMatch stays lit on every sibling tab (kills the whole class)', () => {
    // Regression: buildCoachBottomNavItems' Messages item and
    // buildPlayerBottomNavItems' Team item used to omit `tabs` when building
    // the NavItem, so their activeMatch only matched the item's own href —
    // navigating to a SIBLING tab (announcements; team/team-hub/my-qualifiers)
    // left the bottom tab dark even though the equivalent RAIL item (which did
    // pass `tabs`) stayed lit. Every multi-tab hub represented on either
    // bottom nav is asserted here so the whole class of bug can't recur.
    it('coach bottom-nav Team item covers every Team sub-tab (roster, recruiting)', () => {
      const items = buildCoachBottomNavItems(ZERO_BADGES);
      const team = items.find((i) => i.label === 'Team')!;
      const teamHub = GOLF_COACH_HUBS.find((h) => h.id === 'team')!;
      for (const tab of teamHub.tabs) {
        expect(team.activeMatch?.(tab.href), `Team bottom-nav item should stay lit on ${tab.href}`).toBe(true);
      }
    });

    it('coach bottom-nav Calendar item covers every Calendar sub-tab (calendar, travel)', () => {
      const items = buildCoachBottomNavItems(ZERO_BADGES);
      const calendar = items.find((i) => i.label === 'Calendar')!;
      const calendarHub = GOLF_COACH_HUBS.find((h) => h.id === 'calendar')!;
      for (const tab of calendarHub.tabs) {
        expect(calendar.activeMatch?.(tab.href), `Calendar bottom-nav item should stay lit on ${tab.href}`).toBe(true);
      }
    });

    it('coach bottom-nav Messages item covers every Messages sub-tab (messages, announcements)', () => {
      const items = buildCoachBottomNavItems(ZERO_BADGES);
      const messages = items.find((i) => i.label === 'Messages')!;
      const messagesHub = GOLF_COACH_HUBS.find((h) => h.id === 'messages')!;
      for (const tab of messagesHub.tabs) {
        expect(messages.activeMatch?.(tab.href), `Messages bottom-nav item should stay lit on ${tab.href}`).toBe(true);
      }
      // Explicit regression pin — announcements previously went dark.
      expect(messages.activeMatch?.('/golf/dashboard/announcements')).toBe(true);
    });

    it('player bottom-nav Team item covers every Team sub-tab (roster, team-info, team-hub, my-qualifiers)', () => {
      const items = buildPlayerBottomNavItems();
      const team = items.find((i) => i.label === 'Team')!;
      const teamHub = GOLF_PLAYER_HUBS.find((h) => h.id === 'team')!;
      for (const tab of teamHub.tabs) {
        expect(team.activeMatch?.(tab.href), `Team bottom-nav item should stay lit on ${tab.href}`).toBe(true);
      }
      // Explicit regression pins — these previously went dark.
      expect(team.activeMatch?.('/golf/dashboard/team')).toBe(true);
      expect(team.activeMatch?.('/golf/dashboard/team-hub')).toBe(true);
      expect(team.activeMatch?.('/golf/dashboard/my-qualifiers')).toBe(true);
    });
  });

  describe('resolveActiveGolfHub — sub-tab strip resolution', () => {
    it('resolves the coach Rounds & Stats hub on a deep round detail route, with Rounds as the tab', () => {
      const hub = resolveActiveGolfHub('/golf/dashboard/rounds/round-1', 'coach');
      expect(hub?.id).toBe('rounds-stats');
      expect(hub?.tabs.map((t) => t.id)).toContain('rounds');
    });

    it('resolves the coach Rounds & Stats hub on stats/team as the Team Stats tab (longest-prefix wins)', () => {
      const hub = resolveActiveGolfHub('/golf/dashboard/stats/team', 'coach');
      expect(hub?.id).toBe('rounds-stats');
      const teamStats = hub?.tabs.find((t) => t.id === 'team-stats');
      expect(teamStats).toBeTruthy();
    });

    it('resolves the coach Team hub on a roster player-profile detail route', () => {
      const hub = resolveActiveGolfHub('/golf/dashboard/roster/player-1', 'coach');
      expect(hub?.id).toBe('team');
    });

    it('returns null for single-destination rail items (Dashboard, Courses)', () => {
      expect(resolveActiveGolfHub('/golf/dashboard', 'coach')).toBeNull();
      expect(resolveActiveGolfHub('/golf/dashboard/courses', 'coach')).toBeNull();
    });

    it('returns null for the CoachHelm cluster (owns its own separate strip)', () => {
      expect(resolveActiveGolfHub('/golf/dashboard/intelligence', 'coach')).toBeNull();
      expect(resolveActiveGolfHub('/golf/dashboard/players/player-1', 'coach')).toBeNull();
    });

    it('resolves the player Team hub on every one of its sub-tabs', () => {
      for (const href of ['/golf/dashboard/roster', '/golf/dashboard/team', '/golf/dashboard/team-hub', '/golf/dashboard/my-qualifiers']) {
        expect(resolveActiveGolfHub(href, 'player')?.id).toBe('team');
      }
    });
  });

  describe("What's New (coach-only) — folded into the Dashboard CTA, not a rail item", () => {
    it('is not a coach rail item or hub sub-tab (Target IA item 1: rail entry removed)', () => {
      const railHrefs = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items.map((i) => i.href));
      const tabHrefs = GOLF_COACH_HUBS.flatMap((h) => h.tabs.map((t) => t.href));
      expect([...railHrefs, ...tabHrefs]).not.toContain('/golf/dashboard/whats-new');
    });

    it('the route itself still resolves on disk (reachable via the Dashboard CTA)', () => {
      expect(routeExists('/golf/dashboard/whats-new')).toBe(true);
    });
  });

  describe('the former player Hub route — merged into Dashboard, not a rail item', () => {
    it('/golf/dashboard/hub is not a player rail item or hub sub-tab', () => {
      const railHrefs = buildPlayerRailSections(ZERO_BADGES).flatMap((s) => s.items.map((i) => i.href));
      const tabHrefs = GOLF_PLAYER_HUBS.flatMap((h) => h.tabs.map((t) => t.href));
      expect([...railHrefs, ...tabHrefs]).not.toContain('/golf/dashboard/hub');
    });

    it('the route itself still resolves on disk (kept as a redirect stub)', () => {
      expect(routeExists('/golf/dashboard/hub')).toBe(true);
    });
  });

  describe('hub sub-tab caps stay small (no accidental sprawl)', () => {
    it.each(GOLF_COACH_HUBS.map((h) => [h.id, h.tabs.length] as const))(
      'coach hub "%s" has %i tabs (2-4 expected)',
      (_id, len) => {
        expect(len).toBeGreaterThanOrEqual(2);
        expect(len).toBeLessThanOrEqual(4);
      },
    );
    it.each(GOLF_PLAYER_HUBS.map((h) => [h.id, h.tabs.length] as const))(
      'player hub "%s" has %i tabs (2-4 expected)',
      (_id, len) => {
        expect(len).toBeGreaterThanOrEqual(2);
        expect(len).toBeLessThanOrEqual(4);
      },
    );
  });

  describe('badge wiring', () => {
    it('only renders a badge when the count is > 0 (never a fake zero)', () => {
      const items = buildCoachRailSections({ ...ZERO_BADGES, messages: 3 }).flatMap((s) => s.items);
      const messages = items.find((i) => i.label === 'Messages')!;
      expect(messages.badge).toBe(3);

      const zeroed = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items);
      const messagesZero = zeroed.find((i) => i.label === 'Messages')!;
      expect(messagesZero.badge).toBeUndefined();
    });
  });
});
