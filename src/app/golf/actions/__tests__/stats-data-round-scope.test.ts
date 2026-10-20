import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round scope of the detailed stats read (queryDetailedStatsWithClient):
 *
 *   - the round cap ("last 5/10/20" and the 100-round ceiling) is applied AFTER
 *     the countable-round filter. The SQL `.limit()` used to run first, so a
 *     hole-less round among the newest five left "last 5" with four rounds;
 *   - `truncated` is derived from the countable total, not the raw row count;
 *   - an explicit round pick is honoured as-is;
 *   - test rounds (golf_rounds.is_test) stay out of the worst-hole read too.
 *
 * The mock honours `.limit()`, `.range()` and `.in('id', ...)` the way
 * PostgREST does, so a limit pushed to SQL before the countable filter shows.
 */

type Row = Record<string, unknown> & { id: string };

function countable(id: string, date: string): Row {
  return {
    id,
    round_date: date,
    course_name: 'TPC',
    round_type: 'practice',
    total_score: 72,
    score_to_par: 0,
    holes_played: 18,
    total_fairways_hit: 10,
    total_fairways: 14,
    total_gir: 12,
    total_gir_possible: 18,
    total_putts: 30,
    front_nine: 36,
    back_nine: 36,
  };
}

/** Declared 18 holes, no hole totals: not a countable round. */
function holeless(id: string, date: string): Row {
  return { ...countable(id, date), total_score: null, front_nine: null, back_nine: null, total_putts: null };
}

let roundRows: Row[] = [];
const fromCalls: Array<{ table: string; chain: Record<string, { mock: { calls: unknown[][] } }> }> = [];

function makeQuery(table: string) {
  let filtered: Row[] = table === 'golf_rounds' ? roundRows : [];
  let limitN: number | null = null;
  let range: [number, number] | null = null;
  let head = false;
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn((_cols?: string, opts?: { head?: boolean }) => {
    if (opts?.head) head = true;
    return chain;
  });
  for (const m of ['eq', 'gte', 'lte', 'not', 'order', 'filter']) chain[m] = vi.fn(() => chain);
  chain.in = vi.fn((col: string, ids: string[]) => {
    if (col === 'id') filtered = filtered.filter((r) => ids.includes(r.id));
    return chain;
  });
  chain.limit = vi.fn((n: number) => {
    limitN = n;
    return chain;
  });
  chain.range = vi.fn((from: number, to: number) => {
    range = [from, to];
    return chain;
  });
  chain.then = (resolve: (value: unknown) => unknown) => {
    let out = filtered;
    if (limitN !== null) out = out.slice(0, limitN);
    if (range) out = out.slice(range[0], range[1] + 1);
    const result = head
      ? { data: null, error: null, count: filtered.length }
      : { data: out, error: null, count: out.length };
    return Promise.resolve(result).then(resolve);
  };
  fromCalls.push({ table, chain: chain as never });
  return chain;
}

const mocks = vi.hoisted(() => ({
  calculateStatsFromShots: vi.fn(),
}));

const mockFrom = vi.fn((table: string) => makeQuery(table));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    rpc: vi.fn(async () => ({ data: 1, error: null })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    rpc: vi.fn(async () => ({ data: 1, error: null })),
  })),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' as const })),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _meta: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/utils/golf-stats-calculator-shots', () => ({
  calculateStatsFromShots: mocks.calculateStatsFromShots,
}));

import { getDetailedStats, getWorstHoleAnalysis } from '../stats-data';

function roundIdsPassedToCalculator(): string[] {
  const call = mocks.calculateStatsFromShots.mock.calls.at(-1);
  expect(call, 'calculateStatsFromShots was called').toBeDefined();
  return (call![2] as Array<{ id: string }>).map((r) => r.id);
}

describe('getDetailedStats — round cap after the countable filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls.length = 0;
    roundRows = [];
    mocks.calculateStatsFromShots.mockImplementation((_shots: unknown[], _holes: unknown[], rounds: unknown[]) => ({
      roundsPlayed: rounds.length,
      holesPlayed: 0,
    }));
  });

  it('"last 5" with a hole-less round among the newest five still returns five countable rounds', async () => {
    // Newest first. r2 is not countable; the newest FIVE countable rounds are
    // r1, r3, r4, r5, r6. A SQL limit(5) before the filter returns r1..r5 and
    // leaves four.
    roundRows = [
      countable('r1', '2026-09-08'),
      holeless('r2', '2026-09-07'),
      countable('r3', '2026-09-06'),
      countable('r4', '2026-09-05'),
      countable('r5', '2026-09-04'),
      countable('r6', '2026-09-03'),
      countable('r7', '2026-09-02'),
      countable('r8', '2026-09-01'),
    ];

    const stats = await getDetailedStats('player-1', undefined, { preset: 'last5' });

    expect(roundIdsPassedToCalculator()).toEqual(['r1', 'r3', 'r4', 'r5', 'r6']);
    expect(stats.roundsPlayed).toBe(5);
    expect(stats.truncated).toBe(false);
  });

  it('caps at 100 AFTER the filter: 20 uncountable rounds do not eat into the 100', async () => {
    roundRows = [
      ...Array.from({ length: 20 }, (_, i) => holeless(`u${i}`, '2026-09-30')),
      ...Array.from({ length: 110 }, (_, i) => countable(`c${i}`, '2026-08-01')),
    ];

    const stats = await getDetailedStats('player-1');

    const ids = roundIdsPassedToCalculator();
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe('c0');
    expect(ids[99]).toBe('c99');
    // 110 countable rounds against a cap of 100: the window was cut.
    expect(stats.truncated).toBe(true);
  });

  it('computes truncated from the countable total, not the raw row count', async () => {
    // 105 rows, 10 of them uncountable: 95 countable rounds fit the cap, so
    // nothing was cut even though the raw count is above 100.
    roundRows = [
      ...Array.from({ length: 10 }, (_, i) => holeless(`u${i}`, '2026-09-30')),
      ...Array.from({ length: 95 }, (_, i) => countable(`c${i}`, '2026-08-01')),
    ];

    const stats = await getDetailedStats('player-1');

    expect(roundIdsPassedToCalculator()).toHaveLength(95);
    expect(stats.truncated).toBe(false);
  });

  it('pages the round read past the PostgREST 1000-row cap instead of using a SQL limit', async () => {
    roundRows = Array.from({ length: 1200 }, (_, i) => countable(`c${i}`, '2026-08-01'));

    await getDetailedStats('player-1');

    const roundChains = fromCalls.filter((c) => c.table === 'golf_rounds');
    const limitCalls = roundChains.flatMap((c) => c.chain.limit!.mock.calls);
    const rangeCalls = roundChains.flatMap((c) => c.chain.range!.mock.calls);
    expect(limitCalls).toEqual([]);
    expect(rangeCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('honours an explicit round pick as-is, countable or not', async () => {
    roundRows = [countable('r1', '2026-09-08'), holeless('r2', '2026-09-07')];

    const stats = await getDetailedStats('player-1', ['r2']);

    expect(roundIdsPassedToCalculator()).toEqual(['r2']);
    expect(stats.truncated).toBe(false);
  });

  it('never reads test rounds', async () => {
    roundRows = [countable('r1', '2026-09-08')];

    await getDetailedStats('player-1');

    const eqCalls = fromCalls
      .filter((c) => c.table === 'golf_rounds')
      .flatMap((c) => c.chain.eq!.mock.calls);
    expect(eqCalls).toContainEqual(['is_test', false]);
    expect(eqCalls).toContainEqual(['status', 'completed']);
  });
});

describe('getWorstHoleAnalysis — test rounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls.length = 0;
    roundRows = [];
  });

  it('reads only the player\'s completed, non-test rounds, then their holes by round id', async () => {
    roundRows = [countable('r1', '2026-09-01')];

    await getWorstHoleAnalysis('player-1');

    // The test-round exclusion lives on the golf_rounds read now; golf_holes
    // is read through those round ids (no embedded join — Bridge b99a5da6).
    const roundChains = fromCalls.filter((c) => c.table === 'golf_rounds');
    const roundEq = roundChains.flatMap((c) => c.chain.eq!.mock.calls);
    expect(roundEq).toContainEqual(['player_id', 'player-1']);
    expect(roundEq).toContainEqual(['is_test', false]);
    expect(roundEq).toContainEqual(['status', 'completed']);

    const holeChains = fromCalls.filter((c) => c.table === 'golf_holes');
    expect(holeChains.length).toBeGreaterThan(0);
    const holeIn = holeChains.flatMap((c) => c.chain.in!.mock.calls);
    expect(holeIn).toContainEqual(['round_id', ['r1']]);
    const selects = holeChains.flatMap((c) => c.chain.select!.mock.calls.map((a) => String(a[0])));
    expect(selects.some((s) => s.includes('golf_rounds'))).toBe(false);
  });
});
