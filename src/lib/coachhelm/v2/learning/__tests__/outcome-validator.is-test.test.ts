import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import {
  gradeableRounds,
  prefetchCandidateRounds,
  selectValidationRound,
  validatePredictionAgainstOutcome,
  type RipePrediction,
  type RoundOutcomeRow,
} from '../outcome-validator';

// ---------------------------------------------------------------------------
// OD-03 leak (2026-09-28 audit, demo team 6ecdd1a6): seven predictions for one
// player were graded against round 91301a75 (is_test, 37 over 18 holes, −35),
// the first round in their windows, while a real 71 (−1) sat later in the same
// window. A QA round must never grade a prediction, even a plausible-looking one.
// ---------------------------------------------------------------------------

type Round = RoundOutcomeRow & { id: string; player_id: string };

function round(id: string, day: string, over: Partial<Round> = {}): Round {
  return {
    id,
    player_id: 'P',
    round_date: day,
    created_at: `${day}T18:00:00Z`,
    score_to_par: 0,
    total_putts: 30,
    total_fairways_hit: 8,
    total_fairways: 14,
    total_gir: 10,
    total_gir_possible: 18,
    holes_played: 18,
    total_score: 72,
    front_nine: 36,
    back_nine: 36,
    is_test: false,
    ...over,
  };
}

const prediction: RipePrediction = {
  id: 'pred',
  player_id: 'P',
  metric: 'score_to_par',
  predicted_value: 1,
  predicted_low: -2,
  predicted_high: 4,
  confidence_interval_low: null,
  confidence_interval_high: null,
  created_at: '2026-09-10T12:00:00Z',
  due_date: '2026-09-25',
  related_round_id: null,
};

describe('gradeableRounds', () => {
  it('drops a countable-looking round flagged is_test', () => {
    const qa = round('qa', '2026-09-12', { is_test: true });
    expect(gradeableRounds([qa])).toEqual([]);
  });

  it('drops the implausible 37-stroke round even without the flag', () => {
    const sep17 = round('91301a75', '2026-09-17', {
      total_score: 37, score_to_par: -35, front_nine: 19, back_nine: 18, total_putts: 18,
    });
    expect(gradeableRounds([sep17])).toEqual([]);
  });

  it('drops a hole-less round (declared 18, no nines recorded)', () => {
    expect(gradeableRounds([round('holeless', '2026-09-12', { front_nine: null, back_nine: null })])).toEqual([]);
  });

  it('keeps a real round', () => {
    const real = round('real', '2026-09-19', { total_score: 71, score_to_par: -1, front_nine: 35 });
    expect(gradeableRounds([real])).toEqual([real]);
  });

  it('with a test round first in the window, the real round is the one selected', () => {
    const rounds = [
      round('91301a75', '2026-09-17', { is_test: true, total_score: 37, score_to_par: -35, front_nine: 19, back_nine: 18 }),
      round('real', '2026-09-19', { total_score: 71, score_to_par: -1, front_nine: 35 }),
    ];
    // Without the filter the test round wins (it is first in the window).
    expect(selectValidationRound(rounds, prediction.created_at!, prediction.due_date!)?.id).toBe('91301a75');
    expect(selectValidationRound(gradeableRounds(rounds), prediction.created_at!, prediction.due_date!)?.id).toBe(
      'real',
    );
  });
});

/** Thenable builder that records eq filters and returns the given rows. */
function fakeSupabase(rows: Round[]) {
  const eqs: Array<[string, unknown]> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, v: unknown) => {
        if (table === 'golf_rounds') eqs.push([col, v]);
        return builder;
      },
      in: () => builder,
      gt: () => builder,
      lte: () => builder,
      order: () => builder,
      limit: () => builder,
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return builder;
      },
      update: () => builder,
      single: () => builder,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(table === 'golf_rounds' ? { data: rows, error: null } : { data: null, error: null }).then(
          res,
          rej,
        ),
    };
    return builder;
  });
  return { client: { from } as never, eqs, inserted };
}

describe('validation reads leave is_test rounds out', () => {
  it('the batch prefetch filters is_test = false', async () => {
    const { client, eqs } = fakeSupabase([]);
    await prefetchCandidateRounds(client, [prediction]);
    expect(eqs).toContainEqual(['is_test', false]);
  });

  it('the per-prediction read filters is_test = false', async () => {
    const { client, eqs } = fakeSupabase([]);
    await validatePredictionAgainstOutcome(client, prediction);
    expect(eqs).toContainEqual(['is_test', false]);
  });

  it('a prefetched is_test round never grades: the prediction stays ungraded', async () => {
    const { client, inserted } = fakeSupabase([]);
    const qa = round('qa', '2026-09-12', { is_test: true, score_to_par: -35 });
    const result = await validatePredictionAgainstOutcome(client, prediction, new Map([['P', [qa]]]));
    expect(result).toEqual({ skipped: 'no_round_in_closed_window' });
    expect(inserted).toEqual([]);
  });
});
