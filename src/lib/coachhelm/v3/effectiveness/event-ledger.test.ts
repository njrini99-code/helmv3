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

const isFlagEnabledMock = vi.fn().mockReturnValue(false);
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: (id: string) => isFlagEnabledMock(id),
}));

import {
  deriveTrustStatus,
  deriveTrend,
  RECENT_TREND_WINDOW,
  recordInsightAction,
  getInsightEffectivenessSignals,
  type TrustStatus,
} from './event-ledger';

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
 * Package 10 gap audit (repair-plan §14.12 item d — missingness) —
 * getInsightEffectivenessSignals' outcome-counting loop, gated behind
 * `coachhelm_trust_status_exclude_unmeasured_outcomes`. A null-`improvement`
 * `golf_insight_outcome` row is a thin-sample attribution that never got a
 * real measurement (attribute.ts's own MIN_WINDOW_ROUNDS no-op), not "we
 * measured, nothing happened" — flag ON must exclude it from `measured`/
 * `worked`; flag OFF (the shipped default) must reproduce the prior,
 * unconditional-count behavior exactly.
 */
describe('getInsightEffectivenessSignals — outcome counting vs. coachhelm_trust_status_exclude_unmeasured_outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFlagEnabledMock.mockReturnValue(false);
  });

  function selectChain(rows: Array<Record<string, unknown>>) {
    return {
      select: () => ({
        in: () => ({
          order: () => ({
            range: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    };
  }

  function makeClient(opts: {
    exposure?: Array<{ insight_id: string }>;
    action?: Array<{ insight_id: string }>;
    outcome?: Array<{ insight_id: string; improvement: number | null; measured_at: string }>;
  }) {
    const tables: Record<string, ReturnType<typeof selectChain>> = {
      golf_insight_exposure: selectChain(opts.exposure ?? []),
      golf_insight_action: selectChain(opts.action ?? []),
      golf_insight_outcome: selectChain(opts.outcome ?? []),
    };
    return { from: (name: string) => tables[name] };
  }

  test('flag OFF (default): a null-improvement row still counts into measured — unchanged prior behavior', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    adminClientMock.mockReturnValue(
      makeClient({
        outcome: [{ insight_id: 'i-1', improvement: null, measured_at: '2026-09-01T00:00:00Z' }],
      }),
    );

    const result = await getInsightEffectivenessSignals(['i-1']);
    const sig = result.get('i-1');
    expect(sig?.measured).toBe(1);
    expect(sig?.worked).toBe(0);
    expect(sig?.status).toBe<TrustStatus>('needs_validation');
  });

  test('flag ON: a null-improvement row (thin-sample, insufficient evidence) is excluded from measured', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    adminClientMock.mockReturnValue(
      makeClient({
        outcome: [{ insight_id: 'i-1', improvement: null, measured_at: '2026-09-01T00:00:00Z' }],
      }),
    );

    const result = await getInsightEffectivenessSignals(['i-1']);
    const sig = result.get('i-1');
    expect(sig?.measured).toBe(0);
    expect(sig?.worked).toBe(0);
    // Missing post-action evidence remains unknown, not a validated-but-thin status.
    expect(sig?.status).toBe<TrustStatus>('new_hypothesis');
  });

  test('flag ON: 3+ null-improvement rows no longer read as underperforming on zero real evidence', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    adminClientMock.mockReturnValue(
      makeClient({
        outcome: [
          { insight_id: 'i-1', improvement: null, measured_at: '2026-09-01T00:00:00Z' },
          { insight_id: 'i-1', improvement: null, measured_at: '2026-09-02T00:00:00Z' },
          { insight_id: 'i-1', improvement: null, measured_at: '2026-09-03T00:00:00Z' },
        ],
      }),
    );

    const result = await getInsightEffectivenessSignals(['i-1']);
    const sig = result.get('i-1');
    expect(sig?.measured).toBe(0);
    expect(sig?.status).not.toBe<TrustStatus>('underperforming');
    expect(sig?.status).toBe<TrustStatus>('new_hypothesis');
  });

  test('flag ON: a real (non-null) improvement still counts normally alongside excluded null rows', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    adminClientMock.mockReturnValue(
      makeClient({
        outcome: [
          { insight_id: 'i-1', improvement: null, measured_at: '2026-09-01T00:00:00Z' },
          { insight_id: 'i-1', improvement: 1.5, measured_at: '2026-09-02T00:00:00Z' },
          { insight_id: 'i-1', improvement: -0.5, measured_at: '2026-09-03T00:00:00Z' },
        ],
      }),
    );

    const result = await getInsightEffectivenessSignals(['i-1']);
    const sig = result.get('i-1');
    // Only the 2 real-valued rows count — the null row is excluded either way.
    expect(sig?.measured).toBe(2);
    expect(sig?.worked).toBe(1);
  });

  test('shown/acted are unaffected by the flag either way', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    adminClientMock.mockReturnValue(
      makeClient({
        exposure: [{ insight_id: 'i-1' }, { insight_id: 'i-1' }],
        action: [{ insight_id: 'i-1' }],
        outcome: [{ insight_id: 'i-1', improvement: null, measured_at: '2026-09-01T00:00:00Z' }],
      }),
    );

    const result = await getInsightEffectivenessSignals(['i-1']);
    const sig = result.get('i-1');
    expect(sig?.shown).toBe(2);
    expect(sig?.acted).toBe(1);
  });
});
