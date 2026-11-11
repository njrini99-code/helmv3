import { describe, expect, it } from 'vitest';
import { assembleFactSheets, buildFactSheet, buildTeamFactSheets } from '../fact-sheet';
import { withoutCoachOnly, type FactSheet, type MeasureFact } from '../types';
import { EVEN, NOW, TEAM_ID, TeamFixture, daysAgo, tenRounds, type RoundSpec } from './fixtures';

const measure = (sheet: FactSheet, id: string): MeasureFact => {
  const m = sheet.measures.find((x) => x.id === id);
  if (!m) throw new Error(`no measure ${id}`);
  return m;
};
const sheetOf = (fx: TeamFixture, playerId: string): FactSheet => assembleFactSheets(fx.rows()).find((s) => s.player_id === playerId)!;

describe('windows', () => {
  const rounds: RoundSpec[] = Array.from({ length: 23 }, (_, i) => ({ date: daysAgo(3 + i * 7), score: 70 + (i % 5) }));
  const fx = new TeamFixture().player('p1', rounds);
  const sheet = sheetOf(fx, 'p1');

  it('names each window with its rounds and dates', () => {
    expect(sheet.as_of).toBe('2026-11-10');
    expect(sheet.season_start).toBe('2026-08-01');
    expect(sheet.windows.last10).toMatchObject({ key: 'last10', label: 'Last 10 rounds', rounds: 10, from: daysAgo(3 + 9 * 7), to: daysAgo(3) });
    expect(sheet.windows.previous10).toMatchObject({ key: 'previous10', label: 'The 10 rounds before those', rounds: 10, from: daysAgo(3 + 19 * 7), to: daysAgo(3 + 10 * 7) });
    // Rounds 3, 10, 17 ... days back: 15 of them fall on or after 1 August 2026 (101 days back).
    expect(sheet.windows.season).toMatchObject({ key: 'season', label: 'This season', rounds: 15 });
    expect(sheet.windows.last10.round_ids[0]).toBe('p1-00');
  });

  it('carries the window on every figure, never "all time"', () => {
    for (const m of sheet.measures) {
      expect(m.current.window.key).toBe('last10');
      expect(m.previous?.window.key).toBe('previous10');
      expect(m.season.window.key).toBe('season');
    }
    // Scores 70,71,72,73,74 repeating: the newest ten average 72, and so do the ten before.
    expect(measure(sheet, 'scoring_average').current).toMatchObject({ value: 72, sample: { attempts: 10, unit: 'rounds', rounds: 10 } });
    expect(measure(sheet, 'scoring_average').previous).toMatchObject({ value: 72, sample: { attempts: 10 } });
  });

  it('has no previous window under three earlier rounds', () => {
    const short = sheetOf(new TeamFixture().player('p1', rounds.slice(0, 12)), 'p1');
    expect(short.windows.previous10).toBeNull();
    expect(measure(short, 'scoring_average').previous).toBeNull();
    expect(short.notes.join(' ')).toContain('no previous window');
  });

  it('leaves practice rounds, nine-hole rounds and implausible rounds out of the figures', () => {
    const mixed = new TeamFixture().player('p1', [
      { date: daysAgo(1), score: 60, type: 'practice' },
      { date: daysAgo(2), score: 74 },
      { date: daysAgo(3), score: 76, type: null },
      { date: daysAgo(4), score: 78, type: 'qualifying' },
    ]);
    mixed.rounds.push({ ...mixed.rounds[1]!, id: 'p1-nine', holes_played: 9, total_score: 36, front_nine: 36, back_nine: null, round_date: daysAgo(5) });
    mixed.rounds.push({ ...mixed.rounds[1]!, id: 'p1-fake', total_score: 37, front_nine: 18, back_nine: 19, round_date: daysAgo(6) });
    const s = sheetOf(mixed, 'p1');
    // 74, 76 and 78 count: a round with no type counts, practice does not.
    expect(s.windows.last10.round_ids).toEqual(['p1-01', 'p1-02', 'p1-03']);
    expect(measure(s, 'scoring_average').current.value).toBe(76);
  });
});

describe('a mean per round', () => {
  // Approach strokes gained over ten measured rounds: -2.5,-1.5,-2,-2.5,-1.5,-2,-2.5,-1.5,-2,-2.
  const approach = [-2.5, -1.5, -2, -2.5, -1.5, -2, -2.5, -1.5, -2, -2];
  const fx = new TeamFixture().player(
    'p1',
    approach.map((a, i) => ({ date: daysAgo(2 + i * 5), sg: { tee: 0, approach: a, around: 0, putting: 0 } })),
  );
  const m = measure(sheetOf(fx, 'p1'), 'strokes_gained_approach');

  it('is the mean of the stored round figures with its t range', () => {
    // Mean -2.0. Deviations ±0.5 six times, 0 four times: sum of squares 1.5, / 9 = 0.16667, sd 0.40825.
    // se = 0.40825 / √10 = 0.12910. t(0.975, 9) = 2.2622 → half width 0.29205 → -2.2920 to -1.7080.
    expect(m.current.value).toBe(-2);
    expect(m.current.range95).toEqual({ low: -2.292, high: -1.708, method: 't' });
    expect(m.current.sample).toEqual({ attempts: 10, unit: 'rounds', rounds: 10 });
    expect(m.current.stat).toMatchObject({ kind: 'mean', n: 10, df: 9 });
    expect((m.current.stat as { se: number }).se).toBeCloseTo(0.1291, 4);
  });

  it('says what it is in full words, with its unit, direction and Tour figure', () => {
    expect(m).toMatchObject({
      label: 'Strokes gained per round, approach shots',
      unit: 'strokes_per_round',
      direction: 'higher_is_better',
      area: 'approach',
      basis: 'logged_shots',
      estimated: false,
      tour: { value: 0, tour: 'pga', provenance: 'by_definition' },
    });
  });

  it('uses no shorthand in any label', () => {
    for (const x of sheetOf(fx, 'p1').measures) expect(x.label).not.toMatch(/\bSG\b|\bGIR\b|\bft\b|\byd\b|\bFIR\b/);
  });
});

describe('a rate', () => {
  it('pools the chances and carries the Wilson range', () => {
    // Ten rounds, two putts from 6 to 9 feet each: 12 made of 20.
    const made = [true, true, true, false, true, false, true, false, true, false];
    const fx = new TeamFixture().player(
      'p1',
      made.map((first, i) => ({ date: daysAgo(2 + i * 5), putts: [[7, first], [9, i < 6]] as const })),
    );
    const m = measure(sheetOf(fx, 'p1'), 'putts_made_5_10');
    // 6 + 6 = 12 of 20 = 60%. Wilson, z = 1.959964: z² = 3.84146; denominator 1 + z²/20 = 1.19207;
    // centre (0.6 + z²/40) / 1.19207 = 0.69604 / 1.19207 = 0.58389;
    // half = 1.959964 × √(0.6×0.4/20 + z²/1600) / 1.19207 = 1.959964 × 0.120004 / 1.19207 = 0.19731 → 38.66% to 78.12%.
    expect(m.current.value).toBe(60);
    expect(m.current.range95!.low).toBeCloseTo(38.66, 1);
    expect(m.current.range95!.high).toBeCloseTo(78.12, 1);
    expect(m.current.range95!.method).toBe('wilson');
    expect(m.current.sample).toEqual({ attempts: 20, unit: 'putts', rounds: 10 });
    expect(m.current.stat).toEqual({ kind: 'proportion', successes: 12, attempts: 20 });
    expect(m.tour).toMatchObject({ value: 62.2, tour: 'pga', provenance: 'measured' });
    expect(m.label).toBe('Putts made from 5 to 10 feet');
  });

  it('puts a putt on the band edge in the lower band, as the one make-rate definition does', () => {
    const fx = new TeamFixture().player(
      'p1',
      Array.from({ length: 10 }, (_, i) => ({ date: daysAgo(2 + i * 5), putts: [[5, true], [10, false]] as const })),
    );
    const s = sheetOf(fx, 'p1');
    expect(measure(s, 'putts_made_3_5').current.stat).toEqual({ kind: 'proportion', successes: 10, attempts: 10 });
    expect(measure(s, 'putts_made_5_10').current.stat).toEqual({ kind: 'proportion', successes: 0, attempts: 10 });
    expect(measure(s, 'putts_made_10_15').current.sample.attempts).toBe(0);
  });

  it('pools greens over the rounds, never a mean of percentages', () => {
    const fx = new TeamFixture().player('p1', [
      { date: daysAgo(1), cache: { greens_hit: 18, greens_total: 18 } },
      { date: daysAgo(2), cache: { greens_hit: 3, greens_total: 9 } },
    ]);
    // 21 of 27 = 77.78%, not (100% + 33.3%) / 2 = 66.7%.
    const m = measure(sheetOf(fx, 'p1'), 'greens_in_regulation');
    expect(m.current.value).toBeCloseTo(77.7778, 4);
    expect(m.current.stat).toEqual({ kind: 'proportion', successes: 21, attempts: 27 });
    expect(m.tour).toMatchObject({ value: 66, provenance: 'measured' });
  });
});

describe('thin samples', () => {
  const fx = new TeamFixture().player('p1', [
    { date: daysAgo(1), putts: [[7, true], [8, false], [9, true]], cache: { sand_attempts: 1, sand_saves: 1 }, approaches: [[150, 20, true]] },
    { date: daysAgo(2), putts: [[7, true], [8, false], [9, true]], cache: { sand_attempts: 1, sand_saves: 1 } },
  ]);
  const s = sheetOf(fx, 'p1');

  it('withholds a figure under the floor the Stats screen uses, and says what it needs', () => {
    // Six putts in the band: the screen needs ten.
    expect(measure(s, 'putts_made_5_10').current).toMatchObject({ value: null, range95: null, stat: null, sample: { attempts: 6, rounds: 2 }, withheld: 'needs 10 putts in the band; 6 so far' });
    // "100% sand saves" from two bunker shots is not a rate.
    expect(measure(s, 'sand_saves').current).toMatchObject({ value: null, sample: { attempts: 2 }, withheld: 'needs 10 bunker chances; 2 so far' });
    // Two rounds with shots: strokes gained needs three.
    expect(measure(s, 'strokes_gained_putting').current).toMatchObject({ value: null, withheld: 'needs 3 rounds with shots logged; 2 so far' });
    expect(measure(s, 'approach_proximity_125_175').current).toMatchObject({ value: null, sample: { attempts: 1, unit: 'approach_shots', rounds: 1 } });
    expect(measure(s, 'opening_hole').current.withheld).toBe('needs 5 rounds scored hole by hole; 2 so far');
    expect(measure(s, 'pressure_gap').current.withheld).toBe('needs 3 tournament or qualifier rounds and 3 practice rounds; 2 and 0 so far');
  });

  it('still shows what the screen shows from two rounds', () => {
    expect(measure(s, 'greens_in_regulation').current.value).toBe(50);
    expect(measure(s, 'scoring_average').current.value).toBe(74);
  });

  it('gives a mean of one round a value and no range', () => {
    const one = sheetOf(new TeamFixture().player('p1', [{ date: daysAgo(1), score: 79 }]), 'p1');
    expect(measure(one, 'scoring_average').current).toMatchObject({ value: 79, range95: null });
  });
});

describe('measured and estimated strokes gained', () => {
  const measured = (i: number): RoundSpec => ({ date: daysAgo(1 + i), sg: { tee: -0.5, approach: -0.5, around: -0.5, putting: -0.5 } });
  const estimated = (i: number): RoundSpec => ({ date: daysAgo(20 + i), shots: false, sg: { tee: 0.25, approach: 0.25, around: 0.25, putting: 0.25 } });
  const fx = new TeamFixture().player('p1', [...Array.from({ length: 6 }, (_, i) => measured(i)), ...Array.from({ length: 4 }, (_, i) => estimated(i))]);
  const s = sheetOf(fx, 'p1');

  it('keeps them apart and never blends them', () => {
    // Six rounds with shots at -2.0 in total; four with none at +1.0.
    expect(measure(s, 'strokes_gained_total').current).toMatchObject({ value: -2, sample: { attempts: 6, rounds: 6 } });
    expect(measure(s, 'strokes_gained_total')).toMatchObject({ basis: 'logged_shots', estimated: false });
    expect(measure(s, 'strokes_gained_total_estimated').current).toMatchObject({ value: 1, sample: { attempts: 4, rounds: 4 } });
    expect(measure(s, 'strokes_gained_total_estimated')).toMatchObject({ basis: 'scorecard_estimate', estimated: true, tour: null });
    expect(measure(s, 'strokes_gained_total_estimated').label).toContain('estimated from the scorecard');
  });

  it('keeps the blended figure the Stats screen prints, marked as blended', () => {
    // (6 × -2 + 4 × 1) / 10 = -0.8: what the screen shows for the ten rounds.
    expect(measure(s, 'strokes_gained_total').screen).toEqual({ value: -0.8, rounds: 10, blended: true });
    expect(measure(s, 'scoring_average').screen).toBeUndefined();
  });

  it('marks each round and says so in the notes', () => {
    expect(s.strokes_gained_by_round.map((r) => r.measured)).toEqual([true, true, true, true, true, true, false, false, false, false]);
    expect(s.notes.join(' ')).toContain('4 of the last 10 rounds have no shots logged');
  });

  it('reads a round with only unusable shot rows as estimated', () => {
    const odd = new TeamFixture().player('p1', Array.from({ length: 3 }, (_, i) => measured(i)));
    // A shot with no start distance cannot be valued, so the database estimates the round.
    for (const shot of odd.shots) shot.distance_to_hole_before = null;
    const o = sheetOf(odd, 'p1');
    expect(measure(o, 'strokes_gained_total').current.value).toBeNull();
    expect(measure(o, 'strokes_gained_total_estimated').current.value).toBe(-2);
  });

  it('counts a round posted as a total only in scores and in nothing hole by hole', () => {
    const t = new TeamFixture().player('p1', [{ date: daysAgo(1), score: 80, totalOnly: true, sg: null }, { date: daysAgo(2), score: 74 }, { date: daysAgo(3), score: 74 }]);
    const o = sheetOf(t, 'p1');
    expect(measure(o, 'scoring_average').current).toMatchObject({ value: 76, sample: { attempts: 3 } });
    expect(measure(o, 'greens_in_regulation').current.sample.rounds).toBe(2);
    expect(o.notes.join(' ')).toContain('1 of the last 3 rounds were posted as a total only');
  });
});

describe('approach bands', () => {
  // Twelve approaches from 150 yards over six rounds: eight on the green at 20 feet, four missed at 60 feet.
  const fx = new TeamFixture().player(
    'p1',
    Array.from({ length: 6 }, (_, i) => ({ date: daysAgo(1 + i), approaches: i < 4 ? ([[150, 20, true], [150, 60, false]] as const) : ([[150, 20, true], [150, 20, true]] as const) })),
  );
  const s = sheetOf(fx, 'p1');

  it('averages every approach, misses included, through the production aggregator', () => {
    // (8 × 20 + 4 × 60) / 12 = 33.3 feet (the aggregator keeps one decimal).
    const prox = measure(s, 'approach_proximity_125_175');
    expect(prox.current.value).toBe(33.3);
    expect(prox.current.sample).toEqual({ attempts: 12, unit: 'approach_shots', rounds: 6 });
    // sd: deviations 8 × (-13.33)² + 4 × (26.67)² = 1422.2 + 2844.4 = 4266.7, / 11 = 387.9, sd 19.69; se 5.685.
    // t(0.975, 11) = 2.201 → half width 12.51 → 20.8 to 45.8.
    expect(prox.current.range95).toEqual({ low: 20.8, high: 45.8, method: 't' });
    expect((prox.current.stat as { se: number }).se).toBeCloseTo(5.685, 1);
    expect(prox.tour).toMatchObject({ value: 30, provenance: 'measured' });
    expect(prox.label).toBe('Average distance from the hole after an approach from 125 to 175 yards');
  });

  it('counts the same shots for the green-hit rate, with an approximate Tour anchor for a men\'s team', () => {
    const hit = measure(s, 'approach_green_hit_125_175');
    // 8 of 12 = 66.7%.
    expect(hit.current.stat).toEqual({ kind: 'proportion', successes: 8, attempts: 12 });
    expect(hit.current.value).toBeCloseTo(66.6667, 4);
    expect(hit.tour).toMatchObject({ value: 65, tour: 'pga', provenance: 'approximate' });
  });
});

describe('a women\'s team', () => {
  const fx = new TeamFixture({ gender: 'womens' }).player(
    'p1',
    Array.from({ length: 6 }, (_, i) => ({ date: daysAgo(1 + i), approaches: [[150, 20, true], [150, 60, false]] as const, putts: [[7, true], [8, false]] as const })),
  );
  const s = sheetOf(fx, 'p1');

  it('is set against the LPGA figures and the scaled baseline', () => {
    expect(s.tour).toBe('lpga');
    expect(s.strokes_gained_baseline).toBe('womens');
    expect(measure(s, 'greens_in_regulation').tour).toMatchObject({ value: 70, tour: 'lpga' });
    expect(measure(s, 'putts_made_5_10').tour).toMatchObject({ value: 55, tour: 'lpga' });
    expect(measure(s, 'approach_proximity_125_175').tour).toMatchObject({ value: 38, tour: 'lpga' });
  });

  it('has no approach green-hit anchor, and never borrows the men\'s', () => {
    for (const band of ['50_125', '125_175', '175_plus']) expect(measure(s, `approach_green_hit_${band}`).tour).toBeNull();
    // The measure itself is still there.
    expect(measure(s, 'approach_green_hit_125_175').current.value).toBe(50);
    // A metric the LPGA rows do not carry has no Tour figure rather than the men's.
    expect(measure(s, 'putts_made_3_5').tour).toBeNull();
    expect(measure(s, 'par_4_scoring').tour).toBeNull();
  });
});

describe('Tour provenance', () => {
  const s = sheetOf(new TeamFixture().player('p1', [{ date: daysAgo(1) }]), 'p1');

  it('marks the standards rows whose own source is an estimate', () => {
    for (const id of ['big_numbers', 'penalty_strokes_per_round', 'pressure_gap', 'opening_hole']) expect(measure(s, id).tour?.provenance).toBe('approximate');
    for (const id of ['greens_in_regulation', 'par_3_scoring', 'sand_saves', 'putts_made_10_15']) expect(measure(s, id).tour?.provenance).toBe('measured');
    expect(measure(s, 'big_numbers').tour?.source).toContain('golf_pga_standards big_number_rate (pga)');
  });

  it('has no Tour figure where the Tour publishes none', () => {
    for (const id of ['scoring_average', 'fairways_hit', 'scrambling', 'putts_per_round', 'three_putts_per_round']) expect(measure(s, id).tour).toBeNull();
  });
});

describe('scorecard figures', () => {
  it('reads par scoring, big numbers, the opening hole and the pressure gap as the Stats screen does', () => {
    // Five tournament rounds of 76 with a bogey on hole 1, five practice rounds of 72.
    const fx = new TeamFixture().player('p1', [
      ...Array.from({ length: 5 }, (_, i) => ({ date: daysAgo(1 + i * 2), score: 76, holeOne: 1 })),
      ...Array.from({ length: 5 }, (_, i) => ({ date: daysAgo(2 + i * 2), score: 72, type: 'practice' })),
    ]);
    const s = sheetOf(fx, 'p1');
    // Practice is out of the figures: five rounds of 76.
    expect(measure(s, 'scoring_average').current).toMatchObject({ value: 76, sample: { attempts: 5 } });
    // 76 = bogeys on holes 1, 2, 3 and 4 (pars 4, 4, 3, 5): the four par 3s score 4,3,3,3 → 3.25; the par 5s 6,5,5,5 → 5.25.
    expect(measure(s, 'par_3_scoring').current).toMatchObject({ value: 3.25, sample: { attempts: 20, unit: 'holes', rounds: 5 } });
    expect(measure(s, 'par_5_scoring').current.value).toBe(5.25);
    expect(measure(s, 'par_4_scoring').current.value).toBe(4.2);
    // No doubles: 0 of 90 holes.
    expect(measure(s, 'big_numbers').current).toMatchObject({ value: 0, stat: { kind: 'proportion', successes: 0, attempts: 90 } });
    // Hole 1 is +1 every round; the other 17 holes are +3 in all: 1 − 3/17 = 0.8235 strokes a hole.
    expect(measure(s, 'opening_hole').current.value).toBeCloseTo(0.8235, 4);
    // The pressure gap keeps practice: +4 in competition against level par in practice. Identical rounds have no spread, so no range.
    const gap = measure(s, 'pressure_gap');
    expect(gap.current).toMatchObject({ value: 4, range95: null, sample: { attempts: 10, rounds: 10 } });
    expect(gap.current.window.rounds).toBe(10);
  });

  it('gives the pressure gap a Welch range when the rounds vary', () => {
    const fx = new TeamFixture().player('p1', [
      ...[78, 76, 77, 79, 75].map((score, i) => ({ date: daysAgo(1 + i * 2), score })),
      ...[72, 74, 73, 71, 75].map((score, i) => ({ date: daysAgo(2 + i * 2), score, type: 'practice' })),
    ]);
    const gap = measure(sheetOf(fx, 'p1'), 'pressure_gap').current;
    // Competition 3,4,5,6,7 to par (mean 5), practice -1,0,1,2,3 (mean 1): gap 4. Each side sd 1.5811, se 0.7071.
    // se of the gap √(0.5 + 0.5) = 1, Welch df 8, t(0.975, 8) = 2.306 → 1.694 to 6.306.
    expect(gap.value).toBe(4);
    expect(gap.range95).toEqual({ low: 1.694, high: 6.306, method: 'welch' });
    expect(gap.stat).toMatchObject({ kind: 'mean', n: 10, se: 1, df: 8 });
  });

  it('reads putts only from rounds with putts recorded, and ignores a cache row written for a round with no hole scored', () => {
    const fx = new TeamFixture().player('p1', [
      { date: daysAgo(1), cache: { total_putts: 30, three_putts: 2 } },
      { date: daysAgo(2), cache: { total_putts: 0, three_putts: 0 } },
      { date: daysAgo(3), cache: { total_putts: 34, three_putts: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, double_bogeys: 0, triple_plus: 0 } },
    ]);
    const s = sheetOf(fx, 'p1');
    expect(measure(s, 'putts_per_round').current).toMatchObject({ value: 32, sample: { attempts: 2 } });
    // The third round's counts add up to no hole, so its three-putts are unknown, not zero.
    expect(measure(s, 'three_putts_per_round').current).toMatchObject({ value: 2, sample: { attempts: 1 } });
    expect(measure(s, 'big_numbers').current.sample.rounds).toBe(2);
  });
});

describe('the team block', () => {
  const fx = new TeamFixture();
  // Putting strokes gained: the subject at -3, seven teammates from -0.6 to +0.6.
  fx.player('subject', tenRounds(2, { ...EVEN, putting: -3 }));
  [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].forEach((p, i) => fx.player(`mate-${i}`, tenRounds(2, { ...EVEN, putting: p })));
  const s = sheetOf(fx, 'subject');
  const team = measure(s, 'strokes_gained_putting').team!;

  it('holds each teammate\'s value with its sample, the median and the spread, without the player', () => {
    expect(team.audience).toBe('coach_only');
    expect(team.window).toBe('last10');
    expect(team.n).toBe(7);
    expect(team.teammates.map((t) => t.player_id)).toEqual(['mate-0', 'mate-1', 'mate-2', 'mate-3', 'mate-4', 'mate-5', 'mate-6']);
    expect(team.teammates[0]).toEqual({ player_id: 'mate-0', value: -0.6, attempts: 10, rounds: 10 });
    // Median 0. Distances 0.6,0.4,0.2,0,0.2,0.4,0.6 → sorted 0,0.2,0.2,0.4,0.4,0.6,0.6 → MAD 0.4; spread 0.4 × 1.4826 = 0.593.
    expect(team.median).toBe(0);
    expect(team.mad).toBe(0.4);
    expect(team.spread).toBe(0.593);
    expect(team.min).toBe(-0.6);
    expect(team.max).toBe(0.6);
  });

  it('carries ids only: nothing in a sheet is a name', () => {
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/first_name|last_name|full_name|"name"/);
  });

  it('can be dropped whole before anything travels toward a player', () => {
    const safe = withoutCoachOnly(s);
    expect(safe.measures.every((m) => m.team === null)).toBe(true);
    expect(JSON.stringify(safe)).not.toContain('mate-');
    // The original is untouched.
    expect(measure(s, 'strokes_gained_putting').team).not.toBeNull();
  });

  it('has no team block for a team of one', () => {
    const solo = sheetOf(new TeamFixture().player('p1', tenRounds(2, EVEN)), 'p1');
    expect(solo.measures.every((m) => m.team === null)).toBe(true);
  });
});

describe('the builder', () => {
  const fx = new TeamFixture();
  fx.player('b', tenRounds(2, EVEN)).player('a', tenRounds(3, { ...EVEN, tee: 0.5 }));

  it('is deterministic: the same rows in any order give the same sheets', () => {
    const first = assembleFactSheets(fx.rows());
    const rows = fx.rows();
    const shuffled = assembleFactSheets({
      ...rows,
      playerIds: [...rows.playerIds].reverse(),
      rounds: [...rows.rounds].reverse(),
      roundCache: [...rows.roundCache].reverse(),
      holes: [...rows.holes].reverse(),
    });
    expect(shuffled).toEqual(first);
    expect(first.map((s) => s.player_id)).toEqual(['a', 'b']);
  });

  it('reads through the injected sources, and only reads', async () => {
    const sheets = await buildTeamFactSheets(fx.sources(), { teamId: TEAM_ID, now: NOW });
    expect(sheets).toEqual(assembleFactSheets(fx.rows()));
    expect(new Set(fx.calls)).toEqual(new Set(['team', 'activePlayerIds', 'rounds', 'roundCache', 'holes', 'shots', 'tourStandards']));
  });

  it('builds one player\'s sheet with the team beside it, and none for a player not on the team', async () => {
    const one = await buildFactSheet(fx.sources(), { teamId: TEAM_ID, playerId: 'a', now: NOW });
    expect(one?.player_id).toBe('a');
    expect(one?.measures.find((m) => m.id === 'strokes_gained_off_the_tee')?.team?.teammates).toHaveLength(1);
    expect(await buildFactSheet(fx.sources(), { teamId: TEAM_ID, playerId: 'stranger', now: NOW })).toBeNull();
  });

  it('fails loudly on an unknown team or a failed read, never with an empty sheet', async () => {
    await expect(buildTeamFactSheets(fx.sources(), { teamId: 'nope', now: NOW })).rejects.toThrow('was not found');
    const broken = { ...fx.sources(), shots: async () => Promise.reject(new Error('analyst: reading golf_shots failed: timeout')) };
    await expect(buildTeamFactSheets(broken, { teamId: TEAM_ID, now: NOW })).rejects.toThrow('golf_shots failed');
  });

  it('turns the season on the team\'s calendar', () => {
    // 04:30 UTC on 1 August is still 31 July in Los Angeles: the old season.
    const early = new Date('2026-08-01T04:30:00Z');
    const la = assembleFactSheets({ ...new TeamFixture({ timezone: 'America/Los_Angeles' }).player('p1', []).rows(early) })[0]!;
    const ny = assembleFactSheets({ ...new TeamFixture({ timezone: 'America/New_York' }).player('p1', []).rows(early) })[0]!;
    expect(la.season_start).toBe('2025-08-01');
    expect(la.as_of).toBe('2026-07-31');
    expect(ny.season_start).toBe('2026-08-01');
    expect(la.notes.join(' ')).toContain('No counted 18-hole round');
  });
});
