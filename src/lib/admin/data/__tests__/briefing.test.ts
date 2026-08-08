import { describe, it, expect, vi, beforeEach } from 'vitest';

// Generic chainable Supabase query-builder mock: every fluent method (select,
// eq, gte, lt, not, in, order, limit, ...) returns the same chain object, and
// the chain itself is thenable so `await` resolves it at whatever point the
// real code stops chaining. `gte()` additionally records its calls per-table
// so tests can assert a recency bound was actually applied to the query,
// since the mock can't emulate real Postgres row filtering.
const mocks = vi.hoisted(() => ({
  gteCalls: [] as Array<{ table: string; column: string; value: unknown }>,
  tableResults: {} as Record<string, { data: unknown[] | null; error: unknown; count?: number }>,
}));

function makeChain(table: string) {
  const result = () => mocks.tableResults[table] ?? { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    in: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result()),
    // Terminal call for fetchAllRowsResult-driven queries (checkNewlyDormantTeams):
    // resolves directly to { data, error } (matching PostgREST's `.range()`),
    // slicing when the mocked data is an array so pagination still terminates.
    range: () => {
      const r = result();
      return { data: Array.isArray(r.data) ? r.data.slice() : r.data, error: r.error };
    },
    gte: (column: string, value: unknown) => {
      mocks.gteCalls.push({ table, column, value });
      return chain;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeChain(table),
  }),
}));

import {
  rankBriefingItems,
  computeWoWDelta,
  findNewlyDormantTeams,
  topErrorCluster,
  fetchBriefing,
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

describe('fetchBriefing — checkAuthFailureConcentration recency bound', () => {
  beforeEach(() => {
    mocks.gteCalls.length = 0;
    mocks.tableResults = {};
  });

  it('applies a `last_attempt` recency filter to the login_attempts query (not just failed_attempts)', async () => {
    mocks.tableResults.login_attempts = { data: [], error: null };
    await fetchBriefing();
    const loginAttemptsGtes = mocks.gteCalls.filter((c) => c.table === 'login_attempts');
    expect(loginAttemptsGtes.some((c) => c.column === 'failed_attempts')).toBe(true);
    // The fix under test: a second, time-bound filter so a stale/abandoned
    // lockout can't pin itself at the top of the briefing forever.
    const recency = loginAttemptsGtes.find((c) => c.column === 'last_attempt');
    expect(recency).toBeDefined();
    expect(typeof recency!.value).toBe('string');
    const cutoffMs = new Date(recency!.value as string).getTime();
    expect(Date.now() - cutoffMs).toBeLessThanOrEqual(24 * 3600_000 + 1000);
    expect(Date.now() - cutoffMs).toBeGreaterThan(23 * 3600_000);
  });

  it('surfaces a candidate when a matching row is returned within the (mocked) window', async () => {
    mocks.tableResults.login_attempts = {
      data: [{ email: 'attacked@example.com', failed_attempts: 9, locked_until: null }],
      error: null,
    };
    mocks.tableResults.users = { data: { id: 'user-1' }, error: null } as unknown as { data: unknown[] | null; error: unknown };
    const { items } = await fetchBriefing();
    const hit = items.find((i) => i.headline.includes('attacked@example.com'));
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe('attention');
  });

  it('surfaces nothing when login_attempts has no rows (e.g. old lockouts fell outside the recency window)', async () => {
    mocks.tableResults.login_attempts = { data: [], error: null };
    const { items } = await fetchBriefing();
    expect(items.some((i) => i.headline.includes('failed sign-in'))).toBe(false);
  });
});
