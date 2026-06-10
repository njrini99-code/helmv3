import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression tests for calculateComparisonAverages (stats-accuracy audit
// 2026-06-09), exercised through the exported `getStatAverages` action:
//
//   1. avgGirPct / avgFairwayPct must be WEIGHTED averages
//      ((Σ made ÷ Σ opportunities) × 100), not the mean of per-round
//      percentages — a 9-hole round contributes 9 opportunities, not a
//      full vote.
//   2. Null-honesty: when a stat has no supporting data the field is null
//      (previously fabricated as avgScore=72, avgPutts=32, GIR/FW=50%).
// ---------------------------------------------------------------------------

// Mock Supabase with a chainable query builder
function createChainableMock({
  data = [] as unknown[],
  error = null as unknown,
  singleData = null as unknown,
  maybeSingleData = null as unknown,
} = {}) {
  const chain: Record<string, unknown> = {
    data,
    error,
    count: Array.isArray(data) ? data.length : 0,
  };
  const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'not', 'order', 'limit', 'range', 'filter'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => ({ data: singleData, error }));
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error }));
  return chain;
}

let mockRoundsData: unknown[] = [];

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') {
    return createChainableMock({ data: mockRoundsData });
  }
  return createChainableMock();
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));

vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { generateRoundReview: vi.fn() },
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: false })),
}));

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadPlayerStandingMap: vi.fn(async () => ({})),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getStatAverages } from '../round-review-system';

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';

describe('getStatAverages — comparison averages', () => {
  beforeEach(() => {
    mockRoundsData = [];
    mockFrom.mockClear();
  });

  it('computes avgGirPct and avgFairwayPct as weighted averages, not the mean of per-round percentages', async () => {
    // Two 18-hole rounds at 50% GIR/FW + one 9-hole round at 100%.
    // Mean-of-percentages (the old bug) = (50 + 50 + 100) / 3 ≈ 67.
    // Weighted = (9+9+9) ÷ (18+18+9) = 27/45 = 60% (same shape for fairways).
    mockRoundsData = [
      { total_score: 80, score_to_par: 8, total_putts: 32, total_gir: 9, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14, holes_played: 18 },
      { total_score: 82, score_to_par: 10, total_putts: 32, total_gir: 9, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14, holes_played: 18 },
      { total_score: 38, score_to_par: 2, total_putts: 16, total_gir: 9, total_gir_possible: 9, total_fairways_hit: 7, total_fairways: 7, holes_played: 9 },
    ];

    const result = await getStatAverages(PLAYER_ID);

    expect(result.success).toBe(true);
    expect(result.playerAvg).toBeDefined();
    expect(result.playerAvg?.avgGirPct).toBe(60);
    expect(result.playerAvg?.avgGirPct).not.toBe(67); // old unweighted mean
    expect(result.playerAvg?.avgFairwayPct).toBe(60);
    // avgScore only considers 18-hole rounds; avgPutts is per-hole weighted.
    expect(result.playerAvg?.avgScore).toBe(81);
    expect(result.playerAvg?.avgPutts).toBe(32); // (32+32+16)/(18+18+9) × 18
  });

  it('returns null fields instead of fabricated benchmarks when data is missing', async () => {
    // Three 9-hole rounds with no putt/GIR/fairway/to-par data. The old code
    // fabricated avgScore=72, avgScoreToPar=0, avgPutts=32, GIR/FW=50% and
    // presented them to players as "your averages".
    mockRoundsData = [
      { total_score: 40, score_to_par: null, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, holes_played: 9 },
      { total_score: 42, score_to_par: null, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, holes_played: 9 },
      { total_score: 41, score_to_par: null, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, holes_played: 9 },
    ];

    const result = await getStatAverages(PLAYER_ID);

    expect(result.success).toBe(true);
    expect(result.playerAvg).toEqual({
      avgScore: null, // no 18-hole rounds — never 72
      avgScoreToPar: null,
      avgPutts: null, // never 32
      avgGirPct: null, // never 50
      avgFairwayPct: null, // never 50
    });
  });

  it('returns no playerAvg at all with fewer than 3 valid rounds', async () => {
    mockRoundsData = [
      { total_score: 75, score_to_par: 3, total_putts: 30, total_gir: 10, total_gir_possible: 18, total_fairways_hit: 8, total_fairways: 14, holes_played: 18 },
      { total_score: 77, score_to_par: 5, total_putts: 31, total_gir: 9, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14, holes_played: 18 },
    ];

    const result = await getStatAverages(PLAYER_ID);

    expect(result.success).toBe(true);
    expect(result.playerAvg).toBeUndefined();
  });
});
