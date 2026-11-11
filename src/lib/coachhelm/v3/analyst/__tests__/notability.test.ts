import { describe, expect, it } from 'vitest';
import { assembleFactSheets } from '../fact-sheet';
import {
  ALPHA,
  COST_AREAS_SEARCHED,
  FALSE_DISCOVERY_RATE,
  MAX_CANDIDATES,
  MIN_MEASURED_ROUNDS_FOR_COST,
  MIN_ROUNDS_PER_WINDOW,
  MIN_TEAMMATES,
  findNotable,
  questionsFor,
  strokeScale,
  type Notability,
} from '../notability';
import type { FactSheet } from '../types';
import { EVEN, TeamFixture, daysAgo, tenRounds, type Legs, type RoundSpec } from './fixtures';

const sheetOf = (fx: TeamFixture, playerId: string): FactSheet => assembleFactSheets(fx.rows()).find((s) => s.player_id === playerId)!;
const read = (fx: TeamFixture, playerId = 'subject'): Notability => findNotable(sheetOf(fx, playerId));
const ids = (list: ReadonlyArray<{ measure_id: string }>): string[] => list.map((x) => x.measure_id);

/** Twenty rounds: the last 10 at `now`, the 10 before at `before`. */
const twoWindows = (now: Legs, before: Legs, extra: (i: number, window: 'last' | 'previous') => Partial<RoundSpec> = () => ({})): RoundSpec[] => [
  ...tenRounds(2, now, (i) => extra(i, 'last')),
  ...tenRounds(52, before, (i) => extra(i, 'previous')),
];

/** Three-putts over ten rounds adding up to `total`. */
const threePutts = (total: number): number[] => Array.from({ length: 10 }, (_, i) => Math.floor(total / 10) + (i < total % 10 ? 1 : 0));

describe('the thresholds', () => {
  it('are the stated ones', () => {
    expect(ALPHA).toBe(0.05);
    expect(FALSE_DISCOVERY_RATE).toBe(0.1);
    expect(MIN_ROUNDS_PER_WINDOW).toBe(5);
    expect(MIN_TEAMMATES).toBe(5);
    expect(MIN_MEASURED_ROUNDS_FOR_COST).toBe(5);
    expect(COST_AREAS_SEARCHED).toBe(4);
    expect(MAX_CANDIDATES).toBe(3);
  });
});

describe('(a) changed: a player against their own previous window', () => {
  // Putting strokes gained was +1.0 a round over the previous 10 and is -1.0 over the last 10. Nothing else moved.
  const fx = new TeamFixture().player('subject', twoWindows(EVEN, { ...EVEN, putting: 1 }));
  const n = read(fx);

  it('raises the measure that moved, with the numbers behind it', () => {
    expect(ids(n.candidates)).toEqual(['strokes_gained_putting']);
    const c = n.candidates[0]!;
    expect(c.rank).toBe(1);
    expect(c.area).toBe('putting');
    expect(c.reasons.map((r) => r.rule)).toEqual(['changed']);
    const r = c.reasons[0]!;
    expect(r.verdict).toBe('worse');
    expect(r.compared).toEqual({
      with: 'own_previous_window',
      player: { value: -1, attempts: 10, rounds: 10, window: 'last10' },
      against: { value: 1, attempts: 10, rounds: 10, window: 'previous10' },
    });
    // Each window: the same zero-sum pattern (0,0.6,-0.6,0,0.2,-0.2,0,0.4,-0.4,0), sum of squares 1.12, / 9 = 0.12444,
    // sd 0.35277, se 0.11155. Difference -2.0; se √(2 × 0.012444) = 0.15776; Welch df = 18; t(0.975, 18) = 2.1009;
    // half width 0.3314 → -2.3314 to -1.6686.
    expect(r.difference).toEqual({ value: -2, low: -2.3314, high: -1.6686, unit: 'strokes_per_round', level: 0.95 });
    expect(r.test.name).toBe('two means: Welch 95% range, t');
    // t = 2 / 0.15776 = 12.7 on 18 degrees of freedom.
    expect(r.test.p_value).toBeLessThan(1e-9);
    expect(r.test.q_value).toBeLessThanOrEqual(FALSE_DISCOVERY_RATE);
  });

  it('ranks on strokes per round at stake with its range, not on a confidence score', () => {
    const c = n.candidates[0]!;
    // The measure is already strokes per round: 2.0 lost, 1.6686 to 2.3314.
    expect(c.strokes_at_stake).toEqual({ per_round: 2, low: 1.6686, high: 2.3314, basis: 'strokes', how: 'the measure is strokes per round' });
    expect(JSON.stringify(n)).not.toMatch(/confidence/i);
  });

  it('keeps the round total as context, not as a second card for the same thing', () => {
    expect(ids(n.outcome_context)).toEqual(['strokes_gained_total']);
    expect(ids(n.candidates)).not.toContain('strokes_gained_total');
  });

  it('lists what it checked and found unremarkable apart from the candidates', () => {
    expect(ids(n.unremarkable)).toEqual(expect.arrayContaining(['strokes_gained_off_the_tee', 'strokes_gained_approach', 'greens_in_regulation', 'fairways_hit']));
    expect(ids(n.unremarkable)).not.toContain('strokes_gained_putting');
    expect(n.good_news).toEqual([]);
    for (const u of n.unremarkable) expect(u.tests.length).toBeGreaterThan(0);
  });

  it('asks for the shots that would explain it, and the rival explanations, as data', () => {
    expect(n.candidates[0]!.questions).toEqual([
      { ask: 'strokes_gained_by_shot_distance', area: 'putting' },
      { ask: 'three_putt_first_putt_distance' },
      { ask: 'putts_by_break' },
      { ask: 'by_course', windows: ['last10', 'previous10'] },
      { ask: 'by_round_type', windows: ['last10', 'previous10'] },
      { ask: 'by_round', windows: ['last10', 'previous10'] },
    ]);
  });

  it('tests two rates with the Newcombe range and the pooled z', () => {
    // Putts from 5 to 10 feet, three a round: 24 of 30 made over the previous 10 rounds, 9 of 30 over the last 10.
    const putts = (made: number, i: number) => [[7, i * 3 < made], [8, i * 3 + 1 < made], [9, i * 3 + 2 < made]] as const;
    const f = new TeamFixture().player(
      'subject',
      twoWindows(EVEN, EVEN, (i, w) => ({ putts: putts(w === 'last' ? 9 : 24, i) })),
    );
    const r = read(f);
    expect(ids(r.candidates)).toEqual(['putts_made_5_10']);
    const reason = r.candidates[0]!.reasons[0]!;
    expect(reason.compared.player).toEqual({ value: 30, attempts: 30, rounds: 10, window: 'last10' });
    expect(reason.compared.against).toMatchObject({ value: 80, attempts: 30 });
    // Wilson 9/30: 16.66 to 47.88. Wilson 24/30: 62.69 to 90.49. Difference 30 − 80 = −50 points.
    // low  = −50 − √((30 − 16.66)² + (90.49 − 80)²) = −50 − √(177.9 + 110.0) = −66.97
    // high = −50 + √((47.88 − 30)² + (80 − 62.69)²) = −50 + √(319.7 + 299.6) = −25.11
    expect(reason.difference.value).toBe(-50);
    expect(reason.difference.low).toBeCloseTo(-66.97, 1);
    expect(reason.difference.high).toBeCloseTo(-25.11, 1);
    expect(reason.difference.unit).toBe('percent');
    // Pooled rate 33/60 = 0.55; se √(0.55 × 0.45 × 2/30) = 0.12845; z = 0.50 / 0.12845 = 3.893 → two-sided p 0.0001.
    expect(reason.test.p_value).toBeCloseTo(0.0001, 4);
    expect(reason.test.name).toBe('two rates: Newcombe 95% range, pooled z');
    // 30 putts over the window's 10 rounds = 3 a round; 3 × 0.50 × 1 stroke = 1.5 strokes a round, 0.753 to 2.009.
    const stake = r.candidates[0]!.strokes_at_stake!;
    expect(stake.per_round).toBe(1.5);
    expect(stake.low).toBeCloseTo(0.753, 2);
    expect(stake.high).toBeCloseTo(2.009, 2);
    expect(stake.basis).toBe('floor_per_event');
    expect(r.candidates[0]!.questions.slice(0, 3)).toEqual([{ ask: 'misses_by_side', band: '5_10' }, { ask: 'putts_by_break', band: '5_10' }, { ask: 'putts_by_slope', band: '5_10' }]);
  });

  it('does not call a raw difference a change when the range includes zero', () => {
    // 15 of 30 against 18 of 30: ten points apart, well inside the noise of 30 putts.
    const putts = (made: number, i: number) => [[7, i * 3 < made], [8, i * 3 + 1 < made], [9, i * 3 + 2 < made]] as const;
    const f = new TeamFixture().player('subject', twoWindows(EVEN, EVEN, (i, w) => ({ putts: putts(w === 'last' ? 15 : 18, i) })));
    const r = read(f);
    expect(r.candidates).toEqual([]);
    expect(ids(r.unremarkable)).toContain('putts_made_5_10');
  });

  it('puts a change for the better in the good news, never among the candidates', () => {
    const f = new TeamFixture().player('subject', twoWindows({ ...EVEN, putting: 1 }, EVEN));
    const r = read(f);
    expect(r.candidates).toEqual([]);
    expect(ids(r.good_news)).toEqual(['strokes_gained_putting', 'strokes_gained_total']);
    expect(r.good_news[0]!.reasons[0]).toMatchObject({ rule: 'changed', verdict: 'better', strokes_at_stake: { per_round: -2 } });
    expect(r.beyond_cap).toEqual([]);
    expect(r.outcome_context).toEqual([]);
  });
});

describe('(b) stands out in the team', () => {
  // Three-putts a round over the last 10: the subject 3.0, seven teammates 0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4.
  const mates = [6, 8, 9, 10, 11, 12, 14];
  const build = (teammates: number[]): TeamFixture => {
    const fx = new TeamFixture();
    const mine = [3, 4, 2, 3, 4, 2, 3, 3, 3, 3];
    fx.player('subject', tenRounds(2, EVEN, (i) => ({ cache: { three_putts: mine[i]! } })));
    teammates.forEach((total, k) => fx.player(`mate-${k}`, tenRounds(2, EVEN, (i) => ({ cache: { three_putts: threePutts(total)[i]! } }))));
    return fx;
  };
  const n = read(build(mates));

  it('raises a player who is an outlier against the teammates\' median', () => {
    expect(ids(n.candidates)).toEqual(['three_putts_per_round']);
    const r = n.candidates[0]!.reasons[0]!;
    expect(r.rule).toBe('stands_out_in_team');
    expect(r.verdict).toBe('worse');
    // Teammates' median 1.0. Distances 0.4,0.2,0.1,0,0.1,0.2,0.4 → sorted 0,0.1,0.1,0.2,0.2,0.4,0.4 → MAD 0.2; spread 0.2 × 1.4826 = 0.2965.
    expect(r.compared).toEqual({
      with: 'team_median',
      player: { value: 3, attempts: 10, rounds: 10, window: 'last10' },
      against: { value: 1, attempts: null, rounds: null, window: 'last10', teammates: 7, spread: 0.2965 },
    });
    // Difference 2.0. A median and a MAD are noisier than a mean and a standard deviation, and the test carries that:
    // se = 0.2965 × √(1 + (π/2)/7) = 0.2965 × 1.10653 = 0.3281, on 0.3675 × (7 − 1) = 2.205 degrees of freedom.
    // t(0.975) there lies between the printed table's 4.303 (2 df) and 3.182 (3 df): 3.94 → half width 1.293 → 0.707 to 3.293.
    expect(r.difference.value).toBe(2);
    expect(r.difference.low).toBeCloseTo(0.707, 2);
    expect(r.difference.high).toBeCloseTo(3.293, 2);
    const critical = (r.difference.high - r.difference.value) / 0.3281;
    expect(critical).toBeGreaterThan(3.182);
    expect(critical).toBeLessThan(4.303);
    // t = 2 / 0.3281 = 6.096. Two-sided p in closed form: 0.0259 on 2 df, 0.0089 on 3 df; on 2.205 it sits between.
    expect(r.test.p_value).toBeGreaterThan(0.0089);
    expect(r.test.p_value).toBeLessThan(0.0259);
    expect(r.test.q_value).toBeLessThanOrEqual(FALSE_DISCOVERY_RATE);
    expect(r.test.name).toBe('one value against the team: median and 1.4826 x MAD, t on 0.3675 x (teammates - 1) degrees of freedom');
    // One stroke per three-putt, at least.
    expect(n.candidates[0]!.strokes_at_stake).toMatchObject({ per_round: 2, basis: 'floor_per_event' });
    expect(n.candidates[0]!.questions).toEqual([{ ask: 'three_putt_first_putt_distance' }, { ask: 'first_putt_distance' }, { ask: 'putts_by_slope' }, { ask: 'teammates_same_courses' }]);
  });

  it('does not fire on a team of two', () => {
    const two = read(build([10]));
    expect(two.candidates).toEqual([]);
    expect(two.not_checked.find((x) => x.measure_id === 'three_putts_per_round')?.why).toContain('needs 5 teammates with a figure');
  });

  it('does not fire with four teammates, and does with five', () => {
    expect(read(build([8, 9, 11, 12])).candidates).toEqual([]);
    expect(ids(read(build([8, 9, 10, 11, 12])).candidates)).toEqual(['three_putts_per_round']);
  });

  it('does not fire when the player\'s own range reaches the team median', () => {
    // 2.2 a round from rounds of 0 and 5. Against the teammates (median 1.0, MAD 0.1, spread 0.148) that is 1.2 away:
    // se 0.148 × 1.10653 = 0.164, t = 7.3 on 2.205 df, two-sided p between 0.0182 (2 df) and 0.0053 (3 df): an outlier
    // on the team's spread alone. But the player's own figure is thin: sum of squares 53.6, sd 2.4404, se 0.7717,
    // range 2.2 ± 2.2622 × 0.7717 = 0.45 to 3.95, which reaches the median of 1.0. So it is not called.
    const fx = new TeamFixture();
    const mine = [0, 5, 0, 5, 0, 5, 0, 5, 1, 1];
    fx.player('subject', tenRounds(2, EVEN, (i) => ({ cache: { three_putts: mine[i]! } })));
    [8, 9, 10, 10, 10, 11, 12].forEach((total, k) => fx.player(`mate-${k}`, tenRounds(2, EVEN, (i) => ({ cache: { three_putts: threePutts(total)[i]! } }))));
    const sheet = sheetOf(fx, 'subject');
    const fact = sheet.measures.find((m) => m.id === 'three_putts_per_round')!;
    expect(fact.current.value).toBe(2.2);
    expect(fact.current.range95!.low).toBeCloseTo(0.454, 2);
    expect(fact.current.range95!.high).toBeCloseTo(3.946, 2);
    expect(fact.team).toMatchObject({ median: 1, mad: 0.1 });
    const r = findNotable(sheet);
    expect(r.candidates).toEqual([]);
    const quiet = r.unremarkable.find((u) => u.measure_id === 'three_putts_per_round')!;
    expect(quiet.tests).toHaveLength(1);
    expect(quiet.tests[0]!.rule).toBe('stands_out_in_team');
    expect(quiet.tests[0]!.p_value).toBeGreaterThan(0.0053);
    expect(quiet.tests[0]!.p_value).toBeLessThan(0.0182);
    // It would have passed the false discovery rate: only the player's own range held it back.
    expect(quiet.tests[0]!.q_value).toBeLessThanOrEqual(FALSE_DISCOVERY_RATE);
  });

  it('cannot judge against teammates who do not differ', () => {
    const fx = new TeamFixture();
    fx.player('subject', tenRounds(2, EVEN, () => ({ cache: { penalty_strokes: 4 } })));
    for (let k = 0; k < 7; k++) fx.player(`mate-${k}`, tenRounds(2, EVEN));
    const r = read(fx);
    expect(r.candidates).toEqual([]);
    expect(r.not_checked.find((x) => x.measure_id === 'penalty_strokes_per_round')?.why).toContain('the teammates do not differ');
  });

  it('puts a player who stands out for the better in the good news', () => {
    const fx = new TeamFixture();
    fx.player('subject', tenRounds(2, EVEN, () => ({ cache: { three_putts: 0 } })));
    // The subject's rounds are all 0: no spread of their own, so nothing to test. Give them one three-putt.
    fx.cache.find((c) => c.round_id === 'subject-00')!.three_putts = 1;
    [26, 28, 29, 30, 31, 32, 34].forEach((total, k) => fx.player(`mate-${k}`, tenRounds(2, EVEN, (i) => ({ cache: { three_putts: threePutts(total)[i]! } }))));
    const r = read(fx);
    expect(r.candidates).toEqual([]);
    expect(ids(r.good_news)).toEqual(['three_putts_per_round']);
    expect(r.good_news[0]!.reasons[0]).toMatchObject({ rule: 'stands_out_in_team', verdict: 'better' });
  });
});

describe('(c) biggest cost', () => {
  // Measured strokes gained over the last 10 rounds: off the tee -0.5, approach -3.0, around the green -0.5, putting -0.5.
  const costly: Legs = { tee: -0.5, approach: -3, around: -0.5, putting: -0.5 };
  const fx = new TeamFixture().player('subject', tenRounds(2, costly));
  const n = read(fx);

  it('raises the area the player loses most in, when it is clearly their worst', () => {
    expect(ids(n.candidates)).toEqual(['strokes_gained_approach']);
    const r = n.candidates[0]!.reasons[0]!;
    expect(r.rule).toBe('biggest_cost');
    expect(r.compared).toEqual({
      with: 'own_other_areas',
      player: { value: -3, attempts: 10, rounds: 10, window: 'last10' },
      against: { value: -0.5, attempts: 10, rounds: 10, window: 'last10' },
    });
    // Round by round, approach minus the mean of the other three: -2.5 plus
    //   -0.6667, 0.2667, 0.7, -0.4667, 0, 0.1667, -0.5667, 0.4333, 0.0333, 0.1   (zero-sum)
    // Sum of squares 1.7711, / 9 = 0.19679, sd 0.44361, se 0.14028.
    // The range is widened for choosing one area of four: two-sided level 0.05 / 4, so t(1 − 0.00625, 9) = 3.1109.
    // Half width 3.1109 × 0.14028 = 0.4364 → -2.9364 to -2.0636.
    expect(r.difference.value).toBe(-2.5);
    expect(r.difference.low).toBeCloseTo(-2.9364, 3);
    expect(r.difference.high).toBeCloseTo(-2.0636, 3);
    expect(r.difference.level).toBe(0.9875);
    expect(r.test.p_value).toBeLessThan(1e-6);
    // What it costs beyond the player's own other areas: 2.5 strokes a round.
    expect(n.candidates[0]!.strokes_at_stake).toMatchObject({ per_round: 2.5, basis: 'strokes' });
    expect(n.candidates[0]!.strokes_at_stake!.low).toBeCloseTo(2.0636, 3);
    expect(n.candidates[0]!.questions).toEqual([{ ask: 'strokes_gained_by_shot_distance', area: 'approach' }, { ask: 'misses_by_side' }, { ask: 'by_lie_before' }]);
  });

  it('does not fire for a player who is evenly below the Tour in every area', () => {
    // Every area at -2.0: a real loss everywhere, and no area worse than the others.
    const even = read(new TeamFixture().player('subject', tenRounds(2, { tee: -2, approach: -2, around: -2, putting: -2 })));
    expect(even.candidates).toEqual([]);
  });

  it('does not fire when the worst area is not a loss', () => {
    // The player gains strokes everywhere; approach is merely the smallest gain.
    const strong = read(new TeamFixture().player('subject', tenRounds(2, { tee: 2, approach: 0.5, around: 2, putting: 2 })));
    expect(ids(strong.candidates)).not.toContain('strokes_gained_approach');
    expect(strong.candidates).toEqual([]);
  });

  it('does not fire when the gap between areas is inside the round-to-round noise', () => {
    // Approach averages 0.2 worse than the rest; the paired spread (sd 0.44, se 0.14, widened range ±0.44) covers that.
    const close = read(new TeamFixture().player('subject', tenRounds(2, { tee: -1, approach: -1.2, around: -1, putting: -1 })));
    expect(close.candidates).toEqual([]);
  });

  it('needs five rounds with shots logged', () => {
    const four = read(new TeamFixture().player('subject', tenRounds(2, costly).slice(0, 4)));
    expect(four.candidates).toEqual([]);
  });
});

describe('the regression: below the Tour on everything, unchanged, typical for the team', () => {
  // Every round the same shape, in both windows, for every player: far below the Tour on every measure the Tour has
  // a figure for. Today's engine gives this player a card for each. There is nothing unusual about them.
  const ordinary = (i: number): Partial<RoundSpec> => ({
    score: 77,
    holeOne: 1,
    cache: { double_bogeys: 1, sand_attempts: 2, sand_saves: 0 },
    putts: [[4, i % 2 === 0], [4, i % 2 === 1], [7, false], [8, i % 3 === 0], [9, false], [12, false], [13, false], [20, false], [30, false]],
    approaches: [[100, 35, true], [100, 45, false], [150, 45, true], [150, 65, false], [190, 60, true], [190, 90, false], [190, 95, false]],
  });
  const practice: RoundSpec[] = [3, 13, 23, 33].map((d) => ({ date: daysAgo(d), score: 71, type: 'practice' }));
  const fx = new TeamFixture();
  const offsets = [0, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.05];
  // Players differ in level (the offsets), not in shape: every area is the same distance below the Tour.
  offsets.forEach((o, k) => {
    const legs: Legs = { tee: -1 + o, approach: -1 + o, around: -1 + o, putting: -1 + o };
    fx.player(k === 0 ? 'subject' : `mate-${k}`, [...twoWindows(legs, legs, (i) => ordinary(i)), ...practice]);
  });
  const sheet = sheetOf(fx, 'subject');
  const n = findNotable(sheet);

  it('really is below the Tour on every measure the Tour has a figure for', () => {
    const withTour = sheet.measures.filter((m) => m.tour && m.current.value != null);
    expect(withTour.length).toBeGreaterThanOrEqual(22);
    for (const m of withTour) {
      const worse = m.direction === 'higher_is_better' ? m.current.value! < m.tour!.value : m.current.value! > m.tour!.value;
      expect(worse, `${m.id}: ${m.current.value} against the Tour's ${m.tour!.value}`).toBe(true);
    }
  });

  it('produces ZERO candidates', () => {
    expect(n.candidates).toEqual([]);
    expect(n.beyond_cap).toEqual([]);
    expect(n.outcome_context).toEqual([]);
    expect(n.good_news).toEqual([]);
    expect(n.tests.supported).toBe(0);
    // And it did look: the tests ran.
    expect(n.tests.run).toBeGreaterThan(20);
    expect(ids(n.unremarkable)).toEqual(expect.arrayContaining(['strokes_gained_approach', 'putts_made_5_10', 'approach_green_hit_125_175', 'greens_in_regulation']));
  });

  it('is the same for every player on the team: no shared card', () => {
    for (const s of assembleFactSheets(fx.rows())) expect(findNotable(s).candidates, s.player_id).toEqual([]);
  });

  it('never reads a Tour figure to make a candidate: removing them changes nothing', () => {
    const noTour = findNotable({ ...sheet, measures: sheet.measures.map((m) => ({ ...m, tour: null })) });
    expect(noTour).toEqual(n);
    const absurdTour = findNotable({ ...sheet, measures: sheet.measures.map((m) => (m.tour ? { ...m, tour: { ...m.tour, value: m.direction === 'higher_is_better' ? 1e6 : -1e6 } } : m)) });
    expect(absurdTour).toEqual(n);
  });
});

describe('thin samples', () => {
  it('judges nothing from four rounds, however extreme', () => {
    const fx = new TeamFixture();
    fx.player('subject', tenRounds(2, { tee: -1, approach: -7, around: -1, putting: -1 }, () => ({ cache: { three_putts: 6 } })).slice(0, 4));
    [6, 8, 9, 10, 11, 12, 14].forEach((total, k) => fx.player(`mate-${k}`, tenRounds(2, EVEN, (i) => ({ cache: { three_putts: threePutts(total)[i]! } }))));
    const n = read(fx);
    expect(n.candidates).toEqual([]);
    expect(n.good_news).toEqual([]);
    expect(n.tests.run).toBe(0);
    const why = n.not_checked.find((x) => x.measure_id === 'three_putts_per_round')!.why;
    expect(why).toContain('no previous window');
    expect(why).toContain('needs 5 rounds behind the figure');
  });

  it('does not test a window that rests on fewer than five rounds', () => {
    // Twelve rounds: the previous window is two rounds, under the three a previous window needs.
    const fx = new TeamFixture().player('subject', twoWindows(EVEN, { ...EVEN, putting: 3 }).slice(0, 12));
    expect(read(fx).candidates).toEqual([]);
    // Fourteen rounds: a previous window of four, still under five behind each figure.
    const fx14 = new TeamFixture().player('subject', twoWindows(EVEN, { ...EVEN, putting: 3 }).slice(0, 14));
    const n = read(fx14);
    expect(n.candidates).toEqual([]);
    expect(n.not_checked.find((x) => x.measure_id === 'strokes_gained_putting')?.why).toContain('needs 5 rounds behind the figure in both windows');
  });
});

describe('strokes gained estimated from the scorecard', () => {
  // No shots logged in any round. The stored estimates say approach fell from 0 to -4 and is by far the worst area.
  const fx = new TeamFixture().player(
    'subject',
    twoWindows({ tee: 0, approach: -4, around: 0, putting: 0 }, { tee: 0, approach: 0, around: 0, putting: 0 }, () => ({ shots: false })),
  );
  const n = read(fx);

  it('is never judged: no change, no outlier, no biggest cost from an estimate', () => {
    expect(n.candidates).toEqual([]);
    expect(n.good_news).toEqual([]);
    expect(n.outcome_context).toEqual([]);
    const estimated = n.not_checked.filter((x) => x.measure_id.endsWith('_estimated'));
    expect(estimated).toHaveLength(5);
    for (const e of estimated) expect(e.why).toBe('estimated from the scorecard, not on the Tour scale: never judged');
  });

  it('says the measured figures are missing and what they need', () => {
    expect(n.not_checked.find((x) => x.measure_id === 'strokes_gained_approach')?.why).toBe('needs 3 rounds with shots logged; none so far');
  });

  it('still judges what the scorecard does measure', () => {
    // Greens in regulation fell from 12 of 18 to 6 of 18 a round: a counted figure, not an estimate.
    const f = new TeamFixture().player(
      'subject',
      twoWindows(EVEN, EVEN, (_i, w) => ({ shots: false, cache: { greens_hit: w === 'last' ? 6 : 12 } })),
    );
    const r = read(f);
    expect(ids(r.candidates)).toEqual(['greens_in_regulation']);
    // 60 of 180 against 120 of 180: -33.3 points x 18 greens x the reference cost of a missed green.
    expect(r.candidates[0]!.strokes_at_stake).toMatchObject({ basis: 'reference_cost' });
    expect(r.candidates[0]!.strokes_at_stake!.per_round).toBeCloseTo(18 * (1 / 3) * (2.59 - 1.98), 2);
  });
});

describe('a women\'s team', () => {
  it('gets no candidate from sitting below a Tour figure, and has no approach anchor to sit below', () => {
    const fx = new TeamFixture({ gender: 'womens' });
    const round = (): Partial<RoundSpec> => ({ approaches: [[150, 60, false], [150, 70, false], [150, 30, true]], putts: [[7, false], [8, false], [9, true]] });
    fx.player('subject', twoWindows(EVEN, EVEN, round));
    for (let k = 0; k < 6; k++) fx.player(`mate-${k}`, twoWindows(EVEN, EVEN, round));
    const sheet = sheetOf(fx, 'subject');
    expect(sheet.measures.find((m) => m.id === 'approach_green_hit_125_175')).toMatchObject({ tour: null, current: { value: expect.closeTo(33.3333, 3) } });
    expect(findNotable(sheet).candidates).toEqual([]);
  });

  it('is judged by the same rules: a change is a change', () => {
    const fx = new TeamFixture({ gender: 'womens' }).player('subject', twoWindows(EVEN, { ...EVEN, around: 1 }));
    expect(ids(read(fx).candidates)).toEqual(['strokes_gained_around_the_green']);
  });
});

describe('ranking, the cap and one candidate per area', () => {
  // Every area fell against the previous 10: approach by 2.0, putting by 1.5, around the green by 1.0, off the tee by 0.5.
  // Putts from 5 to 10 feet fell too (24 of 30 → 15 of 30): the same problem as putting, seen a second way.
  const putts = (made: number, i: number) => [[7, i * 3 < made], [8, i * 3 + 1 < made], [9, i * 3 + 2 < made]] as const;
  const fx = new TeamFixture().player(
    'subject',
    twoWindows({ tee: -1.5, approach: -3, around: -2, putting: -2.5 }, EVEN, (i, w) => ({ putts: putts(w === 'last' ? 15 : 24, i) })),
  );
  const n = read(fx);

  it('returns at most three, most strokes at stake first', () => {
    expect(n.candidates).toHaveLength(MAX_CANDIDATES);
    expect(ids(n.candidates)).toEqual(['strokes_gained_approach', 'strokes_gained_putting', 'strokes_gained_around_the_green']);
    expect(n.candidates.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(n.candidates.map((c) => c.strokes_at_stake!.per_round)).toEqual([2, 1.5, 1]);
  });

  it('keeps what qualified past the cap in its own list', () => {
    expect(ids(n.beyond_cap)).toEqual(['strokes_gained_off_the_tee']);
  });

  it('raises one candidate per area and attaches the second view of it', () => {
    const putting = n.candidates.find((c) => c.measure_id === 'strokes_gained_putting')!;
    expect(ids(putting.supporting)).toEqual(['putts_made_5_10']);
    expect(new Set(n.candidates.map((c) => c.area)).size).toBe(3);
  });

  it('folds the round total into context', () => {
    expect(ids(n.outcome_context)).toEqual(['strokes_gained_total']);
  });

  it('lets the round total stand when no part explains it', () => {
    // Scoring rose four strokes on rounds posted as totals only: there is no hole or shot to say where.
    const f = new TeamFixture().player(
      'subject',
      twoWindows(EVEN, EVEN, (i, w) => ({ totalOnly: true, sg: null, score: (w === 'last' ? 78 : 74) + (i % 3) - 1 })),
    );
    const r = read(f);
    expect(ids(r.candidates)).toEqual(['scoring_average']);
    expect(r.outcome_context).toEqual([]);
    expect(r.candidates[0]!.questions[0]).toEqual({ ask: 'strokes_gained_by_area' });
    expect(r.candidates[0]!.strokes_at_stake!.per_round).toBe(4);
  });

  it('names the part when the holes show where the strokes went', () => {
    // The same four strokes with the holes scored: scoring by par moved, so that is the candidate and the average is its context.
    const f = new TeamFixture().player(
      'subject',
      twoWindows(EVEN, EVEN, (i, w) => ({ sg: null, score: (w === 'last' ? 78 : 74) + (i % 3) - 1 })),
    );
    const r = read(f);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.measure_id).toMatch(/^par_[345]_scoring$/);
    expect(r.candidates[0]!.area).toBe('scoring');
    expect(ids(r.outcome_context)).toEqual(['scoring_average']);
  });

  it('is the same whatever order the measures arrive in', () => {
    const sheet = sheetOf(fx, 'subject');
    const reversed = findNotable({ ...sheet, measures: [...sheet.measures].reverse() });
    expect(ids(reversed.candidates)).toEqual(ids(n.candidates));
    expect(reversed.candidates.map((c) => c.strokes_at_stake)).toEqual(n.candidates.map((c) => c.strokes_at_stake));
  });
});

describe('many measures', () => {
  it('holds every test to the false discovery rate across the player\'s run', () => {
    // 30 putts each window in five bands. One band differs by a margin that clears 0.05 alone (p about 0.015)
    // among dozens of tests that show nothing: Benjamini-Hochberg does not let it through on its own.
    const putts = (made: number, i: number) => [[7, i * 3 < made], [8, i * 3 + 1 < made], [9, i * 3 + 2 < made]] as const;
    const noise = (i: number): Partial<RoundSpec> => ({
      approaches: [[100, 35, i % 2 === 0], [100, 45, i % 2 === 1], [150, 45, i % 2 === 0], [150, 65, i % 3 === 0], [190, 60, true], [190, 90, false]],
      cache: { greens_hit: 8 + (i % 3), fairways_hit: 6 + (i % 3), scrambles_converted: 3 + (i % 3), three_putts: i % 3, penalty_strokes: i % 2, total_putts: 30 + (i % 4) },
    });
    const fx = new TeamFixture();
    fx.player('subject', twoWindows(EVEN, EVEN, (i, w) => ({ ...noise(i), putts: putts(w === 'last' ? 15 : 24, i) })));
    const offsets = [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3];
    offsets.forEach((o, k) => fx.player(`mate-${k}`, twoWindows({ tee: -1 + o, approach: -1 - o, around: -1 + o, putting: -1 - o }, EVEN, (i) => ({ ...noise(i + k), putts: putts(18 + k, i) }))));
    const n = read(fx);
    const band = n.unremarkable.find((u) => u.measure_id === 'putts_made_5_10');
    expect(band).toBeDefined();
    const changed = band!.tests.find((t) => t.rule === 'changed')!;
    // On its own it clears 0.05 ...
    expect(changed.p_value).toBeLessThan(ALPHA);
    // ... but not once every test run for the player is counted.
    expect(changed.q_value).toBeGreaterThan(FALSE_DISCOVERY_RATE);
    expect(n.tests.run).toBeGreaterThan(20);
    expect(ids(n.candidates)).not.toContain('putts_made_5_10');
  });
});

describe('strokes at stake', () => {
  const fx = new TeamFixture().player('subject', tenRounds(2, EVEN, () => ({ putts: [[7, true], [8, false], [9, true]], approaches: [[150, 30, true], [150, 60, false]] })));
  const sheet = sheetOf(fx, 'subject');
  const scale = (id: string) => strokeScale(sheet.measures.find((m) => m.id === id)!);

  it('sizes a rate from the player\'s own attempts per round and a stated cost per event', () => {
    // 30 putts in the band over 10 rounds: 3 a round x 1 stroke, per point of make rate.
    expect(scale('putts_made_5_10')).toMatchObject({ factor: 0.03, basis: 'floor_per_event' });
    // 20 approaches over 10 rounds: 2 a round x 0.61 strokes per missed green.
    expect(scale('approach_green_hit_125_175')!.factor).toBeCloseTo((2 * 0.61) / 100, 5);
    expect(scale('greens_in_regulation')!.factor).toBeCloseTo((18 * 0.61) / 100, 5);
    expect(scale('big_numbers')).toMatchObject({ factor: 0.18, basis: 'floor_per_event' });
    // Four par 3s a round.
    expect(scale('par_3_scoring')).toMatchObject({ factor: 4, basis: 'strokes' });
    expect(scale('strokes_gained_approach')).toMatchObject({ factor: 1, basis: 'strokes' });
    expect(scale('scoring_average')).toMatchObject({ factor: 1 });
  });

  it('invents no size where the repo has no sound cost', () => {
    expect(scale('fairways_hit')).toBeNull();
    expect(scale('approach_proximity_125_175')).toBeNull();
  });
});

describe('questionsFor', () => {
  const sheet = sheetOf(new TeamFixture().player('subject', tenRounds(2, EVEN)), 'subject');
  const q = (id: string, rules: Parameters<typeof questionsFor>[1] = []) => questionsFor(sheet.measures.find((m) => m.id === id)!, rules);

  it('names the band the measure covers', () => {
    expect(q('approach_green_hit_125_175')).toEqual([{ ask: 'misses_by_side', band: '125_175' }, { ask: 'misses_by_length', band: '125_175' }, { ask: 'by_lie_before', band: '125_175' }]);
    expect(q('approach_proximity_175_plus')[0]).toEqual({ ask: 'misses_by_side', band: '175_plus' });
    expect(q('par_5_scoring')[0]).toEqual({ ask: 'by_hole_par', par: 5 });
  });

  it('gives every measure at least one question, and only data', () => {
    for (const m of sheet.measures) {
      const list = questionsFor(m, ['changed', 'stands_out_in_team', 'biggest_cost']);
      expect(list.length, m.id).toBeGreaterThan(0);
      for (const item of list) expect(Object.keys(item).every((k) => ['ask', 'band', 'area', 'par', 'windows'].includes(k))).toBe(true);
    }
  });
});
