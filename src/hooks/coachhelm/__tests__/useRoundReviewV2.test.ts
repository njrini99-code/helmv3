// @vitest-environment jsdom
/**
 * useRoundReviewV2 — §15.2 fixture-matrix row 37: stable read of an existing
 * review, and auto-generate bounded to once per mount via `autoGenAttempted`.
 * Had zero tests before this file. Only the server actions the hook calls
 * out to (round-review-system's `generateAndStoreRoundReview`, insights'
 * `generateRoundReview`/`getCoachHelmStatus`) and the browser Supabase
 * client it constructs via `createClient()` are mocked — none of the
 * hook's own logic is stubbed.
 *
 * Covers:
 *   (a) an existing review is returned without calling generate.
 *   (b) no review -> auto-generate fires exactly once, including across
 *       rerender() (a re-render re-running the auto-gen effect without
 *       re-firing generate() is exactly the bug class `autoGenAttempted`
 *       exists to prevent).
 *   (c) auto-generate failure -> no retry loop, and the error surfaces.
 *   (d) a deliberate refresh (a direct `generate()` call, as a Refresh
 *       button would make) still works after auto-gen was attempted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRoundReviewV2 } from '../useRoundReviewV2';
import { generateAndStoreRoundReview, type RoundReviewContent } from '@/app/golf/actions/round-review-system';
import { generateRoundReview, getCoachHelmStatus } from '@/app/golf/actions/insights';

vi.mock('@/app/golf/actions/round-review-system', () => ({
  generateAndStoreRoundReview: vi.fn(async () => ({ success: false, error: 'not mocked' })),
}));

vi.mock('@/app/golf/actions/insights', () => ({
  generateRoundReview: vi.fn(async () => ({ success: false })),
  getCoachHelmStatus: vi.fn(async () => ({ success: true, enabled: false })),
}));

// ---------------------------------------------------------------------------
// Chainable Supabase fake. The hook issues three distinct queries, all
// through `.from(table)`, distinguished here by table name and (for
// `golf_rounds`, queried twice for two different purposes) by which
// terminal method is called — exactly mirroring the two real call sites:
//   golf_rounds        .select('player_id')...single()          -> roundPlayerRow
//   golf_rounds        .select('total_score, status')...maybeSingle() -> roundDataProbeRow
//   golf_round_reviews .select('*')...maybeSingle()              -> reviewRow
//   golf_shots         .select('id', {count...})  (bare-awaited) -> shotsCount
// ---------------------------------------------------------------------------
let roundPlayerRow: { player_id: string } | null;
let roundDataProbeRow: { total_score: number | null; status: string | null } | null;
let shotsCount: number;
let reviewRow: Record<string, unknown> | null;

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn(async () =>
      roundPlayerRow ? { data: roundPlayerRow, error: null } : { data: null, error: { message: 'not found' } },
    );
    chain.maybeSingle = vi.fn(async () => ({ data: roundDataProbeRow, error: null }));
    return chain;
  }
  if (table === 'golf_round_reviews') {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: reviewRow, error: null }));
    return chain;
  }
  if (table === 'golf_shots') {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    // Never awaited via a terminal method in the real call — resolved as a
    // bare-awaited thenable, like the actual Supabase query builder.
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, count: shotsCount }).then(onFulfilled, onRejected);
    return chain;
  }
  // golf_coaches (coach-status fallback) — unused by these player-only tests.
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: null, error: { message: 'not found' } }));
  return chain;
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  })),
}));

function buildGeneratedReview(overrides: { id?: string; summary?: string } = {}) {
  return {
    id: overrides.id ?? 'review-gen-1',
    player_id: 'player-1',
    round_id: 'round-1',
    review_content: {
      summary: overrides.summary ?? 'Generated summary',
      recommendations: ['Focus on putting', 'Work on tempo'],
    } as unknown as RoundReviewContent,
    generated_at: '2026-01-01T00:00:00.000Z',
    ai_model_version: 'test',
    shared_with_coach: false,
    shared_at: null,
    coach_notes: null,
    coach_viewed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    round: {
      id: 'round-1',
      player_id: 'player-1',
      course_name: 'Test GC',
      round_date: '2026-06-01',
      total_score: 80,
      score_to_par: 8,
      total_putts: 30,
      total_fairways_hit: 8,
      total_fairways: 14,
      total_gir: 10,
      total_gir_possible: 18,
    },
  };
}

describe('useRoundReviewV2', () => {
  beforeEach(() => {
    vi.mocked(generateAndStoreRoundReview).mockReset();
    vi.mocked(generateAndStoreRoundReview).mockResolvedValue({ success: false, error: 'not mocked' });
    vi.mocked(generateRoundReview).mockReset();
    vi.mocked(generateRoundReview).mockResolvedValue({ success: false });
    vi.mocked(getCoachHelmStatus).mockReset();
    vi.mocked(getCoachHelmStatus).mockResolvedValue({ success: true, enabled: false });
    mockFrom.mockClear();

    roundPlayerRow = { player_id: 'player-1' };
    // Round has completed-round data by default, so the auto-generate data
    // guard doesn't block tests that need the effect to fire.
    roundDataProbeRow = { total_score: 80, status: 'completed' };
    shotsCount = 0;
    reviewRow = null;
  });

  it('(a) returns an existing stored review without ever calling generate', async () => {
    reviewRow = {
      id: 'review-1',
      round_id: 'round-1',
      player_id: 'player-1',
      round_score: 80,
      round_score_to_par: 8,
      summary: 'Solid ball-striking round.',
      primary_takeaway: 'Keep it up',
      next_practice_priority: 'putting',
      shared_with_coach: false,
      shared_at: null,
      coach_viewed_at: null,
      coach_notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      goal_impacts: [],
      highlights: [],
      areas_to_review: [],
      round_stats: null,
      player_averages: null,
      team_averages: null,
      strokes_gained: null,
      patterns_detected: [],
      patterns_recurring: [],
    };

    const { result } = renderHook(() => useRoundReviewV2('round-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.review?.summary).toBe('Solid ball-striking round.');
    expect(result.current.needsGeneration).toBe(false);
    expect(generateAndStoreRoundReview).not.toHaveBeenCalled();
  });

  it('(b) auto-generates exactly once when no review exists, and a rerender does not fire it again', async () => {
    reviewRow = null;
    vi.mocked(generateAndStoreRoundReview).mockResolvedValueOnce({ success: true, review: buildGeneratedReview() });

    const { result, rerender } = renderHook(() => useRoundReviewV2('round-1'));

    await waitFor(() => expect(generateAndStoreRoundReview).toHaveBeenCalledTimes(1));
    expect(generateAndStoreRoundReview).toHaveBeenCalledWith('round-1', 'player-1');

    await waitFor(() => expect(result.current.generating).toBe(false));
    expect(result.current.review?.summary).toBe('Generated summary');

    // Re-render several times after the auto-generate effect has already
    // fired and settled — a prior version of this class of hook re-fired
    // its auto effect on a re-render because it re-evaluated a fresh
    // "needsGeneration" guard without checking a fired-once ref.
    // NOTE: this mocked harness can't reproduce the retry loop that
    // dropping `autoGenAttempted` would cause (a plain rerender() here
    // doesn't change the effect's dependency values either way) — this
    // assertion documents the intended behavior rather than proving the
    // guard's necessity by mutation.
    rerender();
    rerender();
    rerender();
    // Flush any pending microtasks a naive re-fire would have queued.
    await act(async () => { await Promise.resolve(); });

    expect(generateAndStoreRoundReview).toHaveBeenCalledTimes(1);
  });

  it('(c) surfaces the error on an auto-generate failure and never retries', async () => {
    reviewRow = null;
    vi.mocked(generateAndStoreRoundReview).mockResolvedValueOnce({
      success: false,
      error: 'Round must be completed before generating a review',
    });

    const { result, rerender } = renderHook(() => useRoundReviewV2('round-1'));

    await waitFor(() => expect(generateAndStoreRoundReview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.generating).toBe(false));
    expect(result.current.error).toBe('Round must be completed before generating a review');
    expect(result.current.review).toBeNull();

    // Still no review, so `needsGeneration` is still true — only
    // `autoGenAttempted` keeps the effect from firing a second time.
    expect(result.current.needsGeneration).toBe(true);

    rerender();
    rerender();
    rerender();
    await act(async () => { await Promise.resolve(); });

    expect(generateAndStoreRoundReview).toHaveBeenCalledTimes(1);
  });

  it('(d) a deliberate refresh still works after the auto-generate attempt failed', async () => {
    reviewRow = null;
    vi.mocked(generateAndStoreRoundReview).mockResolvedValueOnce({
      success: false,
      error: 'Round must be completed before generating a review',
    });

    const { result } = renderHook(() => useRoundReviewV2('round-1'));

    await waitFor(() => expect(generateAndStoreRoundReview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.generating).toBe(false));
    expect(result.current.error).toBeTruthy();

    // A user-triggered Refresh calls `generate()` directly — it is not
    // gated by `autoGenAttempted`, which only bounds the automatic effect.
    vi.mocked(generateAndStoreRoundReview).mockResolvedValueOnce({
      success: true,
      review: buildGeneratedReview({ id: 'review-gen-2' }),
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(generateAndStoreRoundReview).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.review?.summary).toBe('Generated summary');
  });
});
