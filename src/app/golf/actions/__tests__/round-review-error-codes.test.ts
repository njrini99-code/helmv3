import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Audit-repair regression tests (CoachHelm repair-plan N13 + "swallowed
// round-review compute errors").
//
// Before this change, a caught exception or an unchecked Supabase `error`
// inside `generateAndStoreRoundReview`'s compute path collapsed into the
// same `{ success: false }` shape as an expected outcome (round not found,
// round not completed), with no `code` to distinguish "a bug" from "a coach
// clicked a stale link" — and two reads (`golf_shots`, `golf_holes`) did not
// check `error` at all, so a transient DB failure silently produced (or
// clobbered an existing review with) empty content while still reporting
// `success: true`.
//
// This file is intentionally separate from `round-review-system.test.ts`,
// which the round-chronology PR (#1977) is editing concurrently (including
// its own copy of `createChainableMock`). Keeping a second, local copy here
// (with `lt` included, since #1977 adds an as-played `.lt()` bound to the
// comparison query) avoids a merge collision on that file.
// ---------------------------------------------------------------------------

function createChainableMock({
  data = [] as unknown[] | null,
  error = null as unknown,
  singleData = null as unknown,
} = {}) {
  const chain: Record<string, unknown> = {
    data,
    error,
    count: Array.isArray(data) ? data.length : 0,
  };
  const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'not', 'order', 'limit', 'range', 'filter', 'upsert'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => ({ data: singleData, error }));
  chain.maybeSingle = vi.fn(async () => ({ data: singleData, error }));
  return chain;
}

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const ROUND_ID = 'round-1';

const BASE_ROUND = {
  id: ROUND_ID,
  player_id: PLAYER_ID,
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

type Mode =
  | 'success'
  | 'round-error'
  | 'round-not-found'
  | 'round-not-completed'
  | 'shots-error'
  | 'holes-error'
  | 'comparison-error'
  | 'upsert-error'
  | 'unknown-throw';

let mode: Mode = 'success';
// The round-detail `.single()` read and the as-played comparison read both
// hit `golf_rounds`, in that order — this counter lets 'comparison-error'
// fail only the SECOND call, so the round lookup itself still succeeds and
// the compute reaches the comparison query before failing.
let golfRoundsCallCount = 0;

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') {
    golfRoundsCallCount += 1;
    if (mode === 'round-not-found') {
      const chain = createChainableMock();
      chain.single = vi.fn(async () => ({ data: null, error: { code: 'PGRST116', message: 'no rows' } }));
      return chain;
    }
    if (mode === 'round-error') {
      const chain = createChainableMock();
      chain.single = vi.fn(async () => ({ data: null, error: { code: '500', message: 'connection reset' } }));
      return chain;
    }
    if (mode === 'round-not-completed') {
      const chain = createChainableMock();
      chain.single = vi.fn(async () => ({ data: { ...BASE_ROUND, status: 'in_progress' }, error: null }));
      return chain;
    }
    if (mode === 'comparison-error' && golfRoundsCallCount === 2) {
      return createChainableMock({ data: null, error: { code: '500', message: 'comparison query failed' } });
    }
    // Used both for the round-detail `.single()` read and the later
    // (non-`.single()`) player-history comparison read.
    const chain = createChainableMock({ data: [] });
    chain.single = vi.fn(async () => ({ data: BASE_ROUND, error: null }));
    return chain;
  }
  if (table === 'golf_shots') {
    if (mode === 'shots-error') {
      return createChainableMock({ data: null, error: { code: '500', message: 'shots query failed' } });
    }
    if (mode === 'unknown-throw') {
      const chain = createChainableMock({ data: [] });
      chain.select = vi.fn(() => {
        throw new TypeError('boom - unexpected shape');
      });
      return chain;
    }
    return createChainableMock({ data: [] });
  }
  if (table === 'golf_holes') {
    if (mode === 'holes-error') {
      return createChainableMock({ data: null, error: { code: '500', message: 'holes query failed' } });
    }
    return createChainableMock({ data: [] });
  }
  if (table === 'golf_round_reviews') {
    if (mode === 'upsert-error') {
      const chain = createChainableMock();
      chain.single = vi.fn(async () => ({ data: null, error: { code: '500', message: 'upsert failed' } }));
      return chain;
    }
    const chain = createChainableMock();
    chain.single = vi.fn(async () => ({ data: { id: 'review-1' }, error: null }));
    return chain;
  }
  return createChainableMock({ data: [] });
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
  verifyRoundBelongsToPlayer: vi.fn(async () => true),
}));

vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { generateRoundReview: vi.fn() },
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: false })),
}));

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadPlayerStandingMap: vi.fn(async () => ({})),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const logServerError = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
}));

import { generateAndStoreRoundReview } from '../round-review-system';

describe('generateAndStoreRoundReview — typed failure codes + error surfacing', () => {
  beforeEach(() => {
    mode = 'success';
    golfRoundsCallCount = 0;
    mockFrom.mockClear();
    logServerError.mockClear();
  });

  it('sanity: the success path still returns a review with no code', async () => {
    mode = 'success';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(true);
    expect(result.code).toBeUndefined();
    expect(result.review?.id).toBe('review-1');
  });

  // `generateAndStoreRoundReview` is `withAdminObserved`-wrapped, which
  // auto-logs ANY `{ success: false }` envelope through its own
  // `observeActionSoftFailure` path (pre-existing behavior, not introduced by
  // this change — it already fired for "Not authenticated"/"Not authorized"
  // before `code` existed). That wrapper call is flood-collapsed per
  // `${action}:${code}` and shares module-level throttle state across tests
  // in this file, so its presence/count is order-dependent and not asserted
  // on here. What these tests assert is the CALL THIS PR ADDS: the specific,
  // named `logServerError` call from inside `round-review-system.ts` itself,
  // found by its distinctive message.
  function findLogCall(substring: string) {
    return logServerError.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes(substring)
    ) as [string, Record<string, unknown>] | undefined;
  }

  it('a genuine round-lookup DB error is logged and returns code db_error, not round_not_found', async () => {
    mode = 'round-error';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('db_error');
    const call = findLogCall('round lookup failed');
    expect(call).toBeDefined();
    const [, meta] = call!;
    expect(meta).toMatchObject({
      action: 'round_review_system.generateAndStoreRoundReview',
      roundId: ROUND_ID,
      playerId: PLAYER_ID,
    });
  });

  it('an actual missing round (PGRST116) is NOT logged by this code path and returns code round_not_found', async () => {
    mode = 'round-not-found';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('round_not_found');
    // The round-lookup block only calls logServerError for a genuine error
    // (roundError.code !== 'PGRST116'); a real "no rows" must never reach it.
    expect(findLogCall('round lookup failed')).toBeUndefined();
  });

  it('an incomplete round returns code round_not_completed', async () => {
    mode = 'round-not-completed';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('round_not_completed');
  });

  it('a failed shots read is logged and fails the compute with db_error (revert-checked)', async () => {
    mode = 'shots-error';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('db_error');
    const call = findLogCall('shots read failed');
    expect(call).toBeDefined();
    const [, meta] = call!;
    expect(meta).toMatchObject({ roundId: ROUND_ID, playerId: PLAYER_ID });
    // Before this fix, an unchecked `shots` error fell back to an empty
    // array and the compute proceeded to a SUCCESSFUL upsert built from
    // empty data — see the revert-check note in the source comment above
    // the shots read in round-review-system.ts. Confirm we did NOT reach
    // the upsert at all.
    expect(mockFrom).not.toHaveBeenCalledWith('golf_round_reviews');
  });

  it('a failed holes read is logged and fails the compute with db_error', async () => {
    mode = 'holes-error';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('db_error');
    expect(findLogCall('holes read failed')).toBeDefined();
  });

  it('a failed as-played comparison read is logged and fails the compute with db_error, not a false empty-comparison success', async () => {
    mode = 'comparison-error';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('db_error');
    const call = findLogCall('comparison read failed');
    expect(call).toBeDefined();
    const [, meta] = call!;
    expect(meta).toMatchObject({ roundId: ROUND_ID, playerId: PLAYER_ID });
    // The round lookup itself must have succeeded (not round_not_found) —
    // this failure is specifically the SECOND golf_rounds read.
    expect(golfRoundsCallCount).toBe(2);
  });

  it('a failed upsert is logged and returns code save_failed', async () => {
    mode = 'upsert-error';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('save_failed');
    expect(findLogCall('upsert failed')).toBeDefined();
  });

  it('an unexpected thrown exception is logged and returns code unknown (the original TypeError bug)', async () => {
    mode = 'unknown-throw';
    const result = await generateAndStoreRoundReview(ROUND_ID, PLAYER_ID);
    expect(result.success).toBe(false);
    expect(result.code).toBe('unknown');
    const call = findLogCall('generateAndStoreRoundReview failed');
    expect(call).toBeDefined();
    expect(call![0]).toContain('boom - unexpected shape');
  });
});
