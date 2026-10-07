import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit row 31 (2026-09-28): player shot analytics.
 *   - the silent 30 → 90 day widening changed every rate's basis without a
 *     label — the payload now says which window produced the data;
 *   - threshold rules (three-putt > 10%, GIR < 40% ...) fired on any hole
 *     count — they now need a minimum sample;
 *   - the trend compared hole-derived current values with ROUND-TOTAL prior
 *     values — both periods now use the same hole-level basis.
 */

let roundsQueue: unknown[][] = [];
let holesByRound: Record<string, unknown[]> = {};

function chain(table: string) {
  let inIds: string[] | null = null;
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'not']) c[m] = vi.fn(() => c);
  c.in = vi.fn((_col: string, ids: string[]) => { inIds = ids; return c; });
  const rows = () => {
    if (table === 'golf_rounds') return roundsQueue.shift() ?? [];
    if (table === 'golf_holes') return (inIds ?? []).flatMap((id) => holesByRound[id] ?? []);
    return [];
  };
  c.single = vi.fn(async () => ({ data: { id: 'player-1', first_name: 'T', last_name: 'P' }, error: null }));
  c.range = vi.fn(async () => ({ data: rows(), error: null }));
  c.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(resolve);
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (t: string) => chain(t),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRowsResult: vi.fn(async (q: (f: number, t: number) => Promise<unknown>) => q(0, 999_999)),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: <A extends unknown[], R>(_n: string, _o: unknown, fn: (...a: A) => Promise<R>) =>
    (...a: A) => fn(...a),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));

function round(id: string, date: string, totals: Partial<Record<string, number>> = {}) {
  return {
    id, round_date: date, total_putts: 30, total_fairways_hit: 7, total_fairways: 14,
    total_gir: 9, total_gir_possible: 18, total_score: 75, holes_played: 18, ...totals,
  };
}

/** 18 holes: `fw` fairways hit of 14 par-4/5s, `gir` greens, `threePutts` 3-putts. */
function holes(roundId: string, o: { fw: number; gir: number; threePutts: number; n?: number }) {
  const n = o.n ?? 18;
  return Array.from({ length: n }, (_, i) => {
    const par = i < 4 ? 3 : 4;
    const par45Index = i - 4;
    return {
      id: `${roundId}-h${i}`, round_id: roundId, hole_number: i + 1, par, score: par + 1,
      putts: i < o.threePutts ? 3 : 2,
      fairway_hit: par === 3 ? null : par45Index < o.fw,
      gir: i < o.gir, up_and_down: null, sand_save: null,
    };
  });
}

beforeEach(() => {
  roundsQueue = [];
  holesByRound = {};
});

describe('audit row 31 — shot analytics window and basis', () => {
  it('says which window produced the data and that it was widened', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    roundsQueue = [[], [round('r1', '2026-08-01')], []];
    holesByRound = { r1: holes('r1', { fw: 7, gir: 9, threePutts: 1 }) };
    const res = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.requestedPeriodDays).toBe(30);
    expect(res.data.periodDays).toBe(90);
    expect(res.data.windowWidened).toBe(true);
    expect(res.data.windowLabel).toBe('Last 90 days (widened from 30: no rounds in the last 30)');
  });

  it('does not fire threshold rules off a single round', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    // 18 holes, 4 three-putts (22%) and 2 of 18 greens: dramatic but one round.
    roundsQueue = [[round('r1', '2026-09-20')], []];
    holesByRound = { r1: holes('r1', { fw: 2, gir: 2, threePutts: 4 }) };
    const res = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);
    if (!res.success) throw new Error('expected data');
    expect(res.data.puttingStats.threePuttRate).toBeGreaterThan(20); // still reported
    expect(res.data.insights.join(' ')).not.toMatch(/Three-putt rate/);
    expect(res.data.primaryWeakness).toBe('No significant weaknesses detected');
  });

  it('computes the prior period on the same hole-level basis as the current one', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    // Prior round: its ROUND totals say 12/14 fairways, its HOLES say 7/14.
    roundsQueue = [[round('cur', '2026-09-20')], [round('prev', '2026-08-10', { total_fairways_hit: 12 })]];
    holesByRound = {
      cur: holes('cur', { fw: 7, gir: 9, threePutts: 0 }),
      prev: holes('prev', { fw: 7, gir: 9, threePutts: 0 }),
    };
    const res = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);
    if (!res.success) throw new Error('expected data');
    const fw = res.data.trends.find((t) => t.metric === 'Fairway %')!;
    expect(fw.previousValue).toBe(50); // 7/14 from holes, not 12/14 from the round row
    expect(fw.direction).toBe('flat');
  });
});
