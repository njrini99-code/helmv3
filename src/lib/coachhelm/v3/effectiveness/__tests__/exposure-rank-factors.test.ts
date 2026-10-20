/**
 * CoachHelm Slice 0 (flag `coachhelm_reads_v1_copy`): exposure rows carry the
 * rank factors behind the score in `golf_insight_exposure.rank_factors`
 * (HELD.md row 63, applied). Without factors the payload has no such key, as
 * before; a database without the column records the exposure without them.
 * Synthetic rows only.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const adminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminClientMock(),
}));

vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => false }));

import { logServerError } from '@/lib/server-error-logger';
import { recordInsightExposure } from '../event-ledger';
import { buildExposureRows, exposureRankFactors, type ExposureRankFactors } from '../exposure-rows';

const FACTORS: ExposureRankFactors = {
  magnitude: 1.2,
  magnitude_basis: 'strokes',
  confidence: 0.8,
  coach_weight: 1,
  goal_boost: 1,
  coachability: 1,
  sample_damping: 1,
  urgent: false,
};

type InsertError = { message: string; code?: string } | null;

function exposureTable(errors: InsertError[]) {
  const insertSpy = vi.fn(async (_rows: Array<Record<string, unknown>>) => ({ error: errors.shift() ?? null }));
  return {
    table: {
      select: () => ({ in: () => ({ gte: async () => ({ data: [], error: null }) }) }),
      insert: insertSpy,
    },
    insertSpy,
  };
}

describe('exposureRankFactors and buildExposureRows', () => {
  test('the factors drop the score, which is stored as rank_score', () => {
    expect(exposureRankFactors({ score: 2.5, ...FACTORS })).toEqual(FACTORS);
  });

  test('a row carries rank_factors only when factors were passed for it', () => {
    const list = [{ id: 'a', player_id: 'p' }, { id: 'b', player_id: 'p' }];
    const score = new Map([['a', 1], ['b', 2]]);
    expect(buildExposureRows(list, 'player_feed', null, score).some((r) => 'rank_factors' in r)).toBe(false);
    const rows = buildExposureRows(list, 'player_feed', null, score, new Map([['a', FACTORS]]));
    expect(rows[0]!.rank_factors).toEqual(FACTORS);
    expect('rank_factors' in rows[1]!).toBe(false);
  });
});

describe('recordInsightExposure with rank_factors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('without factors the insert has no rank_factors key (unchanged)', async () => {
    const { table, insertSpy } = exposureTable([]);
    adminClientMock.mockReturnValue({ from: () => table });
    await recordInsightExposure([{ insight_id: 'i-1', player_id: 'p-1', rank_score: 1 }]);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0]![0].every((r) => !('rank_factors' in r))).toBe(true);
  });

  test('with factors every row has the key, null where a row has none', async () => {
    const { table, insertSpy } = exposureTable([]);
    adminClientMock.mockReturnValue({ from: () => table });
    await recordInsightExposure([
      { insight_id: 'i-1', player_id: 'p-1', rank_score: 1, rank_factors: FACTORS },
      { insight_id: 'i-2', player_id: 'p-1' },
    ]);
    const rows = insertSpy.mock.calls[0]![0];
    expect(rows.map((r) => r.rank_factors)).toEqual([FACTORS, null]);
  });

  test.each(['42703', 'PGRST204'])('a missing column (%s) records the exposure without the factors', async (code) => {
    const { table, insertSpy } = exposureTable([{ message: 'column "rank_factors" does not exist', code }]);
    adminClientMock.mockReturnValue({ from: () => table });
    await recordInsightExposure([{ insight_id: 'i-1', player_id: 'p-1', rank_score: 1, rank_factors: FACTORS }]);
    expect(insertSpy).toHaveBeenCalledTimes(2);
    const retried = insertSpy.mock.calls[1]![0];
    expect(retried).toEqual([expect.objectContaining({ insight_id: 'i-1', rank_score: 1 })]);
    expect('rank_factors' in retried[0]!).toBe(false);
    expect(vi.mocked(logServerError)).not.toHaveBeenCalled();
  });

  test('any other insert error is logged once and not retried without the factors', async () => {
    const { table, insertSpy } = exposureTable([{ message: 'permission denied', code: '42501' }]);
    adminClientMock.mockReturnValue({ from: () => table });
    await recordInsightExposure([{ insight_id: 'i-1', player_id: 'p-1', rank_factors: FACTORS }]);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logServerError)).toHaveBeenCalledTimes(1);
  });
});
