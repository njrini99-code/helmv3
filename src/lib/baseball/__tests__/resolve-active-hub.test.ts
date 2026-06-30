import { describe, expect, it } from 'vitest';
import {
  filterHubTabsByCapabilities,
  resolveActiveHub,
} from '@/app/baseball/(dashboard)/_components/resolve-active-hub';
import { COACH_STATS_TABS } from '@/app/baseball/(dashboard)/_components/hub-definitions';

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
});
