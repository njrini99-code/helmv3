import { describe, expect, it } from 'vitest';
import { oneSided90Bounds } from '../bounds';
import { generateCriterion, horizonAttemptsFor, requiredAttemptsFor } from '../criterion';
import { verdictMetricFor, type VerdictMetricDef } from '../metrics';
import { keptShare, shrinkToward } from '@/lib/coachhelm/v3/support/shrink';
import { accumulatePostWindow, computeVerdict, type PostRound } from '../verdict';
import { coachVerdictLine, playerVerdictLine } from '../verdict-copy';

/**
 * 04 Example 11 (synthetic): a 4–6 ft read, 18 of 31 (58%), team pool 72%,
 * κ = 20 attempts "for the example", criterion { higher, 0.70, pct },
 * horizon 40 attempts.
 */
const EXAMPLE_DEF: VerdictMetricDef = {
  metric: 'example_putts_4_6ft_pct',
  label: '4–6 ft putts',
  direction: 'higher',
  unit: 'pct',
  attemptNoun: 'putts',
  kappa: 20,
  sayFloor: 20,
  clearFloor: 40,
  source: { kind: 'putt_band', minFeetExclusive: 4, maxFeetInclusive: 6 },
};
const BASELINE = { value: 18 / 31, n: 31 };
const PRIOR = { value: 0.72, source: 'team_pool' as const };
const CRITERION = { direction: 'higher' as const, threshold: 0.7, unit: 'pct' as const };
const HORIZON = { attempts: 40 };
const AT = '2026-10-19T04:00:00.000Z';

function post(made: number, n: number) {
  return { made, n, window_start: '2026-09-01', window_end: '2026-10-18' };
}

describe('shrinkage (02 §4) reproduces Example 11', () => {
  it('baseline_shrunk = 0.635 with κ = 20 (w = 31/51)', () => {
    expect(shrinkToward(BASELINE.value, BASELINE.n, PRIOR.value, 20)).toBeCloseTo(0.635, 3);
    expect(keptShare(31, 20)).toBeCloseTo(31 / 51, 6);
  });

  it('n <= 0 returns the prior; κ <= 0 returns the raw rate', () => {
    expect(shrinkToward(0.4, 0, 0.7, 30)).toBe(0.7);
    expect(shrinkToward(0.4, 10, 0.7, 0)).toBe(0.4);
  });
});

describe('one-sided 90% bounds (02 §11)', () => {
  it('normal approximation from n = 20', () => {
    const b = oneSided90Bounds(31, 42)!;
    expect(b.method).toBe('normal');
    expect(b.lower).toBeCloseTo(0.651, 3);
  });

  it('Wilson below n = 20 and at p = 0 or 1', () => {
    expect(oneSided90Bounds(3, 12)!.method).toBe('wilson');
    const zero = oneSided90Bounds(0, 30)!;
    expect(zero.method).toBe('wilson');
    expect(zero.lower).toBe(0);
    expect(zero.upper).toBeGreaterThan(0);
  });

  it('refuses impossible counts', () => {
    expect(oneSided90Bounds(5, 0)).toBeNull();
    expect(oneSided90Bounds(6, 5)).toBeNull();
  });
});

describe('verdict rule (03 §4.3) on Example 11', () => {
  const baselineShrunk = shrinkToward(BASELINE.value, BASELINE.n, PRIOR.value, 20);

  it('Worked: 31 of 42, lower bound 0.651 > 0.635 and 0.738 >= 0.70', () => {
    const v = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(31, 42), computedAt: AT });
    expect(v.word).toBe('worked');
    expect(v.post.value).toBeCloseTo(0.738, 3);
    expect(v.lower_bound_90).toBeCloseTo(0.651, 3);
    expect(v.expected_without_coaching).toBeCloseTo(0.635, 3);
    expect(v.computed_at).toBe(AT);
  });

  it('Did not move: 24 of 40, bounds 0.501-0.699 include 0.635', () => {
    const v = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(24, 40), computedAt: AT });
    expect(v.word).toBe('did_not_move');
    expect(v.lower_bound_90).toBeCloseTo(0.501, 3);
    expect(v.upper_bound_90).toBeCloseTo(0.699, 3);
  });

  it('Hitting the target exactly at the horizon is not enough when the bound cannot separate', () => {
    const v = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(28, 40), computedAt: AT });
    expect(v.post.value).toBe(0.7);
    expect(v.word).toBe('did_not_move');
  });

  it('Moved, not there yet: lower bound clears the shrunk baseline, rate below the target', () => {
    const v = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(138, 200), computedAt: AT });
    expect(v.lower_bound_90!).toBeGreaterThan(baselineShrunk);
    expect(v.word).toBe('moved');
  });

  it('Got worse: upper bound below the shrunk baseline (19 of 40)', () => {
    const v = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(19, 40), computedAt: AT });
    expect(v.upper_bound_90!).toBeLessThan(baselineShrunk);
    expect(v.word).toBe('got_worse');
  });

  it('Too early below the horizon, and with no attempts at all', () => {
    expect(computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(22, 39), computedAt: AT }).word).toBe('too_early');
    const none = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(0, 0), computedAt: AT });
    expect(none.word).toBe('too_early');
    expect(none.post.value).toBeNull();
  });

  it("Can't tell when the metric depends on a field below coverage", () => {
    const v = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(31, 42), dataGap: true, computedAt: AT });
    expect(v.word).toBe('cant_tell');
  });

  it('a lower-is-better metric mirrors the bounds', () => {
    const lower = { direction: 'lower' as const, threshold: 0.1, unit: 'pct' as const };
    // Baseline 0.2 three-putt-like rate; 4 of 80 is clearly better and under the target.
    expect(computeVerdict({ criterion: lower, horizon: HORIZON, baselineShrunk: 0.2, post: post(4, 80), computedAt: AT }).word).toBe('worked');
    // 30 of 80 is clearly worse.
    expect(computeVerdict({ criterion: lower, horizon: HORIZON, baselineShrunk: 0.2, post: post(30, 80), computedAt: AT }).word).toBe('got_worse');
  });
});

describe('criterion generator (03 §4.2)', () => {
  it('default threshold = shrunk + max(0.5 × gap to team, SWC), rounded up to a whole percent', () => {
    const r = generateCriterion({ def: EXAMPLE_DEF, baseline: { value: BASELINE.value, n: 31 }, prior: PRIOR })!;
    expect(r.fields.baseline_shrunk).toBeCloseTo(0.635, 3);
    // 0.635 + max(0.0425, 0.05) = 0.685 -> 0.69
    expect(r.fields.criterion.threshold).toBe(0.69);
    expect(r.fields.criterion.direction).toBe('higher');
    expect(r.fields.criterion.unit).toBe('pct');
    expect(r.fields.criterion.basis).toMatchObject({ threshold_source: 'engine', kappa: 20, prior: 0.72, prior_source: 'team_pool' });
    expect(r.fields.baseline_n).toBe(31);
    expect(r.fields.check_after_rounds).toBe(3);
    // 0.69 needs ~116 attempts to separate; the horizon is capped at the Clear floor.
    expect(r.fields.horizon).toEqual({ attempts: 40 });
    expect(r.separable).toBe(false);
  });

  it('half the gap to the team wins when it is larger than the SWC', () => {
    const r = generateCriterion({ def: EXAMPLE_DEF, baseline: { value: 0.4, n: 60 }, prior: { value: 0.8, source: 'team_pool' } })!;
    // shrunk = (60·0.4 + 20·0.8)/80 = 0.5; gap 0.3 -> step 0.15 -> 0.65
    expect(r.fields.baseline_shrunk).toBe(0.5);
    expect(r.fields.criterion.threshold).toBe(0.65);
  });

  it('reproduces "75% needs 25; 70% needs 40" for a 0.635 baseline', () => {
    expect(horizonAttemptsFor(EXAMPLE_DEF, 0.75, 0.635)).toBe(25);
    expect(horizonAttemptsFor(EXAMPLE_DEF, 0.7, 0.635)).toBe(40);
    expect(requiredAttemptsFor(0.75, 0.635)).toBe(24);
  });

  it('a coach threshold on the improving side wins; one on the wrong side is ignored', () => {
    const coach = generateCriterion({ def: EXAMPLE_DEF, baseline: BASELINE, prior: PRIOR, coachThreshold: 0.75 })!;
    expect(coach.fields.criterion.threshold).toBe(0.75);
    expect(coach.fields.criterion.basis.threshold_source).toBe('coach');
    expect(coach.fields.horizon).toEqual({ attempts: 25 });
    expect(coach.separable).toBe(true);

    const wrongWay = generateCriterion({ def: EXAMPLE_DEF, baseline: BASELINE, prior: PRIOR, coachThreshold: 0.6 })!;
    expect(wrongWay.fields.criterion.basis.threshold_source).toBe('engine');
    expect(wrongWay.fields.criterion.threshold).toBe(0.69);
  });

  it('a lower-is-better def moves the threshold down', () => {
    const def: VerdictMetricDef = { ...EXAMPLE_DEF, direction: 'lower' };
    const r = generateCriterion({ def, baseline: { value: 0.3, n: 40 }, prior: { value: 0.2, source: 'team_pool' } })!;
    // shrunk = (40·0.3 + 20·0.2)/60 = 0.2667; gap 0.0667 -> step max(0.033, 0.05) -> 0.2167 -> 0.21
    expect(r.fields.criterion.threshold).toBe(0.21);
    expect(r.fields.criterion.threshold).toBeLessThan(r.fields.baseline_shrunk);
  });

  it('refuses inputs that cannot carry a criterion', () => {
    expect(generateCriterion({ def: EXAMPLE_DEF, baseline: { value: 58, n: 31 }, prior: PRIOR })).toBeNull();
    expect(generateCriterion({ def: EXAMPLE_DEF, baseline: { value: 0.58, n: 0 }, prior: PRIOR })).toBeNull();
    expect(generateCriterion({ def: EXAMPLE_DEF, baseline: { value: 0.58, n: 3.5 }, prior: PRIOR })).toBeNull();
  });

  it('real putt bands use κ = 30 and the 20/40 putt floors', () => {
    const def = verdictMetricFor('putts_made_3_5ft_pct')!;
    expect(def.kappa).toBe(30);
    expect([def.sayFloor, def.clearFloor]).toEqual([20, 40]);
    expect(verdictMetricFor('approach_proximity_50_125ft')).toBeNull();
    expect(verdictMetricFor('three_putt_chain')).toBeNull();
    expect(verdictMetricFor(null)).toBeNull();
  });
});

describe('post window at the horizon', () => {
  const rounds: PostRound[] = [
    { round_id: 'r0', round_date: '2026-08-30', made: 9, attempts: 10 }, // before the start
    { round_id: 'r2', round_date: '2026-09-05', made: 8, attempts: 15 },
    { round_id: 'r1', round_date: '2026-09-02', made: 10, attempts: 14 },
    { round_id: 'r3', round_date: '2026-09-09', made: 7, attempts: 13 },
    { round_id: 'r4', round_date: '2026-09-12', made: 2, attempts: 12 }, // after the crossing round
  ];

  it('takes whole rounds in play order from the start until the horizon is reached', () => {
    const w = accumulatePostWindow(rounds, 40, '2026-09-01');
    expect(w).toMatchObject({ made: 25, n: 42, window_start: '2026-09-01', window_end: '2026-09-09', reached: true, rounds: 3 });
  });

  it('reports short of the horizon', () => {
    const w = accumulatePostWindow(rounds.slice(0, 3), 40, '2026-09-01');
    expect(w.reached).toBe(false);
    expect(w.n).toBe(29);
  });
});

describe('verdict lines (04 Example 11 copy)', () => {
  const baselineShrunk = shrinkToward(BASELINE.value, BASELINE.n, PRIOR.value, 20);
  const line = (made: number, n: number) => {
    const verdict = computeVerdict({ criterion: CRITERION, horizon: HORIZON, baselineShrunk, post: post(made, n), computedAt: AT });
    return { label: '4–6 ft putts', attemptNoun: 'putts', verdict, baseline: BASELINE };
  };

  it('Worked, coach and player voices', () => {
    expect(coachVerdictLine(line(31, 42))).toBe(
      '4–6 ft putts · Worked — 31 of 42 (74%) against 18 of 31 (58%) before. Expected without coaching: about 64% (bounce-back). Lower bound 65% clears it. Target was 70%.',
    );
    expect(playerVerdictLine(line(31, 42))).toBe(
      "Worked. 31 of 42 (74%), up from 58%. Some of that would have come back on its own (we'd have expected about 64%); you're clear of that too.",
    );
  });

  it('Did not move, coach and player voices', () => {
    expect(coachVerdictLine(line(24, 40))).toBe(
      '4–6 ft putts · Did not move — 24 of 40 (60%) against 58% before; within the noise of the expected 64%. Target was 70%.',
    );
    expect(playerVerdictLine(line(24, 40))).toBe(
      "Did not move. 24 of 40 (60%), about where you started. Not a failure of effort; it means we haven't found the cause yet.",
    );
  });

  it('Too early prints progress against the horizon', () => {
    expect(playerVerdictLine(line(15, 22))).toBe('Too early. 22 of the 40 putts in; 68% so far.');
  });
});
