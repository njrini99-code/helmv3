import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Package 8 (2026-09-23): the round-review narrative — a 3-5 sentence
 * LLM-authored paragraph cached on `golf_round_reviews.ai_narrative`,
 * reusing round-recap.ts's single-flight lock table with a distinct
 * `kind` ('round_review_narrative'). Mirrors
 * `round-recap-claim-gate.test.ts`'s lock/compose mocking harness, scoped
 * down to this surface's own guards: flag-off is zero cost, a published
 * or coach-annotated review is never overwritten, and a lock loser reads
 * ONLY this feature's own storage (never round-recap.ts's
 * `golf_rounds.ai_recap`).
 */

const { isFlagEnabledMock } = vi.hoisted(() => ({
  isFlagEnabledMock: vi.fn((_featureId?: string) => true),
}));
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: (featureId: string) => isFlagEnabledMock(featureId),
}));

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));

vi.mock('@/lib/auth/action-rate-limit', () => ({
  gateUserAction: vi.fn(async () => ({ allowed: true })),
  LLM_COMPOSE_RATE_LIMIT: { maxAttempts: 10, windowMs: 60_000 },
}));

// --- compose()'s own dependencies (same shape as round-recap-claim-gate.test.ts) ---
const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock('@/lib/observability/metrics', () => ({
  recordAi: vi.fn(),
}));

const recordSpendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({
    allowed: true,
    remaining_usd: 10,
    budget_usd: 10,
    spent_usd: 0,
    source: 'coach_configured',
  }),
  recordSpend: (...args: unknown[]) => recordSpendMock(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/transient-error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/transient-error')>();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});

// --- In-memory golf_round_reviews table, shared by the user-scoped read
//     guard AND the admin client's poll/persist/re-read, so predicate
//     behavior (the guarded UPDATE) is exercised for real rather than
//     asserted from mock call args alone. ---
interface ReviewRow {
  round_id: string;
  status: string | null;
  ai_narrative: string | null;
  coach_notes: string | null;
  coach_feedback_text: string | null;
  coach_rating: number | null;
  coach_viewed_at: string | null;
}
const reviewsTable = new Map<string, ReviewRow>();
const adminGolfRoundsCalls: string[] = [];
const adminGolfReviewsSelectCalls: number[] = [];
const adminGolfReviewsUpdateCalls: Array<{ is: string[]; or: string | null }> = [];

function makeReviewsQuery(mode: 'select' | 'update', updatePayload?: Record<string, unknown>) {
  let roundId: string | null = null;
  const isFields: string[] = [];
  let orExpr: string | null = null;
  const builder = {
    eq(col: string, val: string) {
      if (col === 'round_id') roundId = val;
      return builder;
    },
    is(col: string, val: unknown) {
      if (val === null) isFields.push(col);
      return builder;
    },
    or(expr: string) {
      orExpr = expr;
      return builder;
    },
    select() {
      return builder;
    },
    maybeSingle: async () => {
      const row = roundId ? reviewsTable.get(roundId) : undefined;
      if (mode === 'select') return { data: row ?? null, error: null };
      adminGolfReviewsUpdateCalls.push({ is: [...isFields], or: orExpr });
      if (!row) return { data: null, error: null };
      const guardsPass =
        isFields.every((f) => (row as unknown as Record<string, unknown>)[f] === null) &&
        (orExpr === null || row.status !== 'published');
      if (!guardsPass) return { data: null, error: null }; // zero rows touched
      Object.assign(row, updatePayload);
      return { data: { ai_narrative: row.ai_narrative }, error: null };
    },
  };
  return builder;
}

const lockRows = new Map<string, { holder_token: string; expires_at: number }>();
let lockClaimCallCount = 0;
let lockReleaseCallCount = 0;
let lockClaimError: { message: string; code?: string } | null = null;
const adminRpcMock = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name === 'claim_round_recap_lock') {
    lockClaimCallCount += 1;
    if (lockClaimError) return { data: null, error: lockClaimError };
    const key = `${args.p_round_id as string}:${args.p_revision as number}:${args.p_kind as string}`;
    const now = Date.now();
    const existing = lockRows.get(key);
    if (existing && existing.expires_at > now) return { data: [], error: null };
    const token = `token-${lockClaimCallCount}`;
    const ttlMs = (args.p_ttl_seconds as number) * 1000;
    lockRows.set(key, { holder_token: token, expires_at: now + ttlMs });
    return { data: [{ holder_token: token, expires_at: new Date(now + ttlMs).toISOString() }], error: null };
  }
  if (name === 'release_round_recap_lock') {
    lockReleaseCallCount += 1;
    const key = `${args.p_round_id as string}:${args.p_revision as number}:${args.p_kind as string}`;
    const existing = lockRows.get(key);
    if (existing && existing.holder_token === args.p_holder_token) lockRows.delete(key);
    return { data: null, error: null };
  }
  return { data: null, error: null };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_round_reviews') {
        return {
          select: () => {
            adminGolfReviewsSelectCalls.push(1);
            return makeReviewsQuery('select');
          },
          update: (payload: Record<string, unknown>) => makeReviewsQuery('update', payload),
        };
      }
      if (table === 'golf_rounds') {
        // The narrative's poll/persist must never touch golf_rounds — a
        // waiter that did would risk reading round-recap.ts's ai_recap
        // instead of this feature's own storage.
        adminGolfRoundsCalls.push(table);
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      // golf_coachhelm_llm_calls — compose()'s own call log. Not
      // asserted on directly by this file; only needs to satisfy the
      // insert().select().maybeSingle() chain compose() issues.
      return {
        insert: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'log-1' }, error: null }),
          }),
        }),
      };
    },
    rpc: (name: string, args: Record<string, unknown>) => adminRpcMock(name, args),
  }),
}));

// --- User-scoped supabase client. ---
interface MockRoundRow {
  id: string;
  player_id: string;
  status: string | null;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
}

let mockRound: MockRoundRow | null = null;
let mockPlayerFirstName: string | null = 'Caden';
let mockTeamId: string | null = 'team-1';
let mockPrimaryCoachId: string | null = 'coach-1';

function createChainableMock(maybeSingleData: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error: null }));
  return chain;
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') return createChainableMock(mockRound);
  if (table === 'golf_players') return createChainableMock({ first_name: mockPlayerFirstName });
  if (table === 'golf_team_members') {
    return createChainableMock(mockTeamId ? { team_id: mockTeamId } : null);
  }
  if (table === 'golf_team_coach_staff') {
    return createChainableMock(mockPrimaryCoachId ? { coach_id: mockPrimaryCoachId } : null);
  }
  if (table === 'golf_round_reviews') {
    return {
      select: () => makeReviewsQuery('select'),
    };
  }
  return createChainableMock(null);
});

const mockGetUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom, auth: { getUser: mockGetUser } })),
}));

import { getRoundReviewNarrative } from '../round-review-narrative';
import { delay } from '@/lib/utils/transient-error';

const baseRound: MockRoundRow = {
  id: 'round-1',
  player_id: 'player-1',
  status: 'completed',
  course_name: 'Pinehurst No. 2',
  round_type: 'tournament',
  total_score: 74,
  score_to_par: 2,
  total_putts: 30,
  total_fairways: 14,
  total_fairways_hit: 10,
  total_gir: 12,
  total_gir_possible: 18,
};

function seedReview(overrides: Partial<ReviewRow> = {}): void {
  reviewsTable.set('round-1', {
    round_id: 'round-1',
    status: 'draft',
    ai_narrative: null,
    coach_notes: null,
    coach_feedback_text: null,
    coach_rating: null,
    coach_viewed_at: null,
    ...overrides,
  });
}

describe('round-review-narrative.ts', () => {
  beforeEach(() => {
    mockRound = { ...baseRound };
    mockPlayerFirstName = 'Caden';
    mockTeamId = 'team-1';
    mockPrimaryCoachId = 'coach-1';
    reviewsTable.clear();
    adminGolfRoundsCalls.length = 0;
    adminGolfReviewsSelectCalls.length = 0;
    adminGolfReviewsUpdateCalls.length = 0;
    lockRows.clear();
    lockClaimCallCount = 0;
    lockReleaseCallCount = 0;
    lockClaimError = null;
    adminRpcMock.mockClear();
    mockFrom.mockClear();
    generateTextMock.mockReset();
    recordSpendMock.mockClear();
    isFlagEnabledMock.mockReset();
    isFlagEnabledMock.mockReturnValue(true);
    vi.mocked(delay).mockImplementation(() => Promise.resolve());
  });

  it('flag off: zero DB reads, zero lock RPC calls, zero compose calls', async () => {
    isFlagEnabledMock.mockReturnValue(false);

    const result = await getRoundReviewNarrative('round-1');

    expect(result).toEqual({ narrative: null, cached: false });
    expect(isFlagEnabledMock).toHaveBeenCalledWith('coachhelm_round_review_narrative');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(adminRpcMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('no review row yet: returns null without a lock claim', async () => {
    const result = await getRoundReviewNarrative('round-1');
    expect(result).toEqual({ narrative: null, cached: false });
    expect(lockClaimCallCount).toBe(0);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('ai_narrative already cached: returns it without a lock claim or compose call', async () => {
    seedReview({ ai_narrative: 'Already generated.' });
    const result = await getRoundReviewNarrative('round-1');
    expect(result).toEqual({ narrative: 'Already generated.', cached: true });
    expect(lockClaimCallCount).toBe(0);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('a published review is never overwritten — no compose, no claim, no update', async () => {
    seedReview({ status: 'published' });
    const result = await getRoundReviewNarrative('round-1');
    expect(result).toEqual({ narrative: null, cached: false });
    expect(lockClaimCallCount).toBe(0);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(adminGolfReviewsUpdateCalls).toHaveLength(0);
  });

  it.each([
    ['coach_notes', { coach_notes: 'Great putting today.' }],
    ['coach_feedback_text', { coach_feedback_text: 'Nice recovery on 14.' }],
    ['coach_rating', { coach_rating: 4 }],
  ])('a coach-annotated review (%s set) is never overwritten', async (_label, overrides) => {
    seedReview(overrides as Partial<ReviewRow>);
    const result = await getRoundReviewNarrative('round-1');
    expect(result).toEqual({ narrative: null, cached: false });
    expect(lockClaimCallCount).toBe(0);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('coach_viewed_at alone does NOT block generation (deliberately excluded from "annotated")', async () => {
    seedReview({ coach_viewed_at: '2026-09-23T00:00:00.000Z' });
    const goodText = 'Caden shot 74 at Pinehurst No. 2. Fairways held at 71.4%. Consistency next time.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await getRoundReviewNarrative('round-1');

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.narrative).toBe(goodText);
    expect(reviewsTable.get('round-1')?.ai_narrative).toBe(goodText);
  });

  it('claims the lock with kind "round_review_narrative" and persists via the guarded UPDATE', async () => {
    seedReview();
    const goodText = 'Caden shot 74 at Pinehurst No. 2. Fairways held at 71.4%. Consistency next time.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await getRoundReviewNarrative('round-1');

    expect(result).toEqual({ narrative: goodText, cached: false });
    expect(adminRpcMock).toHaveBeenCalledWith(
      'claim_round_recap_lock',
      expect.objectContaining({ p_kind: 'round_review_narrative', p_revision: 1 }),
    );
    expect(adminRpcMock).toHaveBeenCalledWith(
      'release_round_recap_lock',
      expect.objectContaining({ p_kind: 'round_review_narrative' }),
    );
    // All five predicates present on the persisting UPDATE.
    expect(adminGolfReviewsUpdateCalls[0]).toEqual({
      is: ['ai_narrative', 'coach_notes', 'coach_feedback_text', 'coach_rating'],
      or: 'status.is.null,status.neq.published',
    });
    // Never touched round-recap.ts's table.
    expect(adminGolfRoundsCalls).toEqual([]);
  });

  it('a 0-row update (lost the race) re-reads and returns the actually-stored value, never this call\'s own text', async () => {
    seedReview();
    // Simulate a concurrent winner writing between the read guard and this
    // call's own UPDATE by pre-populating ai_narrative right before compose()
    // resolves.
    const winnerText = 'A concurrent winner already generated and stored this.';
    const thisCallsOwnText = 'This call generated its own text but lost the race.';
    generateTextMock.mockImplementationOnce(async () => {
      reviewsTable.set('round-1', { ...reviewsTable.get('round-1')!, ai_narrative: winnerText });
      return { text: thisCallsOwnText, usage: { inputTokens: 20, outputTokens: 20 } };
    });

    const result = await getRoundReviewNarrative('round-1');

    expect(result).toEqual({ narrative: winnerText, cached: true });
  });

  it('a lock claim RPC error fails closed: no compose call, no update, no narrative', async () => {
    seedReview();
    lockClaimError = { message: 'simulated connection failure', code: '08006' };

    const result = await getRoundReviewNarrative('round-1');

    expect(result).toEqual({ narrative: null, cached: false });
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(adminGolfReviewsUpdateCalls).toHaveLength(0);
  });

  it(
    'a concurrent pair for the same round makes exactly ONE compose() call — the loser reads the narrative, never round-recap.ts\'s golf_rounds.ai_recap',
    async () => {
      seedReview();
      vi.mocked(delay).mockImplementation((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

      let releaseLlm: () => void = () => {};
      const llmGate = new Promise<void>((resolve) => {
        releaseLlm = resolve;
      });
      const winnerText = 'Caden shot 74 at Pinehurst No. 2. Fairways held at 71.4%. Consistency next time.';
      generateTextMock.mockImplementationOnce(async () => {
        await llmGate;
        return { text: winnerText, usage: { inputTokens: 20, outputTokens: 20 } };
      });

      const a = getRoundReviewNarrative('round-1');
      const b = getRoundReviewNarrative('round-1');

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      releaseLlm();
      const [ra, rb] = await Promise.all([a, b]);

      expect(generateTextMock).toHaveBeenCalledTimes(1);
      const results = [ra, rb];
      const winner = results.find((r) => r.narrative === winnerText && !r.cached);
      const waiter = results.find((r) => r !== winner);
      expect(winner).toBeTruthy();
      expect(waiter).toBeTruthy();
      expect(waiter?.narrative).toBe(winnerText);
      expect(waiter?.cached).toBe(true);
      expect(lockReleaseCallCount).toBe(1);
      // The loser's poll only ever read golf_round_reviews — never
      // golf_rounds (where round-recap.ts's ai_recap lives).
      expect(adminGolfRoundsCalls).toEqual([]);
    },
    15_000,
  );

  it('no billing coach on file: skips compose() entirely and caches the deterministic fallback (DS-44 — never pass a null coach_id through)', async () => {
    seedReview();
    mockTeamId = null; // no active team membership -> resolveBillingCoachId returns null

    const result = await getRoundReviewNarrative('round-1');

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.cached).toBe(false);
    expect(result.narrative).toBeTruthy();
    expect(reviewsTable.get('round-1')?.ai_narrative).toBe(result.narrative);
  });
});
