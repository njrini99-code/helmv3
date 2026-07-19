import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ============================================================================
 * #972 — getPlayerShotAnalytics widens its lookback window before honestly
 * reporting "no rounds"
 * ----------------------------------------------------------------------------
 * The dashboard route calls this loader with a hardcoded 30-day period, while
 * the deep-dive ShotAnalysisCard's loader (getPlayerShotContext,
 * coachhelm-data.ts) defaults to 90 days. A player who last played 31-89 days
 * ago showed real Dead Zones / Resilience / Scramble Rate in the deep dive
 * while this loader reported `roundsAnalyzed: 0` for the SAME player, SAME
 * page render — two loaders disagreeing on scope. This pins the fix: widen
 * ONCE to the same 90-day window before giving up, and report the window
 * that actually produced the data via `periodDays`.
 * ========================================================================== */

// ---------------------------------------------------------------------------
// Mock Supabase with a minimal chainable/thenable query builder
// ---------------------------------------------------------------------------
function createChain(data: unknown, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const methods = ['select', 'eq', 'in', 'gte', 'lt', 'order', 'limit'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => ({
    data: Array.isArray(data) ? (data[0] ?? null) : data,
    error,
  }));
  chain.maybeSingle = chain.single;
  chain.range = vi.fn(async (from: number, to: number) => ({
    data: Array.isArray(data) ? data.slice(from, to + 1) : data,
    error,
  }));
  // The real PostgREST builder is itself thenable when awaited directly
  // (no `.single()`/`.range()` terminal call) — `getPlayerShotAnalytics`
  // awaits `.order(...)` directly for its `golf_rounds` queries.
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

let roundsQueue: unknown[][] = [];

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_players') {
    return createChain({ id: 'player-1', first_name: 'Test', last_name: 'Player' });
  }
  if (table === 'golf_rounds') {
    return createChain(roundsQueue.shift() ?? []);
  }
  // golf_holes / golf_shots — not under test here; return empty.
  return createChain([]);
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));

vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRowsResult: vi.fn(async (queryFn: (from: number, to: number) => Promise<{ data: unknown; error: unknown }>) => {
    return queryFn(0, 999_999);
  }),
}));

// Orchestration-only wrapper (soft-failure observing + Bridge logging) — not
// under test here, and its real implementation reaches for an admin client
// that throws under vitest without service-role env. Passthrough identity.
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved:
    <Args extends unknown[], R>(_name: string, _opts: unknown, fn: (...args: Args) => Promise<R>) =>
    (...args: Args) =>
      fn(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

const ROUND = {
  id: 'r1',
  round_date: '2026-05-01',
  total_putts: 30,
  total_fairways_hit: 8,
  total_fairways: 14,
  total_gir: 10,
  total_gir_possible: 18,
  total_score: 75,
  holes_played: 18,
};

describe('getPlayerShotAnalytics — 90-day widening (#972)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roundsQueue = [];
  });

  it('widens to a 90-day window and reports that window when the requested 30-day period is empty but a wider one has rounds', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    // 1) narrow (30-day) current-period query: empty
    // 2) widened (90-day) current-period query: has a round
    // 3) previous-period query (for trends): empty
    roundsQueue = [[], [ROUND], []];

    const result = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roundsAnalyzed).toBe(1);
      // The window that ACTUALLY produced the data, not the originally
      // requested 30 — this is what keeps downstream "Warming up" copy honest.
      expect(result.data.periodDays).toBe(90);
    }
  });

  it('does not widen when the requested period already has rounds', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    // 1) narrow (30-day) current-period query: already has a round
    // 2) previous-period query: empty
    roundsQueue = [[ROUND], []];

    const result = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.roundsAnalyzed).toBe(1);
      expect(result.data.periodDays).toBe(30);
    }
    // Only ONE golf_rounds query for the current period (no widening call).
    const roundsCalls = mockFrom.mock.calls.filter(([table]) => table === 'golf_rounds');
    expect(roundsCalls).toHaveLength(2); // current-period + previous-period only
  });

  it('still honestly reports no_rounds_in_period when even the widened 90-day window is empty', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    // 1) narrow: empty, 2) widened: empty, 3) previous-period: empty
    roundsQueue = [[], [], []];

    const result = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('no_rounds_in_period');
    }
  });
});
