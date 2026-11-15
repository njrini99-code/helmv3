// @vitest-environment jsdom
//
// GOLF IA REORG — FOUNDATION (docs/golf-ia-plan.json final_migrations #1-#3).
// Locks in the registry's own invariants, then proves the rail resolves the
// SAME canonical name per surface id — the "structurally impossible to
// disagree" contract surface-registry.ts exists to enforce. (CoachHelmSubNav
// and the golf CommandPalette were retired with Fairway, 2026-11-14.)

import { describe, expect, it } from 'vitest';
import {
  GOLF_SURFACES,
  getSurface,
  surfaceName,
  surfaceHref,
  type GolfSurfaceEntry,
} from './surface-registry';
import {
  buildCoachRailSections,
  buildPlayerRailSections,
  GOLF_COACH_HUBS,
  type GolfNavBadgeCounts,
} from './nav-registry';

const ZERO_BADGES: GolfNavBadgeCounts = {
  messages: 0,
  coachhelm: 0,
  calendarNotifications: 0,
  announcements: 0,
  travel: 0,
  tasks: 0,
};

describe('surface-registry — data invariants', () => {
  it('has no duplicate ids', () => {
    const ids = GOLF_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every href is an absolute /golf/dashboard route', () => {
    for (const s of GOLF_SURFACES) {
      expect(s.href.startsWith('/golf/dashboard')).toBe(true);
    }
  });

  it('every canonicalName is non-empty', () => {
    for (const s of GOLF_SURFACES) {
      expect(s.canonicalName.trim().length).toBeGreaterThan(0);
    }
  });

  it('my-insights + the retired player/coach coachhelm-tab entries are the legacy+hidden surfaces', () => {
    // Spine & Stage (2026-07-19, plan Task 8): Development / Game Profile /
    // Standing folded into `?view=` drills of the player Overview home, joining
    // my-insights as permanent-redirect-shim (legacy+hidden) entries. Plan
    // Task 9 mirrors this on the coach side: Signals (+ its Alerts/Insights/
    // Patterns segments), Players, and Effectiveness fold into `?view=` drills
    // of the coach Brief home.
    const legacyHidden = GOLF_SURFACES.filter((s) => s.legacy && s.hidden);
    expect(legacyHidden.map((s) => s.id).sort()).toEqual(
      [
        'my-development-tab',
        'my-game-profile-tab',
        'my-insights',
        'my-standing-tab',
        'signals',
        'players-tab',
        'effectiveness',
        'alerts',
        'insights',
        'patterns',
        'development',
      ].sort(),
    );
  });

  it('surfaceName/surfaceHref throw on an unknown id (fail fast, never silently blank)', () => {
    expect(() => surfaceName('does-not-exist')).toThrow(/unknown surface id/);
    expect(() => surfaceHref('does-not-exist')).toThrow(/unknown surface id/);
    expect(getSurface('does-not-exist')).toBeUndefined();
  });

  it('surfaceName/surfaceHref agree with the raw entry for every id', () => {
    for (const s of GOLF_SURFACES) {
      expect(surfaceName(s.id)).toBe(s.canonicalName);
      expect(surfaceHref(s.id)).toBe(s.href);
    }
  });
});

describe('surface-registry — rail resolves the registry canonical name', () => {
  const byId = (id: string): GolfSurfaceEntry => {
    const s = getSurface(id);
    if (!s) throw new Error(`missing fixture surface ${id}`);
    return s;
  };

  it('coach rail "CoachHelm AI" matches the registry', () => {
    const items = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items);
    const coachHelm = items.find((i) => i.href === byId('rail-coachhelm-ai-coach').href)!;
    expect(coachHelm.label).toBe(surfaceName('rail-coachhelm-ai-coach'));
  });

  it('player rail "CoachHelm AI" and "My Stats" match the registry', () => {
    const items = buildPlayerRailSections(ZERO_BADGES).flatMap((s) => s.items);
    const coachHelm = items.find((i) => i.href === byId('rail-coachhelm-ai-player').href)!;
    const stats = items.find((i) => i.href === byId('rail-my-stats-player').href)!;
    expect(coachHelm.label).toBe(surfaceName('rail-coachhelm-ai-player'));
    expect(stats.label).toBe(surfaceName('rail-my-stats-player'));
  });

  it('the Rounds & Stats hub\'s Team Stats tab matches the registry', () => {
    // The redundant "Stats" hub tab was pruned (golf-ia-plan.json step 9) — it
    // always dead-ended into Team Stats for single-role coaches. /stats itself
    // stays live (registry id 'stats' still resolves — used by the rail's "My
    // Stats" entry and the breadcrumb map) but is no longer its own hub tab.
    const hub = GOLF_COACH_HUBS.find((h) => h.id === 'rounds-stats')!;
    expect(hub.tabs.find((t) => t.id === 'stats')).toBeUndefined();
    const teamStats = hub.tabs.find((t) => t.id === 'team-stats')!;
    expect(teamStats.label).toBe(surfaceName('stats-team'));
  });
});

describe('surface discoverability — no live surface is nav-orphaned', () => {
  it('every non-hidden surface href appears in at least one nav consumer source', async () => {
    const { readFile } = await import('node:fs/promises');
    const consumers = await Promise.all(
      [
        // The Fairway consumers (CoachHelmSubNav, the golf CommandPalette and
        // TriageDesk) were retired with Fairway (2026-11-14); the rail registry
        // is the one left.
        'src/lib/golf/nav-registry.ts',
      ].map((p) => readFile(p, 'utf8')),
    );
    const combined = consumers.join('\n');
    const orphans = GOLF_SURFACES.filter(
      (s) => !s.hidden && !s.legacy && !combined.includes(`'${s.id}'`) && !combined.includes(s.href),
    ).map((s) => s.id);
    expect(orphans).toEqual([]);
  });
});
