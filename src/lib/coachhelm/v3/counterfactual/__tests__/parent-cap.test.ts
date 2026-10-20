import { describe, expect, it } from 'vitest';
import { computeCounterfactual } from '../compute';
import { capByParentSg, parentSgMetric, sgBehindTour } from '../parent-cap';

/** The wave-6 review's numbers: 3–5 ft at 71% against the Tour's 88%, with all of putting 0.63 strokes behind. */
const putts35 = (attempts?: number) =>
  computeCounterfactual({ metric_id: 'putts_made_3_5ft_pct', direction: 'higher_better', player_value: 71, pga_value: 88, player_30d_scoring_avg: 77.2, player_attempts_per_round: attempts });

describe('capByParentSg: a part of the game is never worth more than its strokes-gained category', () => {
  it('3–5 ft without attempts is capped at what putting is behind (1.7 becomes 0.63), as a ceiling', () => {
    const raw = putts35();
    expect(raw.strokes_saved_per_round).toBeCloseTo(1.7, 5);
    const behind = sgBehindTour({ player_value: -0.63, pga_value: 0 });
    const p = capByParentSg(raw, behind);
    expect(p.strokes_saved_per_round).toBeCloseTo(0.63, 5);
    expect(p.strokes_saved_per_round).toBeLessThanOrEqual(behind as number);
    expect(p.projected_score_if_closed).toBeCloseTo(77.2 - 0.63, 5);
    expect(p).toMatchObject({ suppressed: false, clamped: true });
  });

  it('a projection sized by the player’s own attempts is left alone', () => {
    const own = putts35(2.4);
    expect(own.attempts_used).toBe(2.4);
    expect(capByParentSg(own, 0.1)).toBe(own);
  });

  it('within the cap, nothing changes; a category inside the noise floor suppresses the part', () => {
    const raw = putts35();
    expect(capByParentSg(raw, 2)).toBe(raw);
    expect(capByParentSg(raw, null)).toBe(raw);
    expect(capByParentSg(raw, 0.2)).toMatchObject({ suppressed: true, suppress_reason: 'below_threshold', projected_score_if_closed: null });
    // Putting level with or ahead of the Tour: no strokes to claim.
    expect(capByParentSg(raw, sgBehindTour({ player_value: 0.4, pga_value: 0 }))).toMatchObject({ suppressed: true });
  });

  it('the parents, and no cap where the Tour is not comparable', () => {
    expect(parentSgMetric('putts_made_25_plus_ft_pct')).toBe('sg_putting');
    expect(parentSgMetric('scrambling_pct_sand')).toBe('sg_around_green');
    expect(parentSgMetric('approach_proximity_125_175ft')).toBe('sg_approach');
    expect(parentSgMetric('gir_pct')).toBe('sg_approach');
    expect(parentSgMetric('sg_putting')).toBeNull();
    expect(parentSgMetric('scoring_par_4')).toBeNull();
    expect(sgBehindTour(undefined)).toBeNull();
    expect(sgBehindTour({ player_value: -1, pga_value: 0, pga_omitted: true })).toBeNull();
    expect(sgBehindTour({ player_value: Number.NaN, pga_value: 0 })).toBeNull();
  });
});
