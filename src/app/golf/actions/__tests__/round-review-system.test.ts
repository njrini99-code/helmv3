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
  // `lt` added alongside the repair plan N4 "as-played" fix
  // (round-review-system.ts's comparison query now calls
  // `.lt('round_date', roundData.round_date)`) — without it, that call hits
  // `chain.lt is not a function` and the compute's try/catch turns that
  // TypeError into a silent `success: false`, which is what broke this
  // suite (not a single-flight regression).
  const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'not', 'order', 'limit', 'range', 'filter', 'upsert'];
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
// Controls the `golf_round_reviews` existence check's `.maybeSingle()` result
// under `coordinatorMode` — i.e. whether generateAndStoreRoundReview treats a
// call as a first generation (null, ungated) or a regenerate (a row, gated),
// and whether the read itself errors (fail-closed → gated).
let existingReviewData: { id: string } | null = null;
let existingReviewErrorValue: unknown = null;
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
      // The regenerate existence check (`.select('id').eq(...).maybeSingle()`)
      // hits this same table — controlled per-test via `existingReviewData`/
      // `existingReviewErrorValue`, independent of the upsert-counting `.single`
      // above (a real call site only ever uses one or the other on a given
      // `.from()` chain, never both).
      chain.maybeSingle = vi.fn(async () => ({ data: existingReviewData, error: existingReviewErrorValue }));
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
  // generateAndStoreRoundReview now binds roundId to playerId before it
  // computes -- verifying the player alone let a caller pair a subject they
  // may read with a round they may not.
  verifyRoundBelongsToPlayer: vi.fn(async () => true),
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

vi.mock('@/lib/auth/action-rate-limit', () => ({
  gateCoachHelmEngineCall: vi.fn(async () => ({ allowed: true })),
}));

import { getStatAverages, generateAndStoreRoundReview } from '../round-review-system';
import { gateCoachHelmEngineCall } from '@/lib/auth/action-rate-limit';

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
    // First generation (no existing row) — the coordinator tests exercise the
    // cold path, so the regenerate gate must stay out of the way regardless.
    existingReviewData = null;
    existingReviewErrorValue = null;
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

// ---------------------------------------------------------------------------
// generateAndStoreRoundReview only gates a REGENERATE, and derives that
// server-side from whether a `golf_round_reviews` row already exists for the
// round — never from a caller-supplied flag, which a direct caller could
// simply omit to dodge the gate. First generation (no row yet) stays
// ungated — this is the state both auto-generate effects (this page's own,
// and useRoundReviewV2's) fire in. A failed existence read fails CLOSED: an
// unknown state is treated as "a review exists" so a DB hiccup can never
// quietly exempt a caller from the cost gate. See the comment on the
// existence check in round-review-system.ts.
// ---------------------------------------------------------------------------
describe('generateAndStoreRoundReview — regenerate rate limit (server-derived)', () => {
  beforeEach(() => {
    coordinatorMode = true;
    upsertCallCount = 0;
    upsertGate = Promise.resolve();
    mockFrom.mockClear();
    existingReviewData = null;
    existingReviewErrorValue = null;
    vi.mocked(gateCoachHelmEngineCall).mockReset();
    vi.mocked(gateCoachHelmEngineCall).mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    coordinatorMode = false;
  });

  it('never consults the gate on first generation (no existing review row), even when the gate would deny', async () => {
    existingReviewData = null;
    vi.mocked(gateCoachHelmEngineCall).mockResolvedValue({ allowed: false, error: 'blocked' });

    const result = await generateAndStoreRoundReview('round-coord-1', PLAYER_ID);

    expect(gateCoachHelmEngineCall).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(upsertCallCount).toBe(1);
  });

  it('blocks a regenerate (an existing review row) when the engine gate denies it, before any compute runs', async () => {
    existingReviewData = { id: 'review-existing-1' };
    vi.mocked(gateCoachHelmEngineCall).mockResolvedValueOnce({
      allowed: false,
      error: 'Too many analyze requests in the last minute — please wait a moment and try again.',
    });

    const result = await generateAndStoreRoundReview('round-coord-1', PLAYER_ID);

    expect(result).toEqual({
      success: false,
      error: 'Too many analyze requests in the last minute — please wait a moment and try again.',
      code: 'rate_limited',
    });
    expect(upsertCallCount).toBe(0);
  });

  it('lets a regenerate through when the engine gate allows it', async () => {
    existingReviewData = { id: 'review-existing-1' };

    const result = await generateAndStoreRoundReview('round-coord-1', PLAYER_ID);

    expect(gateCoachHelmEngineCall).toHaveBeenCalledWith(expect.any(String));
    expect(result.success).toBe(true);
    expect(upsertCallCount).toBe(1);
  });

  it('fails closed (applies the gate) when the existence read itself errors', async () => {
    existingReviewData = null;
    existingReviewErrorValue = { message: 'connection reset' };
    vi.mocked(gateCoachHelmEngineCall).mockResolvedValueOnce({ allowed: false, error: 'blocked' });

    const result = await generateAndStoreRoundReview('round-coord-1', PLAYER_ID);

    expect(gateCoachHelmEngineCall).toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'blocked', code: 'rate_limited' });
    expect(upsertCallCount).toBe(0);
  });
});
