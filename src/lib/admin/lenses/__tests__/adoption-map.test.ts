import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeatureAdoptionResult, FeatureAdoptionUserRow, FeatureAdoptionRow } from '@/lib/admin/data/feature-adoption';
import type { DirectoryUser } from '@/lib/admin/data/users';

let adoptionResult: FeatureAdoptionResult;
vi.mock('@/lib/admin/data/feature-adoption', () => ({
  fetchFeatureAdoption: async () => adoptionResult,
}));

let usersResult: { users: DirectoryUser[]; totalUsersCount: number; teams: []; atRisk: DirectoryUser[] };
vi.mock('@/lib/admin/data/users', () => ({
  fetchUsersTab: async () => usersResult,
}));

import { fetchAdoptionMapLens } from '../adoption-map';

function adoptionUser(overrides: Partial<FeatureAdoptionUserRow> = {}): FeatureAdoptionUserRow {
  return {
    userId: 'u1',
    userEmail: 'nick@example.com',
    teamId: 't1',
    teamLabel: 'Rini University',
    apps: ['golfhelm'],
    featureKeys: ['round_tracking'],
    breadth: 1,
    depthEventCount: 5,
    depthFeatureKey: 'round_tracking',
    depthFeatureLabel: 'Round tracking',
    ...overrides,
  };
}

function featureRow(overrides: Partial<FeatureAdoptionRow> = {}): FeatureAdoptionRow {
  return {
    key: 'round_tracking',
    label: 'Round tracking',
    app: 'golfhelm',
    tier: 'high',
    primaryTable: 'golf_rounds',
    healthSignal: 'ok',
    knownGaps: [],
    days30: [],
    weeks12: [],
    rowMax30: 5,
    rowMax12w: 5,
    uniqueUsers30d: 10,
    uniqueUsers7d: 3,
    uniqueUsersPrev7d: 4,
    delta7dPct: -25,
    eventCount14d: [],
    quietDays: 0,
    dropoutRisk: false,
    topPowerUsers: [],
    recentEvents: [],
    ...overrides,
  };
}

describe('fetchAdoptionMapLens', () => {
  beforeEach(() => {
    adoptionResult = { status: 'ok', generatedAt: '2026-09-03T00:00:00Z', rows: [], users: [], readouts: { touchedToday: 0, quiet14d: 0, dropoutRiskCount: 0 } };
    usersResult = { users: [], totalUsersCount: 0, teams: [], atRisk: [] };
  });

  it('an empty platform (no adopting users) produces empty groups, not fabricated rows', async () => {
    const lens = await fetchAdoptionMapLens();
    expect(lens.byTeam).toEqual([]);
    expect(lens.byRole).toEqual([]);
  });

  it('groups adoption by team and by role, joining role from the directory', async () => {
    adoptionResult = {
      ...adoptionResult,
      users: [
        adoptionUser({ userId: 'u1', teamId: 't1', teamLabel: 'Rini University' }),
        adoptionUser({ userId: 'u2', teamId: 't1', teamLabel: 'Rini University', featureKeys: ['stats_analytics'] }),
      ],
    };
    usersResult = {
      users: [
        { id: 'u1', email: 'a@x.com', role: 'coach', createdAt: null, lastSeen: null, sports: ['golf'] },
        { id: 'u2', email: 'b@x.com', role: 'player', createdAt: null, lastSeen: null, sports: ['golf'] },
      ],
      totalUsersCount: 2,
      teams: [],
      atRisk: [],
    };

    const lens = await fetchAdoptionMapLens();

    expect(lens.byTeam).toHaveLength(1);
    expect(lens.byTeam[0]!.userCount).toBe(2);
    expect(lens.byRole.map((r) => r.key).sort()).toEqual(['coach', 'player']);
    expect(lens.roleCoverageNote).toBeNull();
  });

  it('a user outside the 500-cap directory shows an unknown role, not a wrong one, and discloses the cap', async () => {
    adoptionResult = { ...adoptionResult, users: [adoptionUser({ userId: 'ghost' })] };
    usersResult = { users: [], totalUsersCount: 501, teams: [], atRisk: [] };

    const lens = await fetchAdoptionMapLens();

    expect(lens.byRole.find((r) => r.key === 'unknown')).toBeDefined();
    expect(lens.roleCoverageNote).toContain('500');
  });

  it('feature signals are tied to reliability via the same dropoutRisk/delta7dPct fields Utilization already renders', async () => {
    adoptionResult = { ...adoptionResult, rows: [featureRow({ key: 'calendar_events', label: 'Calendar', uniqueUsers30d: 78, delta7dPct: -18, dropoutRisk: true })] };

    const lens = await fetchAdoptionMapLens();

    expect(lens.featureSignals[0]).toMatchObject({ key: 'calendar_events', uniqueUsers30d: 78, delta7dPct: -18, dropoutRisk: true });
  });

  it('a failed adoption read is disclosed, not silently absorbed', async () => {
    adoptionResult = { ...adoptionResult, status: 'error', error: 'admin_events read failed' };

    const lens = await fetchAdoptionMapLens();

    expect(lens.degradedNote).toContain('feature adoption read failed');
  });
});
