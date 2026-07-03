import { describe, it, expect } from 'vitest';
import {
  rankBriefingItems,
  computeWoWDelta,
  findNewlyDormantTeams,
  topErrorCluster,
} from '@/lib/admin/data/briefing';

describe('rankBriefingItems', () => {
  it('puts every attention item before every watch item', () => {
    const ranked = rankBriefingItems([
      { severity: 'watch', headline: 'w1', href: null, priority: 0 },
      { severity: 'attention', headline: 'a1', href: null, priority: 5 },
    ]);
    expect(ranked.map((r) => r.headline)).toEqual(['a1', 'w1']);
  });

  it('breaks ties within a severity by fixed priority, not input order', () => {
    const ranked = rankBriefingItems([
      { severity: 'attention', headline: 'second', href: null, priority: 2 },
      { severity: 'attention', headline: 'first', href: null, priority: 1 },
    ]);
    expect(ranked.map((r) => r.headline)).toEqual(['first', 'second']);
  });

  it('caps at 6 items', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      severity: 'watch' as const, headline: `w${i}`, href: null, priority: i,
    }));
    expect(rankBriefingItems(candidates)).toHaveLength(6);
  });

  it('drops the priority field from the final output shape', () => {
    const [item] = rankBriefingItems([{ severity: 'attention', headline: 'a', href: '/x', priority: 0 }]);
    expect(item).toEqual({ severity: 'attention', headline: 'a', href: '/x' });
  });
});

describe('computeWoWDelta', () => {
  it('returns null when last week had zero rounds (no comparable ratio)', () => {
    expect(computeWoWDelta(5, 0)).toBeNull();
    expect(computeWoWDelta(0, 0)).toBeNull();
  });
  it('computes a positive delta for growth', () => {
    expect(computeWoWDelta(15, 10)).toBeCloseTo(0.5);
  });
  it('computes a negative delta for decline', () => {
    expect(computeWoWDelta(5, 10)).toBeCloseTo(-0.5);
  });
});

describe('findNewlyDormantTeams', () => {
  const now = new Date('2026-07-02T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

  it('flags a team whose last activity crossed the dormant threshold within the past week', () => {
    const teams = [{ teamId: 't1', name: 'Team A', lastActivity: daysAgo(16) }];
    const flagged = findNewlyDormantTeams(teams, now);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.teamId).toBe('t1');
  });

  it('does not flag a team that is still active/cooling (< 14 days)', () => {
    expect(findNewlyDormantTeams([{ teamId: 't1', name: 'A', lastActivity: daysAgo(5) }], now)).toEqual([]);
  });

  it('does not flag a team dormant for a long time already (> 21 days) — not "newly"', () => {
    expect(findNewlyDormantTeams([{ teamId: 't1', name: 'A', lastActivity: daysAgo(90) }], now)).toEqual([]);
  });

  it('does not flag a team with no known activity ever (already-dormant, not newly)', () => {
    expect(findNewlyDormantTeams([{ teamId: 't1', name: 'A', lastActivity: null }], now)).toEqual([]);
  });

  it('sorts multiple matches by ageDays ascending', () => {
    const teams = [
      { teamId: 'older', name: 'Older', lastActivity: daysAgo(20) },
      { teamId: 'newer', name: 'Newer', lastActivity: daysAgo(15) },
    ];
    const flagged = findNewlyDormantTeams(teams, now);
    expect(flagged.map((t) => t.teamId)).toEqual(['newer', 'older']);
  });
});

describe('topErrorCluster', () => {
  it('returns null below the minimum cluster size (no noise from one-offs)', () => {
    expect(topErrorCluster([{ id: '1', created_at: '2026-07-01T00:00:00Z', title: 'A', severity: 'error', fingerprint: 'fp-1' }])).toBeNull();
  });

  it('picks the largest cluster by occurrence count', () => {
    const rows = [
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'Small', severity: 'error', fingerprint: 'fp-small' },
      { id: '2', created_at: '2026-07-01T00:00:00Z', title: 'Small', severity: 'error', fingerprint: 'fp-small' },
      { id: '3', created_at: '2026-07-01T00:00:00Z', title: 'Big', severity: 'error', fingerprint: 'fp-big' },
      { id: '4', created_at: '2026-07-01T00:01:00Z', title: 'Big', severity: 'error', fingerprint: 'fp-big' },
      { id: '5', created_at: '2026-07-01T00:02:00Z', title: 'Big', severity: 'error', fingerprint: 'fp-big' },
    ];
    const cluster = topErrorCluster(rows);
    expect(cluster?.fingerprint).toBe('fp-big');
    expect(cluster?.occurrences).toBe(3);
  });

  it('flags anyCritical true if any row in the winning cluster is critical', () => {
    const rows = [
      { id: '1', created_at: '2026-07-01T00:00:00Z', title: 'A', severity: 'error', fingerprint: 'fp-1' },
      { id: '2', created_at: '2026-07-01T00:01:00Z', title: 'A', severity: 'critical', fingerprint: 'fp-1' },
    ];
    expect(topErrorCluster(rows)?.anyCritical).toBe(true);
  });

  it('returns null for no rows', () => {
    expect(topErrorCluster([])).toBeNull();
  });
});
