/**
 * Unit tests for the P1-12 effectiveness ledger PURE derivation helpers.
 *
 * These pin the status ladder (`deriveTrustStatus`) and the recent-trend
 * sign-logic (`deriveTrend`) exactly to the shared contract. Both are pure —
 * no database, no clock, no randomness — so the tests are fully deterministic.
 *
 * Run: npm test -- event-ledger
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const adminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminClientMock(),
}));

// Keep the real `isTransientFetchError` predicate (it's the thing under
// test in the non-retryable case) but strip the real 500ms backoff so the
// retry tests run instantly.
vi.mock('@/lib/utils/transient-error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/transient-error')>();
  return { ...actual, delay: vi.fn().mockResolvedValue(undefined) };
});

import { logServerError } from '@/lib/server-error-logger';
import {
  deriveTrustStatus,
  deriveTrend,
  RECENT_TREND_WINDOW,
  recordInsightAction,
  recordInsightExposure,
  type TrustStatus,
} from './event-ledger';

const logServerErrorMock = vi.mocked(logServerError);

describe('deriveTrustStatus — the status ladder', () => {
  test('zero measured outcomes → new_hypothesis (no evidence)', () => {
    expect(deriveTrustStatus(0, 0)).toBe<TrustStatus>('new_hypothesis');
    // worked is ignored when nothing was measured.
    expect(deriveTrustStatus(0, 5)).toBe<TrustStatus>('new_hypothesis');
  });

  test('1 or 2 measured → needs_validation (too few to trust)', () => {
    expect(deriveTrustStatus(1, 0)).toBe<TrustStatus>('needs_validation');
    expect(deriveTrustStatus(1, 1)).toBe<TrustStatus>('needs_validation');
    expect(deriveTrustStatus(2, 2)).toBe<TrustStatus>('needs_validation');
  });

  test('measured >= 3 and rate >= 0.6 → supported', () => {
    expect(deriveTrustStatus(3, 3)).toBe<TrustStatus>('supported'); // 1.0
    expect(deriveTrustStatus(3, 2)).toBe<TrustStatus>('supported'); // 0.666…
    expect(deriveTrustStatus(5, 3)).toBe<TrustStatus>('supported'); // 0.6 boundary
    expect(deriveTrustStatus(10, 6)).toBe<TrustStatus>('supported'); // 0.6 boundary
  });

  test('measured >= 3 and 0.4 <= rate < 0.6 → promising', () => {
    expect(deriveTrustStatus(5, 2)).toBe<TrustStatus>('promising'); // 0.4 boundary
    expect(deriveTrustStatus(10, 5)).toBe<TrustStatus>('promising'); // 0.5
    expect(deriveTrustStatus(10, 5).valueOf()).not.toBe('supported');
    // just under 0.6 stays promising
    expect(deriveTrustStatus(100, 59)).toBe<TrustStatus>('promising'); // 0.59
  });

  test('measured >= 3 and rate < 0.4 → underperforming', () => {
    expect(deriveTrustStatus(3, 0)).toBe<TrustStatus>('underperforming'); // 0
    expect(deriveTrustStatus(3, 1)).toBe<TrustStatus>('underperforming'); // 0.333…
    expect(deriveTrustStatus(100, 39)).toBe<TrustStatus>('underperforming'); // 0.39
  });

  test('boundary values are inclusive on the high side', () => {
    // exactly 0.6 → supported (>=), exactly 0.4 → promising (>=)
    expect(deriveTrustStatus(5, 3)).toBe('supported');
    expect(deriveTrustStatus(5, 2)).toBe('promising');
  });

  test('hardened against malformed counts (clamp + floor + non-finite)', () => {
    // worked > measured is clamped to measured → rate caps at 1.0, never NaN.
    expect(deriveTrustStatus(3, 99)).toBe<TrustStatus>('supported');
    // negative worked clamps to 0.
    expect(deriveTrustStatus(3, -5)).toBe<TrustStatus>('underperforming');
    // negative / NaN measured reads as zero evidence.
    expect(deriveTrustStatus(-1, 0)).toBe<TrustStatus>('new_hypothesis');
    expect(deriveTrustStatus(Number.NaN, 0)).toBe<TrustStatus>('new_hypothesis');
    // fractional inputs floor before the ratio.
    expect(deriveTrustStatus(3.9, 3.9)).toBe<TrustStatus>('supported');
  });

  test('deterministic — same inputs always yield same status', () => {
    for (let i = 0; i < 50; i++) {
      expect(deriveTrustStatus(7, 4)).toBe('promising');
    }
  });
});

describe('deriveTrend — recent outcome direction (newest-first)', () => {
  test('empty list → null (no measured outcomes)', () => {
    expect(deriveTrend([])).toBeNull();
  });

  test('net-positive recent improvements → up', () => {
    expect(deriveTrend([1, 2, 3])).toBe('up');
    expect(deriveTrend([0.5, -0.1, 0.2])).toBe('up'); // 2 pos vs 1 neg
  });

  test('net-negative recent improvements → down', () => {
    expect(deriveTrend([-1, -2, -3])).toBe('down');
    expect(deriveTrend([-0.5, 0.1, -0.2])).toBe('down'); // 2 neg vs 1 pos
  });

  test('tie between positive and negative → flat', () => {
    expect(deriveTrend([1, -1])).toBe('flat');
    expect(deriveTrend([2, -2, 0])).toBe('flat'); // 1 pos, 1 neg, 1 zero
  });

  test('all-zero improvements (present but flat) → flat', () => {
    expect(deriveTrend([0, 0, 0])).toBe('flat');
  });

  test('null/undefined/non-finite entries are ignored', () => {
    // single real positive among nulls → up
    expect(deriveTrend([null, 5, undefined])).toBe('up');
    // all entries null → no signed evidence → null
    expect(deriveTrend([null, null, null])).toBeNull();
    expect(deriveTrend([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  test('only the most-recent RECENT_TREND_WINDOW entries count', () => {
    expect(RECENT_TREND_WINDOW).toBe(3);
    // 3 negatives up front outweigh later positives that fall outside the window.
    expect(deriveTrend([-1, -1, -1, 10, 10, 10])).toBe('down');
    // 3 positives up front → up regardless of older regressions.
    expect(deriveTrend([1, 1, 1, -10, -10])).toBe('up');
  });

  test('zero exactly at the worked-threshold is neither up nor down', () => {
    // a single 0 is "present but unsigned" → flat (not null, an outcome existed).
    expect(deriveTrend([0])).toBe('flat');
  });

  test('non-array input → null (defensive)', () => {
    // @ts-expect-error — exercising the runtime guard against bad callers.
    expect(deriveTrend(null)).toBeNull();
    // @ts-expect-error — exercising the runtime guard against bad callers.
    expect(deriveTrend(undefined)).toBeNull();
  });

  test('deterministic — same series always yields same trend', () => {
    for (let i = 0; i < 50; i++) {
      expect(deriveTrend([3, -1, 2])).toBe('up');
    }
  });
});

/**
 * Pkg 9 slice 1a review follow-up — `recordInsightAction`'s dedup read/insert
 * chain against a Supabase-shaped admin-client mock (the same (insight_id,
 * actor_id, action_type)-same-day dedup `recordInsightExposure` already has,
 * built on `action-rows.ts`'s `actionDedupeKey`/`isActionAlreadyRecorded`).
 */
describe('recordInsightAction — dedup read/insert chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeActionTable(opts: {
    existing?: Array<{ actor_id: string | null }>;
    existingError?: { message: string; code?: string } | null;
    insertError?: { message: string; code?: string } | null;
  }) {
    const insertSpy = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
    return {
      table: {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: async () => ({
                data: opts.existingError ? null : (opts.existing ?? []),
                error: opts.existingError ?? null,
              }),
            }),
          }),
        }),
        insert: insertSpy,
      },
      insertSpy,
    };
  }

  test('skips the insert when this (insight, actor, action_type) is already recorded today', async () => {
    const { table, insertSpy } = makeActionTable({ existing: [{ actor_id: 'coach-1' }] });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightAction({
      insight_id: 'insight-1',
      player_id: 'player-1',
      actor_id: 'coach-1',
      action_type: 'create_focus_area',
    });

    expect(insertSpy).not.toHaveBeenCalled();
  });

  test('inserts when no matching (insight, actor, action_type) key exists yet', async () => {
    const { table, insertSpy } = makeActionTable({ existing: [{ actor_id: 'someone-else' }] });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightAction({
      insight_id: 'insight-1',
      player_id: 'player-1',
      actor_id: 'coach-1',
      action_type: 'create_focus_area',
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0]?.[0]).toMatchObject({
      insight_id: 'insight-1',
      actor_id: 'coach-1',
      action_type: 'create_focus_area',
    });
  });

  test('falls open — still inserts — when the dedup read itself errors', async () => {
    const { table, insertSpy } = makeActionTable({ existingError: { message: 'boom' } });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightAction({
      insight_id: 'insight-1',
      player_id: 'player-1',
      actor_id: 'coach-1',
      action_type: 'create_focus_area',
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  test('is a no-op when required fields are missing — no client call at all', async () => {
    await recordInsightAction({ insight_id: '', player_id: 'player-1', action_type: 'create_focus_area' });
    expect(adminClientMock).not.toHaveBeenCalled();
  });
});

/**
 * N-audit 2026-09-23 follow-up — `recordInsightExposure`'s bounded retry.
 * The dedup SELECT and the INSERT can both throw before ever returning a
 * typed `{ data, error }` pair (a network-level `fetch` failure), which is a
 * different failure mode from a constraint/RLS violation returned as a typed
 * `error` — only the former is retried.
 */
describe('recordInsightExposure — bounded retry on transient network errors', () => {
  const sampleRows = [{ insight_id: 'insight-1', player_id: 'player-1' }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Builds a `golf_insight_exposure` table double: `insertImpl` drives the insert leg. */
  function makeExposureTable(insertImpl: () => Promise<{ error: { message: string; code?: string } | null }>) {
    const insertSpy = vi.fn(insertImpl);
    return {
      table: {
        select: () => ({
          in: () => ({
            gte: async () => ({ data: [], error: null }),
          }),
        }),
        insert: insertSpy,
      },
      insertSpy,
    };
  }

  test('retry-then-succeed: a transient network throw on the first attempt is retried and recovers silently', async () => {
    let calls = 0;
    const { table, insertSpy } = makeExposureTable(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return { error: null };
    });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    expect(insertSpy).toHaveBeenCalledTimes(2);
    // No failure was ever persisted past the retry — nothing logged.
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  test('retry-then-fail: a transient network throw on both attempts exhausts the bound and logs a warning with the row count', async () => {
    const { table, insertSpy } = makeExposureTable(async () => {
      throw new TypeError('fetch failed');
    });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    // Exactly one retry — bounded, not unbounded.
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const [message, context, severity] = logServerErrorMock.mock.calls[0]!;
    expect(message).toContain('recordInsightExposure threw (after 1 retry)');
    expect(context).toMatchObject({ extra: { count: sampleRows.length } });
    expect(severity).toBe('warning');
  });

  test('non-retryable: a non-network throw fails on the first attempt, no retry, logged at default (error) severity', async () => {
    const { table, insertSpy } = makeExposureTable(async () => {
      throw new RangeError('unexpected shape');
    });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const [message, context, severity] = logServerErrorMock.mock.calls[0]!;
    expect(message).toContain('recordInsightExposure threw:');
    expect(message).not.toContain('after 1 retry');
    expect(context).toMatchObject({ extra: { count: sampleRows.length } });
    // Default severity (undefined here — logServerError itself defaults to 'error').
    expect(severity).toBeUndefined();
  });

  test('non-retryable: a returned constraint-violation error (not thrown) is never retried', async () => {
    const { table, insertSpy } = makeExposureTable(async () => ({
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    }));
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    // Logged as an ordinary insert failure, not the retry-exhausted path.
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const [message] = logServerErrorMock.mock.calls[0]!;
    expect(message).toContain('recordInsightExposure insert failed');
  });
});
