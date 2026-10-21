import { describe, expect, it } from 'vitest';
import { buildExposureRows, rankFactorsFromEvidence, RUNG_WEIGHT } from '../exposure-rows';

const evidence = {
  ladder: 'observed',
  strokes_shrunk: 0.55,
  support: { q_adj: 0.03 },
};

describe('rank_factors on exposure rows (Slice 1, flag coachhelm_support_v1)', () => {
  it('leaves rows exactly as before when the caller does not ask for factors (flag off)', () => {
    const rows = buildExposureRows([{ id: 'i1', player_id: 'p1', evidence }], 'coach_feed', 'c1', new Map([['i1', 2.5]]));
    expect(rows).toEqual([
      { insight_id: 'i1', player_id: 'p1', coach_id: 'c1', surface: 'coach_feed', rank_position: 0, rank_score: 2.5 },
    ]);
  });

  it('writes the factors behind the rank when asked', () => {
    const rows = buildExposureRows(
      [{ id: 'i1', player_id: 'p1', evidence }],
      'coach_feed',
      'c1',
      new Map([['i1', 2.5]]),
      { rankFactors: true },
    );
    expect(rows[0]!.rank_factors).toEqual({
      version: 'support_v1',
      score: 2.5,
      S: 0.55,
      R: 0.85,
      ladder: 'observed',
      q_adj: 0.03,
      position: 0,
      surface: 'coach_feed',
    });
  });

  it('records nothing for a row the support pass has not stamped', () => {
    const rows = buildExposureRows(
      [{ id: 'i1', player_id: 'p1', evidence: { confidence: 0.9 } }],
      'player_feed',
      null,
      undefined,
      { rankFactors: true },
    );
    expect(rows[0]!.rank_factors).toBeUndefined();
  });

  it('caps S at 3 strokes and leaves an unranked score null, not 0', () => {
    const f = rankFactorsFromEvidence(
      { ladder: 'likely', strokes_shrunk: 7 },
      { score: undefined, position: 1, surface: 'hub_signal' },
    )!;
    expect(f.S).toBe(3);
    expect(f.score).toBeNull();
    expect(f.q_adj).toBeNull();
    expect(f.R).toBe(0.65);
  });

  it('leaves a strength out of S when its strokes are the row Tour cost (Slice 1b, finding 7)', () => {
    const ctx = { score: 1, position: 0, surface: 'coach_feed' };
    const tourCost = rankFactorsFromEvidence(
      { ladder: 'observed', strokes_shrunk: 0.9, support: { direction: 'strength', strokes_basis: 'row' } },
      ctx,
    )!;
    expect(tourCost.S).toBeNull();
    expect(tourCost.S_excluded).toBe('strength_tour_cost');
    // Strokes derived from the gap itself are on the gap's benchmark: kept.
    const fromGap = rankFactorsFromEvidence(
      { ladder: 'observed', strokes_shrunk: 0.9, support: { direction: 'strength', strokes_basis: 'gap' } },
      ctx,
    )!;
    expect(fromGap.S).toBe(0.9);
    expect(fromGap).not.toHaveProperty('S_excluded');
    // A weakness keeps its strokes either way.
    expect(rankFactorsFromEvidence({ ladder: 'observed', strokes_shrunk: 0.9, support: { direction: 'weakness', strokes_basis: 'row' } }, ctx)!.S).toBe(0.9);
  });

  it('ignores an inherited key as a rung', () => {
    expect(rankFactorsFromEvidence({ ladder: 'toString' }, { score: 1, position: 0, surface: 'x' })).toBeNull();
  });

  it('uses the 03 §2.2 rung weights', () => {
    expect(RUNG_WEIGHT).toEqual({
      seen_repeatedly: 1,
      observed: 0.85,
      likely: 0.65,
      working_hypothesis: 0.4,
      not_enough_yet: 0,
    });
  });
});
