/**
 * Unit tests for the v3 outcome-measurement fix to `backfillInsightOutcomes`
 * (PR: coachhelm outcome measurement). Before this change, the only mapping
 * (`metricToRoundField`) understood a handful of legacy v2 metric names
 * (`scoring_average`, `sg_total`, ...) and never matched a v3 `evidence.metric`
 * id (`sg_putting`, `gir_pct`, `penalty_rate_per_round`, ...) — so ~95% of v3
 * insights never got `outcome_status` populated.
 *
 * These tests exercise `__backfillInsightOutcomesForTest` (the same private
 * function `rollupInsightEffectivenessForRange` calls) directly against a
 * minimal fake Supabase client, proving:
 *  1. A canonical v3 metric id resolves via `averageInWindow` and writes a
 *     status + before/after pair.
 *  2. A metric the v3 registry marks `intentional-null` is left unmeasured
 *     (no update issued, `averageInWindow` never called for it).
 *  3. Direction is handled correctly for a `lower_better` v3 metric — a drop
 *     in the metric counts as an improvement, not a regression.
 *  4. A legacy (non-v3) metric name still falls back to the original
 *     `golf_rounds`-column mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/coachhelm/v3/causality/attribute', async () => {
  const actual = await vi.importActual<typeof import('@/lib/coachhelm/v3/causality/attribute')>(
    '@/lib/coachhelm/v3/causality/attribute',
  );
  return {
    ...actual,
    averageInWindow: vi.fn(),
  };
});

import { averageInWindow } from '@/lib/coachhelm/v3/causality/attribute';
import { __backfillInsightOutcomesForTest as backfillInsightOutcomes } from '@/lib/coachhelm/v2/analytics/effectiveness-writer';

const averageInWindowMock = vi.mocked(averageInWindow);

interface FakeCandidate {
  id: string;
  player_id: string | null;
  insight_type: string | null;
  created_at: string | null;
  evidence: Record<string, unknown> | null;
}

interface FakeRound {
  player_id: string;
  round_date: string;
  total_score?: number;
  score_to_par?: number;
  strokes_gained_total?: number;
  strokes_gained_putting?: number;
  strokes_gained_approach?: number;
  strokes_gained_tee?: number;
  strokes_gained_around_green?: number;
  total_putts?: number;
}

function makeFakeSupabase(opts: { candidates: FakeCandidate[]; rounds?: FakeRound[] }) {
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const rangeCalls: Array<[number, number]> = [];

  const from = vi.fn((table: string) => {
    if (table === 'golf_coach_insights') {
      return {
        select: () => ({
          in: () => ({
            is: () => ({
              lte: () => ({
                order: () => ({
                  order: () => ({
                    // Real pagination: each call returns the requested slice
                    // of `opts.candidates`, matching FETCH_PAGE_SIZE=200 in
                    // the real query — a fixture with > 200 rows exercises
                    // more than one page, same as production.
                    range: (from: number, to: number) => {
                      rangeCalls.push([from, to]);
                      const page = opts.candidates.slice(from, to + 1);
                      return Promise.resolve({ data: page, error: null });
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            updateCalls.push({ id, payload });
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'golf_rounds') {
      return {
        select: () => ({
          in: () => ({
            gte: () => Promise.resolve({ data: opts.rounds ?? [], error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table in fake supabase: ${table}`);
  });

  const client = { from } as unknown as SupabaseClient;
  return { client, updateCalls, rangeCalls };
}

const ASOF = new Date('2026-09-22T00:00:00.000Z');
// > POST_WINDOW_DAYS (14) before ASOF so the candidate is eligible.
const CREATED_AT = '2026-09-01T00:00:00.000Z';

beforeEach(() => {
  averageInWindowMock.mockReset();
});

describe('backfillInsightOutcomes — v3 metric mapping', () => {
  it('resolves a canonical v3 metric id via averageInWindow and writes before/after', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-1',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT,
      evidence: { metric: 'sg_putting' },
    };
    const { client, updateCalls } = makeFakeSupabase({ candidates: [candidate] });

    // sg_putting is higher_better: post (0.9) > pre (0.2) → improved.
    averageInWindowMock
      .mockResolvedValueOnce({ ok: true, avg: 0.2, n: 6 })
      .mockResolvedValueOnce({ ok: true, avg: 0.9, n: 6 });

    await backfillInsightOutcomes(client, ASOF);

    expect(averageInWindowMock).toHaveBeenCalledTimes(2);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.id).toBe('insight-1');
    expect(updateCalls[0]!.payload).toMatchObject({
      outcome_status: 'improved',
      outcome_metric_name: 'sg_putting',
      outcome_metric_before: 0.2,
      outcome_metric_after: 0.9,
    });
    expect(updateCalls[0]!.payload.outcome_measured_at).toEqual(expect.any(String));
  });

  it('leaves an intentional-null v3 metric unmeasured and never calls averageInWindow for it', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-2',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT,
      // Diagnostic-only, no per-round time-series — see metric-sources.ts.
      evidence: { metric: 'putt_miss_bias_high_pct' },
    };
    const { client, updateCalls } = makeFakeSupabase({ candidates: [candidate] });

    await backfillInsightOutcomes(client, ASOF);

    expect(averageInWindowMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('flips direction correctly for a lower_better v3 metric (a drop counts as improved)', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-3',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT,
      // penalty_rate_per_round is lower_better.
      evidence: { metric: 'penalty_rate_per_round' },
    };
    const { client, updateCalls } = makeFakeSupabase({ candidates: [candidate] });

    // Penalties dropped from 3.0/round to 1.0/round post-insight — an
    // improvement even though post < pre (raw delta is negative).
    averageInWindowMock
      .mockResolvedValueOnce({ ok: true, avg: 3.0, n: 6 })
      .mockResolvedValueOnce({ ok: true, avg: 1.0, n: 6 });

    await backfillInsightOutcomes(client, ASOF);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.payload).toMatchObject({
      outcome_status: 'improved',
      outcome_metric_before: 3.0,
      outcome_metric_after: 1.0,
    });
  });

  it('marks a lower_better v3 metric as worsened when the value rises', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-3b',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT,
      evidence: { metric: 'penalty_rate_per_round' },
    };
    const { client, updateCalls } = makeFakeSupabase({ candidates: [candidate] });

    // Penalties rose from 1.0/round to 3.0/round — a regression.
    averageInWindowMock
      .mockResolvedValueOnce({ ok: true, avg: 1.0, n: 6 })
      .mockResolvedValueOnce({ ok: true, avg: 3.0, n: 6 });

    await backfillInsightOutcomes(client, ASOF);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.payload.outcome_status).toBe('worsened');
  });

  it('falls back to the legacy golf_rounds mapping for a non-v3 metric name', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-4',
      player_id: 'player-1',
      insight_type: 'performance_decline',
      created_at: CREATED_AT,
      // Legacy v2 evidence tag — not present in the v3 metric registry at all.
      evidence: { metric: 'scoring_average' },
    };
    const rounds: FakeRound[] = [
      { player_id: 'player-1', round_date: '2026-08-25', total_score: 80 },
      { player_id: 'player-1', round_date: '2026-08-27', total_score: 82 },
      { player_id: 'player-1', round_date: '2026-09-05', total_score: 74 },
      { player_id: 'player-1', round_date: '2026-09-08', total_score: 73 },
    ];
    const { client, updateCalls } = makeFakeSupabase({ candidates: [candidate], rounds });

    await backfillInsightOutcomes(client, ASOF);

    // Legacy path never touches averageInWindow.
    expect(averageInWindowMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.payload).toMatchObject({
      outcome_status: 'improved', // total_score is lower-is-better: 81 -> 73.5
      outcome_metric_name: 'scoring_average',
      outcome_metric_before: 81,
      outcome_metric_after: 73.5,
    });
  });

  it('leaves outcome_status null when averageInWindow returns no-data for a v3 metric', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-5',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT,
      evidence: { metric: 'gir_pct' },
    };
    const { client, updateCalls } = makeFakeSupabase({ candidates: [candidate] });

    averageInWindowMock
      .mockResolvedValueOnce({ ok: true, avg: 55, n: 4 })
      .mockResolvedValueOnce({ ok: false, reason: 'no-data' });

    await backfillInsightOutcomes(client, ASOF);

    expect(updateCalls).toHaveLength(0);
  });

  it('does not starve behind ~200 permanently-unmeasurable candidates ahead of one measurable row', async () => {
    // Simulates the real backlog shape: most eligible rows carry an evidence
    // tag neither the v3 registry nor the legacy mapping resolves at all
    // (category ids like `pattern_detected_scoring`, per-distance putt/miss
    // metrics, ...). Before the pagination fix, an unordered `.limit(150)`
    // could fill entirely with rows like these and never reach the one
    // measurable row behind them.
    const unmeasurable: FakeCandidate[] = Array.from({ length: 200 }, (_, i) => ({
      id: `unmeasurable-${i}`,
      player_id: 'player-1',
      insight_type: 'pattern_detected',
      created_at: CREATED_AT,
      evidence: { metric: 'pattern_detected_scoring' },
    }));
    const measurable: FakeCandidate = {
      id: 'insight-measurable',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT,
      evidence: { metric: 'sg_putting' },
    };
    const { client, updateCalls, rangeCalls } = makeFakeSupabase({
      candidates: [...unmeasurable, measurable],
    });

    averageInWindowMock
      .mockResolvedValueOnce({ ok: true, avg: 0.1, n: 5 })
      .mockResolvedValueOnce({ ok: true, avg: 0.8, n: 5 });

    await backfillInsightOutcomes(client, ASOF);

    // Paged past the first 200 unmeasurable rows to reach the 201st.
    expect(rangeCalls.length).toBeGreaterThan(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.id).toBe('insight-measurable');
    expect(updateCalls[0]!.payload.outcome_status).toBe('improved');
  });

  it('starts the v3 post-window the day AFTER the insight creation date (no same-day double count)', async () => {
    const candidate: FakeCandidate = {
      id: 'insight-6',
      player_id: 'player-1',
      insight_type: 'stat_regression',
      created_at: CREATED_AT, // 2026-09-01T00:00:00.000Z
      evidence: { metric: 'sg_putting' },
    };
    const { client } = makeFakeSupabase({ candidates: [candidate] });

    averageInWindowMock
      .mockResolvedValueOnce({ ok: true, avg: 0.1, n: 5 })
      .mockResolvedValueOnce({ ok: true, avg: 0.8, n: 5 });

    await backfillInsightOutcomes(client, ASOF);

    expect(averageInWindowMock).toHaveBeenCalledTimes(2);
    const preCallArgs = averageInWindowMock.mock.calls[0]!;
    const postCallArgs = averageInWindowMock.mock.calls[1]!;

    // Pre window ends AT the creation instant (same-day round still counts
    // as pre, matching the legacy path).
    expect(preCallArgs[4]).toBe(CREATED_AT);
    // Post window starts at the day boundary AFTER the creation date, not at
    // the creation instant itself — otherwise a round on 2026-09-01 would be
    // double-counted into both windows (every v3 source filters dates
    // inclusively via slice(0,10)).
    expect(postCallArgs[3]).toBe('2026-09-02T00:00:00.000Z');
    // Pre window start and post window end are still symmetric 14-day spans.
    expect(preCallArgs[3]).toBe('2026-08-18T00:00:00.000Z');
    expect(postCallArgs[4]).toBe('2026-09-16T00:00:00.000Z');
  });
});
