/**
 * A sample-floor refusal must NOT disable the stale-composite scope sweep.
 *
 * `synthesizeForPlayer` only runs its stale-composite retraction sweep on a
 * run with no INFRA failures, because a rule that failed for an infra reason
 * may simply not have re-emitted a signature it still owns — archiving then
 * retracts a live insight (NEW-P1). An `InsightEvidenceRefusal` is the
 * opposite case: the rule deliberately declined to publish because its
 * evidence is below `MIN_SAMPLE_N`, which IS dequalification.
 *
 * Counting refusals as `errors` meant one under-evidenced rule silently
 * disabled stale retraction for that player on EVERY run, leaving superseded
 * and dequalified composites coach-visible forever. These tests pin the
 * distinction: a refusal still sweeps, a real throw still does not.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InsightEvidenceRefusal } from '@/lib/coachhelm/v2/insights/upsert';

const upsertInsightV3 = vi.fn();
const logServerError = vi.fn(async () => {});
const logServerEvent = vi.fn(async () => {});

/** Rows the sweep's SELECT returns — one stale composite awaiting retraction. */
let selectRows: Array<Record<string, unknown>> = [];
/** Ids the sweep actually archived via UPDATE. */
let archivedIds: string[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const selectChain = {
        select: () => selectChain,
        eq: () => selectChain,
        like: () => selectChain,
        in: () => selectChain,
        is: () => selectChain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: selectRows, error: null }).then(resolve),
      };
      return {
        select: () => selectChain,
        update: () => ({
          eq: (col: string, val: string) => {
            if (col === 'id') archivedIds.push(val);
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
        }),
      };
    },
  }),
}));

vi.mock('@/lib/coachhelm/v3/insights/upsert-v3', () => ({
  upsertInsightV3: (...args: unknown[]) => upsertInsightV3(...args),
  GATED_OUT: Symbol.for('GATED_OUT'),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...(args as [])),
  logServerEvent: (...args: unknown[]) => logServerEvent(...(args as [])),
}));

vi.mock('@/lib/coachhelm/v3/composite/loader', () => ({
  loadRecentInsightsForPlayer: () => Promise.resolve([]),
}));

/**
 * One firing hole-sequence rule is all this needs: 5 rounds where holes 13-18
 * play a stroke worse clears `closing_hole_fatigue`'s gate, so Pass 3 runs and
 * whatever `upsertInsightV3` does becomes the run's only outcome.
 */
vi.mock('@/lib/coachhelm/v3/composite/hole-sequence-loader', () => ({
  loadCompositeContext: () =>
    Promise.resolve({
      hole_scores: ['r1', 'r2', 'r3', 'r4', 'r5'].flatMap((rid) =>
        Array.from({ length: 18 }, (_, i) => ({
          round_id: rid,
          hole_number: i + 1,
          par: 4,
          score: i + 1 >= 13 ? 5 : 4,
        })),
      ),
      short_game_shots: [],
      flyer_lie_shots: [],
    }),
}));

const STALE_ROW = {
  id: 'stale-1',
  signature: 'v3:composite:some_retired_rule:sig',
  metadata: null,
  lifecycle_state: 'detected',
};

describe('synthesizeForPlayer · refusals vs infra errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows = [STALE_ROW];
    archivedIds = [];
  });

  it('still sweeps stale composites when a rule refused on the sample floor', async () => {
    upsertInsightV3.mockRejectedValue(
      new InsightEvidenceRefusal('upsertInsight: evidence.sample_n=3 < 5; refusing to emit'),
    );

    const { synthesizeForPlayer } = await import('@/lib/coachhelm/v3/composite/synthesis');
    const result = await synthesizeForPlayer('player-1');

    expect(result.refusals).toBeGreaterThan(0);
    // The refusal is control flow, not an infra failure.
    expect(result.errors).toBe(0);
    // ...so the sweep ran and retracted the stale row.
    expect(archivedIds).toContain('stale-1');
    expect(result.stale_retracted).toBe(1);
    // Refusals are logged as suppressed events, never as paging errors.
    expect(logServerEvent).toHaveBeenCalled();
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('does NOT sweep when a rule threw for a real infra reason', async () => {
    upsertInsightV3.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const { synthesizeForPlayer } = await import('@/lib/coachhelm/v3/composite/synthesis');
    const result = await synthesizeForPlayer('player-1');

    expect(result.errors).toBeGreaterThan(0);
    expect(result.refusals).toBe(0);
    // NEW-P1: an infra failure may have skipped re-emitting a live signature,
    // so nothing may be archived.
    expect(archivedIds).toEqual([]);
    expect(result.stale_retracted).toBeUndefined();
    expect(logServerError).toHaveBeenCalled();
  });
});
