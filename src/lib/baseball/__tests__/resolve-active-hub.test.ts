import { describe, expect, it } from 'vitest';
import {
  filterHubTabsByCapabilities,
  resolveActiveHub,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
import {
  COACH_DEVELOPMENT_TABS,
  COACH_MANAGEMENT_TABS,
  COACH_MESSAGES_TABS,
  COACH_STATS_TABS,
  COACH_TEAM_TABS,
  COACH_RECRUITING_TABS,
  COACH_ACADEMICS_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';

describe('resolveActiveHub — capability-filtered tabs (#370)', () => {
  it('hides the Training (performance) tab when coach lacks lifting and readiness caps', () => {
    const filtered = filterHubTabsByCapabilities(COACH_DEVELOPMENT_TABS, 'coach', {
      can_manage_stats: true,
    });
    expect(filtered.some((t) => t.id === 'performance')).toBe(false);
  });

  it('shows the Training (performance) tab when coach has can_view_readiness only', () => {
    const filtered = filterHubTabsByCapabilities(COACH_DEVELOPMENT_TABS, 'coach', {
      can_view_readiness: true,
    });
    expect(filtered.some((t) => t.id === 'performance')).toBe(true);
  });

  it('Ruling 2: the Training tab reads "Training" in the hub strip (hubTabLabel override)', () => {
    const performance = COACH_DEVELOPMENT_TABS.find((t) => t.id === 'performance');
    expect(performance?.label).toBe('Training');
  });

  it('keeps /performance/programs (a Live Weight Room sub-route reached via in-page links, not its own tab) inside the Development hub', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/performance/programs',
      role: 'coach',
      programType: 'college',
      capabilities: { can_manage_lifting: true },
    });
    expect(hub?.id).toBe('development');
    // performance/programs is NOT its own hub-tab post-Ruling-2 (reached via
    // the Performance page's own in-page masthead links) — it resolves to the
    // Training (performance) tab via that entry's matchPrefixes.
    expect(hub?.tabs.some((t) => t.id === 'performance')).toBe(true);
    expect(hub?.tabs.some((t) => t.id === 'performance-programs')).toBe(false);
  });

  it('keeps dynamic box-score details inside the coach stats hub', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/stats/games/demo-game-id',
      role: 'coach',
      programType: 'college',
      capabilities: { can_manage_stats: true },
    });
    expect(hub?.id).toBe('stats');
    expect(hub?.tabs.some((t) => t.id === 'games')).toBe(true);
  });

  it('resolves Stats Center Upload + Import Center into the Stats hub (Ruling 2: CTAs/view inside Stats Center, not their own tabs)', () => {
    for (const pathname of [
      '/baseball/dashboard/stats/upload',
      '/baseball/dashboard/import',
    ]) {
      const hub = resolveActiveHub({
        pathname,
        role: 'coach',
        programType: 'college',
        capabilities: { can_manage_stats: true, can_manage_imports: true },
      });
      expect(hub?.id, `${pathname} should resolve to the stats hub`).toBe('stats');
      expect(hub?.tabs.some((t) => t.id === 'stats-center')).toBe(true);
    }
  });

  it('keeps coach dev-plan details inside the development hub', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/dev-plans/demo-plan-id',
      role: 'coach',
      programType: 'college',
      capabilities: {},
    });
    expect(hub?.id).toBe('development');
    expect(hub?.tabs.some((t) => t.id === 'dev-plans')).toBe(true);
  });

  it('resolves Team>Operations folds (Documents/Travel/Practice Planner/Practice Effectiveness) into the Team hub, Operations subtab', () => {
    for (const pathname of [
      '/baseball/dashboard/documents',
      '/baseball/dashboard/travel',
      '/baseball/dashboard/practice',
      '/baseball/dashboard/practice-effectiveness',
    ]) {
      const hub = resolveActiveHub({
        pathname,
        role: 'coach',
        programType: 'college',
        capabilities: { can_manage_practice: true },
      });
      expect(hub?.id, `${pathname} should resolve to the team hub`).toBe('team');
      expect(hub?.tabs.some((t) => t.id === 'operations')).toBe(true);
    }
  });

  it('resolves /dashboard/announcements to the Messages hub, Announcements subtab (Ruling 2: moved off Team)', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/announcements',
      role: 'coach',
      programType: 'college',
      capabilities: {},
    });
    expect(hub?.id).toBe('messages');
    expect(hub?.tabs.map((t) => t.id)).toEqual(COACH_MESSAGES_TABS.map((t) => t.id));
    expect(hub?.tabs.some((t) => t.id === 'announcements')).toBe(true);
  });

  it('the Messages hub renders exactly Messages + Announcements', () => {
    expect(COACH_MESSAGES_TABS.map((t) => t.id)).toEqual(['messages', 'announcements']);
  });

  it('activates the management hub, Settings subtab on nested settings routes (Ruling 2: the 9-tab splice is gone)', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/settings/imports',
      role: 'coach',
      programType: 'college',
      capabilities: { can_manage_settings: true, can_manage_imports: true },
    });
    expect(hub?.id).toBe('management');
    expect(hub?.tabs.some((t) => t.id === 'settings')).toBe(true);
    // The old per-section hub-tab ids no longer exist — the whole
    // /dashboard/settings/* tree resolves via the single "settings" tab.
    expect(hub?.tabs.some((t) => t.id === 'settings-imports')).toBe(false);
  });

  it('activates the player recruiting hub on exposure routes', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/analytics',
      role: 'player',
      programType: 'high_school',
    });
    expect(hub?.id).toBe('recruiting');
  });

  it('resolves the Settings landing itself (and Program Info, a non-nested fold) into the management hub', () => {
    for (const pathname of ['/baseball/dashboard/settings', '/baseball/dashboard/program']) {
      const hub = resolveActiveHub({
        pathname,
        role: 'coach',
        programType: 'college',
        capabilities: { can_manage_settings: true },
      });
      expect(hub?.id, `${pathname} should resolve to the management hub`).toBe('management');
      expect(hub?.tabs.some((t) => t.id === 'settings')).toBe(true);
    }
  });

  it('resolves Teams/Events into the management hub, Organization subtab for showcase-type programs', () => {
    for (const pathname of ['/baseball/dashboard/teams', '/baseball/dashboard/events']) {
      const hub = resolveActiveHub({
        pathname,
        role: 'coach',
        programType: 'showcase',
        capabilities: { can_manage_settings: true },
      });
      expect(hub?.id, `${pathname} should resolve to the management hub`).toBe('management');
      expect(hub?.tabs.some((t) => t.id === 'organization')).toBe(true);
    }
  });

  it('academics renders no sub-nav strip for college coaches (single-tab hub — a lonely un-navigable strip is suppressed)', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/academics',
      role: 'coach',
      programType: 'college',
      capabilities: { can_view_academics: true },
    });
    // resolveActiveHub returns null for a hub whose visible tabs resolve to
    // exactly one (nothing to navigate to) — the route still renders, just
    // with no HubSubNav strip above it. The underlying tab data is unchanged.
    expect(hub).toBeNull();
    expect(COACH_ACADEMICS_TABS.map((t) => t.id)).toEqual(['academics']);
  });

  it('resolves Recruiting>Scouting folds (Watchlist/Compare/Saved Comparisons/Scout Packets/Camps) into the Recruiting hub, Scouting subtab', () => {
    for (const pathname of [
      '/baseball/dashboard/watchlist',
      '/baseball/dashboard/compare',
      '/baseball/dashboard/comparisons',
      '/baseball/dashboard/scout-packets',
      '/baseball/dashboard/camps',
    ]) {
      const hub = resolveActiveHub({
        pathname,
        role: 'coach',
        programType: 'showcase',
        capabilities: { can_manage_roster: true, can_export_reports: true },
      });
      expect(hub?.id, `${pathname} should resolve to the recruiting hub`).toBe('recruiting');
      expect(hub?.tabs.some((t) => t.id === 'scouting')).toBe(true);
    }
  });

  it('resolves /dashboard/college-interest into the Recruiting hub, Pipeline subtab', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/college-interest',
      role: 'coach',
      programType: 'college',
      capabilities: {},
    });
    expect(hub?.id).toBe('recruiting');
    expect(hub?.tabs.some((t) => t.id === 'pipeline')).toBe(true);
  });
});

describe('every coach hub caps at 3 rendered subtabs (Ruling 2)', () => {
  it.each([
    ['stats-performance', COACH_STATS_TABS],
    ['development', COACH_DEVELOPMENT_TABS],
    ['management', COACH_MANAGEMENT_TABS],
    ['messages', COACH_MESSAGES_TABS],
    ['team', COACH_TEAM_TABS],
    ['recruiting', COACH_RECRUITING_TABS],
    ['academics', COACH_ACADEMICS_TABS],
  ] as const)('%s renders ≤3 tabs', (_hub, tabs) => {
    expect(tabs.length).toBeLessThanOrEqual(3);
  });
});
