import { describe, it, expect } from 'vitest';
import { classifyTeamHealth, sortTeamsByHealth, type GolfTeamHealthRow } from '@/lib/admin/data/golf';

const now = new Date('2026-07-01T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('classifyTeamHealth', () => {
  it('active within 7d', () => {
    expect(classifyTeamHealth(daysAgo(2), now)).toBe('active');
  });
  it('cooling between 7 and 14d', () => {
    expect(classifyTeamHealth(daysAgo(10), now)).toBe('cooling');
  });
  it('dormant past 14d or never', () => {
    expect(classifyTeamHealth(daysAgo(30), now)).toBe('dormant');
    expect(classifyTeamHealth(null, now)).toBe('dormant');
  });
});

describe('sortTeamsByHealth', () => {
  const row = (over: Partial<GolfTeamHealthRow>): GolfTeamHealthRow => ({
    teamId: 't', name: 'Team', playerCount: 1, lastActivity: null, health: 'active', errors7d: 0,
    ...over,
  });

  it('sorts dormant first, cooling next, active last — never alphabetical', () => {
    const sorted = sortTeamsByHealth([
      row({ teamId: 'a', health: 'active' }),
      row({ teamId: 'd', health: 'dormant' }),
      row({ teamId: 'c', health: 'cooling' }),
    ]);
    expect(sorted.map((t) => t.teamId)).toEqual(['d', 'c', 'a']);
  });

  it('breaks ties within a health bucket by most 7d errors first', () => {
    const sorted = sortTeamsByHealth([
      row({ teamId: 'low', health: 'dormant', errors7d: 1 }),
      row({ teamId: 'high', health: 'dormant', errors7d: 9 }),
    ]);
    expect(sorted.map((t) => t.teamId)).toEqual(['high', 'low']);
  });
});
