import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getPlayerPatterns used to `ORDER BY stroke_impact DESC LIMIT 10`. Impact is
 * signed (a leak is negative), so the ten LARGEST POSITIVE rows won and the
 * biggest leaks fell off the list (48 of 68 production players lost them).
 * PostgREST cannot order by abs(), so the action now reads the player's active
 * rows (bounded, at most a few dozen per player) and ranks them by absolute
 * impact in JS before cutting to ten.
 *
 * The mock emulates PostgREST's `.order()` and `.limit()` on the pattern rows,
 * so a LIMIT pushed to SQL before the ranking drops the negative rows here too.
 */

type PatternRow = {
  id: string;
  player_id: string;
  pattern_type: string;
  conditions: unknown;
  outcome: unknown;
  support: number;
  confidence: number;
  lift: number;
  conviction: number;
  stroke_impact: number | null;
  actionability: number;
  sample_size: number;
  first_detected: string;
  last_occurrence: string;
  occurrence_count: number;
  trend: string;
  is_active: boolean;
  metadata: Record<string, string>;
};

function pattern(id: string, stroke_impact: number | null): PatternRow {
  return {
    id,
    player_id: 'player-1',
    pattern_type: 'sequence',
    conditions: [],
    outcome: {},
    support: 10,
    confidence: 0.8,
    lift: 1.2,
    conviction: 1.1,
    stroke_impact,
    actionability: 0.5,
    sample_size: 20,
    first_detected: '2026-08-01',
    last_occurrence: '2026-09-20',
    occurrence_count: 5,
    trend: 'stable',
    is_active: true,
    metadata: { description: `d-${id}`, recommendation: `r-${id}` },
  };
}

let patternRows: PatternRow[] = [];
const patternQueries: Array<{ orders: Array<[string, unknown]>; limits: number[] }> = [];

function makePatternsQuery() {
  const orders: Array<[string, unknown]> = [];
  const limits: number[] = [];
  patternQueries.push({ orders, limits });
  const node: Record<string, unknown> = {};
  node.select = () => node;
  node.eq = () => node;
  node.order = (column: string, opts?: unknown) => {
    orders.push([column, opts]);
    return node;
  };
  node.limit = (n: number) => {
    limits.push(n);
    return node;
  };
  node.then = (resolve: (v: unknown) => unknown) => {
    let out = [...patternRows];
    // Apply the orders PostgREST would, in call order (the last `.order()` is
    // the least significant key: sort by it first, stable).
    for (const [column, opts] of [...orders].reverse()) {
      const ascending = (opts as { ascending?: boolean } | undefined)?.ascending !== false;
      out.sort((a, b) => {
        const av = (a as unknown as Record<string, number | string | null>)[column] ?? 0;
        const bv = (b as unknown as Record<string, number | string | null>)[column] ?? 0;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    if (limits.length > 0) out = out.slice(0, Math.min(...limits));
    return Promise.resolve({ data: out, error: null }).then(resolve);
  };
  return node;
}

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _meta: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'golf_patterns_v2') return makePatternsQuery();
      throw new Error(`unexpected table in test: ${table}`);
    },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({}) }),
}));
vi.mock('@/lib/auth/verify-player-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/verify-player-access')>()),
  // 'coach' with no coachId skips the extra team lookups in the local wrapper.
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'coach' as const })),
}));
vi.mock('@/lib/coachhelm/v2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/coachhelm/v2')>()),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true })),
}));

import { getPlayerPatterns } from '../insights';

describe('getPlayerPatterns — ranked by absolute stroke impact', () => {
  beforeEach(() => {
    patternQueries.length = 0;
    patternRows = [];
  });

  it('keeps the biggest NEGATIVE leaks in the top ten, largest size first', async () => {
    // 12 small positive rows would fill a signed top 10 on their own.
    patternRows = [
      ...Array.from({ length: 12 }, (_, i) => pattern(`pos${String(i).padStart(2, '0')}`, 0.1 + i * 0.1)),
      pattern('leak-big', -6.5),
      pattern('leak-mid', -2.4),
    ];

    const result = await getPlayerPatterns('player-1');

    expect(result.success).toBe(true);
    const ids = (result.patterns ?? []).map((p) => p.id);
    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe('leak-big');
    expect(ids).toContain('leak-mid');
    // Every returned pattern is at least as large as every pattern left out.
    const returnedMin = Math.min(...(result.patterns ?? []).map((p) => Math.abs(p.strokeImpact)));
    const leftOut = patternRows.filter((r) => !ids.includes(r.id));
    for (const r of leftOut) expect(Math.abs(r.stroke_impact ?? 0)).toBeLessThanOrEqual(returnedMin);
  });

  it('does not push a LIMIT 10 to SQL before ranking (the read is bounded, not cut to ten)', async () => {
    patternRows = [pattern('a', 1), pattern('b', -2)];

    await getPlayerPatterns('player-1');

    const limits = patternQueries.flatMap((q) => q.limits);
    expect(limits.every((n) => n > 10)).toBe(true);
    expect(limits.every((n) => n <= 1000)).toBe(true);
  });

  it('maps a pattern row to MinedPattern unchanged', async () => {
    patternRows = [pattern('only', -1.25)];

    const result = await getPlayerPatterns('player-1');

    expect(result.patterns).toEqual([
      expect.objectContaining({
        id: 'only',
        playerId: 'player-1',
        strokeImpact: -1.25,
        description: 'd-only',
        recommendation: 'r-only',
        isActive: true,
      }),
    ]);
  });
});
