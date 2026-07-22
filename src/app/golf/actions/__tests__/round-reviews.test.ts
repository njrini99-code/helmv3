import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// markReviewAsViewed — authz branch mapping regression test.
//
// Bug: the action restricted access to role: 'player' only, while the
// review PAGE (rounds/[id]/review/page.tsx:220-334) authorizes
// player-owns-round OR coach-staffs-any-team-of-player. Every coach who
// opened a review the page had already let them view got
// "[markReviewAsViewed] Review not found or not accessible" (7 prod events,
// 2 users incl. a coach) because the action's narrower check rejected them.
//
// Fix: widen the action's check to `verifyReviewAccess(..., 'player_or_coach')`
// (same model as every other reader in this file), but preserve
// player-viewed semantics — `patterns_detected.player_viewed_at` records
// that the PLAYER read their own review, so a coach caller must succeed
// without flipping that flag (a no-op, not an authorization error).
// ---------------------------------------------------------------------------

// ── Chainable Supabase mock ──────────────────────────────────────────────
let reviewRow: { player_id: string; patterns_detected: unknown } | null = null;
let fetchError: unknown = null;
const updateSpy = vi.fn((_payload: unknown) => undefined);

function makeReviewsChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: reviewRow, error: fetchError }));
  chain.update = vi.fn((payload: unknown) => {
    updateSpy(payload);
    return chain;
  });
  // Awaitable fallback for the `.update(...).eq(...)` write path, which
  // (unlike the `.select(...).eq(...).single()` read path above) is awaited
  // directly without a terminal `.single()` call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve({ error: null }).then(onFulfilled, onRejected);
  return chain;
}

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: 'user-1' } as { id: string } | null },
  error: null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => makeReviewsChain()),
  })),
}));

// `verifyPlayerAccess` is the shared self-or-coach RPC-backed check that
// `verifyReviewAccess` (local to round-reviews.ts) wraps. Controlling its
// return value drives the three branches under test: self, coach, denied.
const mockVerifyPlayerAccess = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => mockVerifyPlayerAccess(...args),
}));

// Pulled in transitively by round-reviews.ts (getPendingCoachReviews,
// markReviewViewedByCoach) — mocked to avoid dragging next/headers'
// `cookies()` into the unit test environment.
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => null),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { markReviewAsViewed } from '../round-reviews';

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const REVIEW_ID = '22222222-2222-2222-2222-222222222222';

describe('markReviewAsViewed — authz branch mapping', () => {
  beforeEach(() => {
    reviewRow = { player_id: PLAYER_ID, patterns_detected: {} };
    fetchError = null;
    updateSpy.mockClear();
    mockGetUser.mockClear();
    mockVerifyPlayerAccess.mockReset();
  });

  it('the round\'s own player: succeeds and writes player_viewed_at', async () => {
    mockVerifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await markReviewAsViewed(REVIEW_ID);

    expect(result).toEqual({ success: true });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0]?.[0] as { patterns_detected: { player_viewed_at?: string } };
    expect(typeof payload.patterns_detected.player_viewed_at).toBe('string');
  });

  it('the player, already viewed: succeeds as a no-op without a second write', async () => {
    reviewRow = {
      player_id: PLAYER_ID,
      patterns_detected: { player_viewed_at: '2026-07-01T00:00:00.000Z' },
    };
    mockVerifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'self' });

    const result = await markReviewAsViewed(REVIEW_ID);

    expect(result).toEqual({ success: true });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('a coach staffing the player\'s team: succeeds WITHOUT flipping player_viewed_at (previously 403s here)', async () => {
    mockVerifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'coach', coachId: 'coach-1' });

    const result = await markReviewAsViewed(REVIEW_ID);

    // This is the regression: before the fix this branch returned
    // { success: false, error: 'Review not found or not accessible' }.
    expect(result).toEqual({ success: true });
    // Coach-viewing must not mutate the player's viewed state — that's a
    // no-op success, not a write.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('a user with no relationship to the player: denied', async () => {
    mockVerifyPlayerAccess.mockResolvedValue({ allowed: false, reason: 'denied' });

    const result = await markReviewAsViewed(REVIEW_ID);

    expect(result).toEqual({ success: false, error: 'Review not found or not accessible' });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('unauthenticated caller: denied', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await markReviewAsViewed(REVIEW_ID);

    expect(result).toEqual({ success: false, error: 'Review not found or not accessible' });
    expect(mockVerifyPlayerAccess).not.toHaveBeenCalled();
  });

  it('review row not found: distinct "Review not found" error (pre-authz)', async () => {
    reviewRow = null;
    fetchError = { message: 'no rows' };

    const result = await markReviewAsViewed(REVIEW_ID);

    expect(result).toEqual({ success: false, error: 'Review not found' });
    expect(mockVerifyPlayerAccess).not.toHaveBeenCalled();
  });
});
