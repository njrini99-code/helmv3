import { describe, expect, it } from 'vitest';
import {
  filterHubTabsByCapabilities,
  resolveActiveHub,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
import {
  COACH_MANAGEMENT_TABS,
  COACH_STATS_TABS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';

describe('resolveActiveHub — capability-filtered tabs (#370)', () => {
  it('hides performance hub tabs when coach lacks lifting and readiness caps', () => {
    const filtered = filterHubTabsByCapabilities(COACH_STATS_TABS, 'coach', {
      can_manage_stats: true,
    });
    const performanceIds = filtered
      .filter((t) => t.id.startsWith('performance'))
      .map((t) => t.id);
    expect(performanceIds).toEqual([]);
  });

  it('shows performance overview when coach has can_view_readiness only', () => {
    const filtered = filterHubTabsByCapabilities(COACH_STATS_TABS, 'coach', {
      can_view_readiness: true,
    });
    expect(filtered.some((t) => t.id === 'performance')).toBe(true);
    expect(filtered.some((t) => t.id === 'performance-programs')).toBe(false);
  });

  it('filters performance-programs from stats hub when coach lacks can_manage_lifting', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/performance/programs',
      role: 'coach',
      programType: 'college',
      capabilities: { can_manage_stats: true },
    });
    expect(hub?.id).toBe('stats');
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

  it('activates the management hub on nested settings routes', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/settings/imports',
      role: 'coach',
      programType: 'college',
      capabilities: { can_manage_settings: true, can_manage_imports: true },
    });
    expect(hub?.id).toBe('management');
    expect(hub?.tabs.some((t) => t.id === 'settings-imports')).toBe(true);
  });

  it('activates the player recruiting hub on exposure routes', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/analytics',
      role: 'player',
      programType: 'high_school',
    });
    expect(hub?.id).toBe('recruiting');
  });

  it('includes settings home via program-settings href (ownedPrefixes, not duplicate matchPrefixes)', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/settings',
      role: 'coach',
      programType: 'college',
      capabilities: { can_manage_settings: true },
    });
    expect(hub?.id).toBe('management');
    expect(hub?.tabs.some((t) => t.id === 'settings-home')).toBe(true);
  });

  it('activates academics for college coaches with the academics capability', () => {
    const hub = resolveActiveHub({
      pathname: '/baseball/dashboard/academics',
      role: 'coach',
      programType: 'college',
      capabilities: { can_view_academics: true },
    });
    expect(hub?.id).toBe('academics');
    expect(hub?.tabs.map((t) => t.id)).toEqual(['academics']);
  });
});

describe('COACH_MANAGEMENT_TABS — settings supplement anchor', () => {
  it('includes the program-settings registry tab before settings supplements', () => {
    expect(COACH_MANAGEMENT_TABS.some((t) => t.id === 'program-settings')).toBe(true);
    expect(COACH_MANAGEMENT_TABS.some((t) => t.id === 'settings-home')).toBe(true);
  });
});
