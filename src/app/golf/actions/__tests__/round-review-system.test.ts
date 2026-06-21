import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'not', 'order', 'limit', 'range', 'filter', 'upsert'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => ({ data: singleData, error }));
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error }));
  return chain;
}

let mockRoundsData: unknown[] = [];

// ── P2-13 coordinator-test harness (opt-in via `coordinatorMode`) ───────────
// When enabled, `golf_rounds.single()` returns ONE completed round (so the
// compute path proceeds), `golf_round_reviews.upsert(...).select().single()`
// returns a fixed review id, and every compute pass increments
// `upsertCallCount` after an awaitable `upsertGate` — letting a test hold two
// concurrent calls in-flight at once and assert the single-flight collapse.
let coordinatorMode = false;
let upsertCallCount = 0;
let upsertGate: Promise<void> = Promise.resolve();
const COORD_ROUND: Record<string, unknown> = {
  id: 'round-coord-1',
  player_id: '11111111-1111-1111-1111-111111111111',
  course_name: 'Test GC',
  round_date: '2026-06-21',
  total_score: 75,
  score_to_par: 3,
  total_putts: 30,
  total_fairways_hit: 8,
  total_fairways: 14,
  total_gir: 10,
  total_gir_possible: 18,
  holes_played: 18,
  status: 'completed',
};

const mockFrom = vi.fn((table: string) => {
  if (coordinatorMode) {
    if (table === 'golf_rounds') {
      // Two shapes are read from golf_rounds in the compute: the single round
      // (`.single()`) and the player-history list (resolved via the chain's
      // `data`). Return the round for `.single()` and an empty history list.
      const chain = createChainableMock({ data: [] });
      chain.single = vi.fn(async () => ({ data: COORD_ROUND, error: null }));
      return chain;
    }
    if (table === 'golf_round_reviews') {
      const chain = createChainableMock();
      // Count each compute pass and gate it so concurrent callers overlap.
      chain.single = vi.fn(async () => {
        await upsertGate;
        upsertCallCount += 1;
        return { data: { id: 'review-coord-1' }, error: null };
      });
      return chain;
    }
    return createChainableMock({ data: [] });
  }
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

import { getStatAverages, generateAndStoreRoundReview } from '../round-review-system';

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

// ---------------------------------------------------------------------------
// P2-13 — round-review cold path single-flight coordinator.
// Acceptance tests:
//   • Two concurrent cold requests create ONE analysis job (one compute/upsert).
//   • The UI receives the SAME review id from both callers.
// ---------------------------------------------------------------------------
describe('generateAndStoreRoundReview — single-flight coordinator (P2-13)', () => {
  beforeEach(() => {
    coordinatorMode = true;
    upsertCallCount = 0;
    upsertGate = Promise.resolve();
    mockFrom.mockClear();
  });

  // Reset the harness flag so later suites (if reordered) are unaffected.
  afterEach(() => {
    coordinatorMode = false;
  });

  it('collapses two concurrent cold requests into ONE analysis job', async () => {
    // Hold both computes open until we release the gate so they truly overlap.
    let release: () => void = () => {};
    upsertGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const a = generateAndStoreRoundReview('round-coord-1', PLAYER_ID);
    const b = generateAndStoreRoundReview('round-coord-1', PLAYER_ID);

    // Let the auth/access microtasks settle so the second call observes the
    // first's in-flight promise BEFORE either compute reaches the upsert.
    await Promise.resolve();
    await Promise.resolve();

    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.success).toBe(true);
    expect(rb.success).toBe(true);
    // Exactly ONE compute pass ran (the upsert is the compute's terminal step).
    expect(upsertCallCount).toBe(1);
  });

  it('returns the SAME review id to both concurrent callers', async () => {
    let release: () => void = () => {};
    upsertGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const a = generateAndStoreRoundReview('round-coord-1', PLAYER_ID);
    const b = generateAndStoreRoundReview('round-coord-1', PLAYER_ID);
    await Promise.resolve();
    await Promise.resolve();
    release();

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.review?.id).toBe('review-coord-1');
    expect(rb.review?.id).toBe(ra.review?.id);
  });

  it('recomputes after the in-flight job settles (a later Refresh is not deduped)', async () => {
    // First call (gate open → resolves immediately).
    const first = await generateAndStoreRoundReview('round-coord-1', PLAYER_ID);
    expect(first.success).toBe(true);
    expect(upsertCallCount).toBe(1);

    // A subsequent, non-overlapping call must dispatch a fresh compute.
    const second = await generateAndStoreRoundReview('round-coord-1', PLAYER_ID);
    expect(second.success).toBe(true);
    expect(upsertCallCount).toBe(2);
  });
});
