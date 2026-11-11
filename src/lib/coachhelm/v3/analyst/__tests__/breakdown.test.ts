import { describe, expect, it } from 'vitest';
import { shotSgForRound } from '@/lib/coachhelm/v3/generators/insight-angles/shot-sg';
import { MISS_SIDE_MIN_COVERAGE, PATTERN_MIN_SHOTS, areaBreakdowns, withTeamMedians } from '../breakdown';
import { teamReport } from '../dry-run';
import { assembleFactSheets } from '../fact-sheet';
import { EVIDENCE_ROUNDS, findNotable, leadPattern, readWhere } from '../notability';
import { comparePuttDefinitions } from '../putt-definitions';
import type { CountedRound } from '../rounds';
import type { HoleRow, ShotRow } from '../sources';
import { withoutCoachOnly, type AreaBreakdown, type BandFact, type PatternFact } from '../types';
import { TEAM_ID, TeamFixture, tenRounds } from './fixtures';

// ── Rows by hand: one shot a hole, so a test states the shots it is about ────────────────────────────────────────────

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

const roundOf = (id: string, date: string): CountedRound => ({
  id,
  player_id: 'p',
  round_date: date,
  round_type: 'tournament',
  total_score: 74,
  score_to_par: 2,
  front_nine: 37,
  back_nine: 37,
  holes_played: 18,
  total_putts: 31,
  strokes_gained_total: null,
  strokes_gained_tee: null,
  strokes_gained_approach: null,
  strokes_gained_around_green: null,
  strokes_gained_putting: null,
  total_only: false,
});

const holesOf = (roundId: string): HoleRow[] => PARS.map((par, i) => ({ id: `${roundId}-h${i + 1}`, round_id: roundId, hole_number: i + 1, par, score: par }));

type ShotSpec = Partial<ShotRow> & { hole: number };

/** Builds a round's shots from short specs. Shot numbers follow the order given. */
function shotsOf(roundId: string, specs: readonly ShotSpec[]): ShotRow[] {
  return specs.map(({ hole, ...s }, i) => ({
    id: `${roundId}-s${String(i).padStart(3, '0')}`,
    round_id: roundId,
    hole_id: `${roundId}-h${hole}`,
    hole_number: hole,
    shot_number: i + 1,
    shot_type: null,
    club_type: null,
    is_penalty: null,
    miss_direction: null,
    lie_before: null,
    distance_to_hole_before: null,
    distance_unit_before: null,
    distance_to_hole_after: null,
    distance_unit_after: null,
    result: null,
    lie_after: null,
    putt_made: null,
    putt_distance_feet: null,
    ...s,
  }));
}

const approach = (hole: number, yards: number, leaveFeet: number, green: boolean, more: Partial<ShotRow> = {}): ShotSpec => ({
  hole,
  shot_type: 'approach',
  lie_before: 'fairway',
  distance_to_hole_before: yards,
  distance_unit_before: 'yards',
  distance_to_hole_after: leaveFeet,
  distance_unit_after: 'feet',
  result: green ? 'green' : 'rough',
  lie_after: green ? 'green' : 'rough',
  ...more,
});
const putt = (hole: number, feet: number, made: boolean, more: Partial<ShotRow> = {}): ShotSpec => ({
  hole,
  shot_type: 'putting',
  lie_before: 'green',
  distance_to_hole_before: feet,
  distance_unit_before: 'feet',
  distance_to_hole_after: made ? 0 : 2,
  distance_unit_after: 'feet',
  result: made ? 'hole' : 'green',
  lie_after: 'green',
  putt_made: made,
  putt_distance_feet: feet,
  ...more,
});
const teeShot = (hole: number, more: Partial<ShotRow>): ShotSpec => ({
  hole,
  shot_type: 'tee',
  lie_before: 'tee',
  distance_to_hole_before: 420,
  distance_unit_before: 'yards',
  distance_to_hole_after: 150,
  distance_unit_after: 'yards',
  club_type: 'driver',
  ...more,
});

/** `n` rounds, each with the shots `specs(i)` gives. */
function season(n: number, specs: (i: number) => readonly ShotSpec[]) {
  const rounds = Array.from({ length: n }, (_, i) => roundOf(`r${String(i).padStart(2, '0')}`, `2026-10-${String(n - i).padStart(2, '0')}`));
  const shotsByRound = new Map(rounds.map((r, i) => [r.id, shotsOf(r.id, specs(i))]));
  const holesByRound = new Map(rounds.map((r) => [r.id, holesOf(r.id)]));
  return { rounds, shotsByRound, holesByRound, scale: 1 };
}

const areaOf = (all: readonly AreaBreakdown[], id: string): AreaBreakdown => all.find((a) => a.area_measure_id === id)!;
const bandOf = (area: AreaBreakdown, id: string): BandFact => area.bands.find((b) => b.band === id)!;
const patternOf = (list: readonly PatternFact[], id: string): PatternFact => list.find((p) => p.id === id)!;

describe('the breakdown of an area into bands', () => {
  it('puts each approach in its distance band, and the bands of a round add up to the round', () => {
    // Each round: 150 yards to 60 feet in the rough, 100 yards to 10 feet on the green, 30 yards to 4 feet on the green.
    const input = season(5, () => [approach(1, 150, 60, false), approach(2, 100, 10, true), approach(5, 30, 4, true)]);
    const a = areaOf(areaBreakdowns(input), 'strokes_gained_approach');
    expect(a).toMatchObject({ window: 'season', measured_rounds: 5 });
    expect(a.bands.map((b) => [b.band, b.shots, b.rounds])).toEqual([
      ['under_50', 5, 5],
      ['50_125', 5, 5],
      ['125_175', 5, 5],
      ['175_plus', 0, 0],
      ['layup', 0, 0],
    ]);
    // The per-shot figure is the port of the database function: a round's bands add up to its sum over the same shots.
    const first = input.rounds[0]!;
    const perShot = shotSgForRound(input.shotsByRound.get(first.id)!.map((s) => ({ ...s, shot_number: s.shot_number ?? 0, created_at: null })), new Map(holesOf(first.id).map((h) => [h.id, h.par!])), 1);
    const whole = perShot.filter((v) => v.category === 'approach').reduce((sum, v) => sum + v.sg, 0);
    const row = a.rounds.find((r) => r.round_id === first.id)!;
    expect(Object.values(row.strokes_gained).reduce((x, y) => x + y, 0)).toBeCloseTo(whole, 3);
    expect(row.shots).toEqual({ under_50: 1, '50_125': 1, '125_175': 1, '175_plus': 0, layup: 0 });
    // The miss from 150 loses, the two that found the green close gain.
    expect(bandOf(a, '125_175').strokes_gained_per_round!.value).toBeLessThan(0);
    expect(bandOf(a, '50_125').strokes_gained_per_round!.value).toBeGreaterThan(0);
    // A band nobody played from has no figure, not a zero.
    expect(bandOf(a, '175_plus').strokes_gained_per_round).toBeNull();
  });

  it('keeps a par 5 lay-up apart: it is not a missed green', () => {
    // Hole 4 is a par 5: from 240 yards left 80 yards out (a lay-up). Hole 1 is a par 4: from 200 yards, missed, 30 yards out.
    const input = season(12, () => [approach(4, 240, 240, false, { lie_after: 'fairway', result: 'fairway' }), approach(1, 200, 90, false)]);
    const a = areaOf(areaBreakdowns(input), 'strokes_gained_approach');
    expect(bandOf(a, 'layup').shots).toBe(12);
    expect(bandOf(a, '175_plus').shots).toBe(12);
    // The whole-area patterns leave the lay-ups out: 12 approaches, none on the green, not 24.
    expect(patternOf(a.overall, 'green_hit')).toMatchObject({ count: 0, of: 12, value: 0 });
    expect(a.overall.map((p) => p.id)).not.toContain('green_hit_layup');
    expect(a.overall.map((p) => p.id)).toContain('green_hit_175_plus');
  });

  it('counts each pattern from shots, with its count, and never infers one', () => {
    // 12 rounds, one approach from 150 each: 3 on the green at 20 feet, 9 missed at 45 feet (6 short, 3 right).
    const input = season(12, (i) => [
      i < 3 ? approach(1, 150, 20, true) : approach(1, 150, 45, false, { miss_direction: i < 9 ? 'short' : 'right', lie_before: i % 2 ? 'rough' : 'fairway' }),
    ]);
    const band = bandOf(areaOf(areaBreakdowns(input), 'strokes_gained_approach'), '125_175');
    expect(band.patterns.every((p) => p.basis === 'counted_from_shots')).toBe(true);
    // Green hit: 3 of 12 = 25%, Wilson 95% range 8.89 to 53.23.
    expect(patternOf(band.patterns, 'green_hit')).toMatchObject({ unit: 'percent', value: 25, count: 3, of: 12 });
    expect(patternOf(band.patterns, 'green_hit').range95!.low).toBeCloseTo(8.89, 1);
    expect(patternOf(band.patterns, 'green_hit').range95!.high).toBeCloseTo(53.23, 1);
    // Proximity: (3 × 20 + 9 × 45) / 12 = 38.75 feet.
    expect(patternOf(band.patterns, 'proximity')).toMatchObject({ unit: 'feet', value: 38.75, count: 12, of: 12 });
    // Nine misses is under the floor of ten: the sides are not traced, and the reason is given.
    expect(PATTERN_MIN_SHOTS).toBe(10);
    expect(patternOf(band.patterns, 'missed_short')).toMatchObject({ value: null, count: 6, of: 9, not_traced: 'needs 10 misses; 9 so far' });
    // Played from the rough: rounds 3, 5, 7, 9, 11 = 5 of 12.
    expect(patternOf(band.patterns, 'from_rough')).toMatchObject({ count: 5, of: 12, value: 41.6667 });
  });

  it('reads a miss side only when the side was recorded on most of the misses', () => {
    expect(MISS_SIDE_MIN_COVERAGE).toBe(0.8);
    // 20 misses from 150. Recorded on all 20: 12 short, 8 right.
    const full = season(20, (i) => [approach(1, 150, 45, false, { miss_direction: i < 12 ? 'short' : 'right' })]);
    const traced = bandOf(areaOf(areaBreakdowns(full), 'strokes_gained_approach'), '125_175').patterns;
    expect(patternOf(traced, 'missed_short')).toMatchObject({ value: 60, count: 12, of: 20 });
    expect(patternOf(traced, 'missed_right')).toMatchObject({ value: 40, count: 8, of: 20 });
    expect(patternOf(traced, 'missed_long')).toMatchObject({ value: 0, count: 0, of: 20 });
    // Recorded on 10 of 20 (under 80%): the ten that have a side are not a fair sample of the misses.
    const half = season(20, (i) => [approach(1, 150, 45, false, { miss_direction: i < 10 ? 'short' : null })]);
    const untraced = bandOf(areaOf(areaBreakdowns(half), 'strokes_gained_approach'), '125_175').patterns;
    expect(patternOf(untraced, 'missed_short')).toMatchObject({ value: null, count: 10, of: 10, not_traced: 'the miss side is recorded on 10 of 20 misses' });
  });

  it('splits putting by start distance, with makes and three-putts counted by hole', () => {
    // Each round: hole 1 a 30-footer missed, then 4 feet missed, then 2 feet made (three putts); hole 2 a 4-footer made.
    const input = season(10, () => [putt(1, 30, false, { distance_to_hole_after: 4 }), putt(1, 4, false), putt(1, 2, true), putt(2, 4, true)]);
    const a = areaOf(areaBreakdowns(input), 'strokes_gained_putting');
    expect(a.bands.map((b) => [b.band, b.shots])).toEqual([['0_3', 10], ['3_5', 20], ['5_10', 0], ['10_15', 0], ['15_25', 0], ['25_plus', 10]]);
    expect(patternOf(bandOf(a, '3_5').patterns, 'made')).toMatchObject({ value: 50, count: 10, of: 20 });
    // Three-putts are counted on the holes whose FIRST putt started in the band: all ten from 25 feet and longer.
    expect(patternOf(bandOf(a, '25_plus').patterns, 'three_putt')).toMatchObject({ value: 100, count: 10, of: 10 });
    // The 4-footers that started hole 2 took one putt each.
    expect(patternOf(bandOf(a, '3_5').patterns, 'three_putt')).toMatchObject({ value: 0, count: 0, of: 10 });
    // What a missed 30-footer left: 4 feet.
    expect(patternOf(bandOf(a, '25_plus').patterns, 'leave_after_miss')).toMatchObject({ unit: 'feet', value: 4, count: 10 });
    // The make rate of each band rides in the whole-area list under the band's name.
    expect(patternOf(a.overall, 'made_3_5')).toMatchObject({ value: 50, count: 10, of: 20 });
    expect(patternOf(a.overall, 'made')).toMatchObject({ count: 20, of: 40, value: 50 });
  });

  it('splits tee shots by where they went and the short game by the lie', () => {
    const input = season(10, (i) => [
      teeShot(1, { result: 'fairway', lie_after: 'fairway' }),
      teeShot(2, { result: 'rough', lie_after: 'rough', miss_direction: 'left' }),
      teeShot(5, { result: 'rough', lie_after: 'rough', miss_direction: i < 5 ? 'right' : null, club_type: '3_wood' }),
      { hole: 6, shot_type: 'around_green', lie_before: i < 4 ? 'sand' : 'rough', distance_to_hole_before: 15, distance_unit_before: 'yards', distance_to_hole_after: i < 4 ? 12 : 4, distance_unit_after: 'feet', result: 'green', lie_after: 'green' },
    ]);
    const all = areaBreakdowns(input);
    const tee = areaOf(all, 'strokes_gained_off_the_tee');
    expect(tee.bands.map((b) => [b.band, b.shots])).toEqual([['fairway', 10], ['left', 10], ['right', 5], ['other', 5], ['penalty', 0]]);
    // 10 of the 30 tee shots went left; every one of them was a driver.
    expect(patternOf(bandOf(tee, 'left').patterns, 'share_of_tee_shots')).toMatchObject({ count: 10, of: 30, value: 33.3333 });
    expect(patternOf(bandOf(tee, 'left').patterns, 'with_driver')).toMatchObject({ count: 10, of: 10, value: 100 });
    const around = areaOf(all, 'strokes_gained_around_the_green');
    expect(around.bands.map((b) => [b.band, b.shots])).toEqual([['fairway', 0], ['rough', 6], ['sand', 4]]);
    // Six from the rough is under the floor: not traced. The whole area has ten: 6 of 10 finished inside 6 feet.
    expect(patternOf(bandOf(around, 'rough').patterns, 'on_green')).toMatchObject({ value: null, not_traced: 'needs 10 shots; 6 so far' });
    expect(patternOf(around.overall, 'inside_6_feet')).toMatchObject({ count: 6, of: 10, value: 60 });
  });

  it('gives the same figures whatever order the rows arrive in', () => {
    const input = season(6, (i) => [approach(1, 150, 40 + i, false), approach(2, 100, 10, true), putt(2, 10, i % 2 === 0)]);
    const shuffled = { ...input, shotsByRound: new Map([...input.shotsByRound].map(([id, shots]) => [id, [...shots].reverse()])) };
    const strip = (all: AreaBreakdown[]) => all.map((a) => a.bands.map((b) => [b.band, b.shots, b.strokes_gained_per_round, b.patterns.map((p) => [p.id, p.value, p.count, p.of])]));
    expect(strip(areaBreakdowns(shuffled))).toEqual(strip(areaBreakdowns(input)));
  });
});

describe("the teammates' median of a pattern", () => {
  /** A player whose approaches from 150 found the green `hits` times in 20. */
  const player = (hits: number) => areaBreakdowns(season(20, (i) => [approach(1, 150, i < hits ? 20 : 45, i < hits)]));

  it('is the median of the OTHER players who have the pattern traced, marked coach-only', () => {
    const mine = player(4);
    const teammates = [player(10), player(12), player(16)];
    const band = bandOf(areaOf(withTeamMedians(mine, teammates), 'strokes_gained_approach'), '125_175');
    // Theirs: 50%, 60%, 80% → median 60. Mine (20%) is not in it.
    expect(patternOf(band.patterns, 'green_hit')).toMatchObject({ value: 20, team: { audience: 'coach_only', median: 60, teammates: 3 } });
    // A pattern no teammate has traced has no median and says how many had it: none.
    expect(patternOf(band.patterns, 'missed_short').team).toEqual({ audience: 'coach_only', median: null, teammates: 0 });
    // The whole-area list carries the same median.
    expect(patternOf(areaOf(withTeamMedians(mine, teammates), 'strokes_gained_approach').overall, 'green_hit_125_175').team).toMatchObject({ median: 60, teammates: 3 });
  });

  it('never reaches a player: the player copy of a sheet has no team figure on any pattern', () => {
    const fx = new TeamFixture();
    for (const id of ['a', 'b', 'c']) fx.player(id, tenRounds(2, { tee: -0.5, approach: -3, around: -0.5, putting: -0.5 }, () => ({ approaches: [[150, 40, false], [150, 20, true]] })));
    const sheet = assembleFactSheets(fx.rows()).find((s) => s.player_id === 'a')!;
    const coach = sheet.breakdowns.flatMap((a) => [...a.overall, ...a.bands.flatMap((b) => b.patterns)]);
    expect(coach.some((p) => p.team?.audience === 'coach_only')).toBe(true);
    const mine = withoutCoachOnly(sheet).breakdowns.flatMap((a) => [...a.overall, ...a.bands.flatMap((b) => b.patterns)]);
    expect(mine.length).toBe(coach.length);
    expect(mine.every((p) => p.team === undefined)).toBe(true);
    expect(JSON.stringify(withoutCoachOnly(sheet).breakdowns)).not.toContain('coach_only');
  });
});

// ── One level down: which band, which pattern ───────────────────────────────────────────────────────────────────────

const percent = (id: string, count: number, of: number, team?: { median: number | null; teammates: number }): PatternFact => ({
  id,
  label: id,
  unit: 'percent',
  value: (count / of) * 100,
  count,
  of,
  basis: 'counted_from_shots',
  ...(team ? { team: { audience: 'coach_only', ...team } } : {}),
});

/** An area of ten rounds with three bands whose per-round strokes gained are given. */
function area(perRound: (i: number) => { a: number; b: number; c: number }, patterns: { a?: PatternFact[]; overall?: PatternFact[] } = {}, shotsA = 30): AreaBreakdown {
  const rounds = Array.from({ length: 10 }, (_, i) => {
    const v = perRound(i);
    return { round_id: `r${String(i).padStart(2, '0')}`, date: `2026-10-${String(10 - i).padStart(2, '0')}`, strokes_gained: { '125_175': v.a, '50_125': v.b, under_50: v.c }, shots: { '125_175': shotsA / 10, '50_125': 3, under_50: 3 } };
  });
  const mean = (k: string) => rounds.reduce((sum, r) => sum + (r.strokes_gained as Record<string, number>)[k]!, 0) / 10;
  const band = (id: string, label: string, shots: number, list: PatternFact[]): BandFact => ({ band: id, label, shots, rounds: 10, strokes_gained_per_round: { value: mean(id), low: null, high: null }, strokes_gained_per_shot: null, patterns: list });
  return {
    area_measure_id: 'strokes_gained_approach',
    window: 'season',
    measured_rounds: 10,
    rounds,
    bands: [band('under_50', 'approach shots from inside 50 yards', 30, []), band('50_125', 'approach shots from 50 to 125 yards', 30, []), band('125_175', 'approach shots from 125 to 175 yards', shotsA, patterns.a ?? [])],
    overall: patterns.overall ?? [],
  };
}

/** 125 to 175 loses a steady stroke a round; the other two bands are level. */
const CONCENTRATED = (i: number) => ({ a: i % 2 ? -0.9 : -1.1, b: i % 2 ? -0.1 : 0.1, c: 0 });
/** All three lose about half a stroke, in different rounds: 125 to 175 averages -0.6, the other two -0.4. */
const SPREAD = (i: number) => ({ a: i % 2 ? 0.4 : -1.6, b: i % 2 ? -1.3 : 0.5, c: -0.4 });

describe('where inside the area the strokes go', () => {
  it('names the band that is clearly worse than the player\'s other bands, round by round', () => {
    const w = readWhere(area(CONCENTRATED, { a: [percent('green_hit', 9, 30), percent('missed_short', 15, 21), percent('missed_right', 6, 21)] }), 'strokes_gained_approach');
    expect(w.finding).toBe('band');
    expect(w.band).toMatchObject({ band: '125_175', label: 'approach shots from 125 to 175 yards', shots: 30, rounds: 10, named: true, separated_without_widening: true });
    // Strokes lost a round in the band: 1.0.
    expect(w.band!.strokes_per_round.value).toBe(1);
    // Round by round, the band minus the mean of the other two: -1.15, -0.85, … → mean -1.0, sd 0.1581, se 0.05.
    // Widened for choosing one band of three: t(1 - 0.05/6, 9) = 2.933 → high -0.853.
    expect(w.band!.against_other_bands.value).toBe(-1);
    expect(w.band!.against_other_bands.high).toBeCloseTo(-0.853, 2);
    expect(w.band!.against_other_bands.level).toBeCloseTo(1 - 0.05 / 3, 6);
    // The bands, worst first, each with its strokes a round.
    expect(w.bands.map((b) => [b.band, b.strokes_per_round.value])).toEqual([['125_175', 1], ['50_125', 0], ['under_50', 0]]);
    // The patterns are the named band's own, and the largest miss side leads when there is no team to compare with.
    expect(w.patterns_scope).toBe('band');
    expect(w.lead_pattern).toMatchObject({ id: 'missed_short', count: 15, of: 21, differs_from_team: false, direction: null });
    expect(w.signature).toBe('approach/125_175/missed_short');
    expect(w.why).toBe("Over 10 measured rounds, approach shots from 125 to 175 yards lose strokes and lose more than the player's other bands in this area, round by round, beyond what chance explains.");
  });

  it('gives the rounds behind it: the five where the band cost most, ids only', () => {
    expect(EVIDENCE_ROUNDS).toBe(5);
    const w = readWhere(area(CONCENTRATED), 'strokes_gained_approach');
    // The even rounds lost 1.1 in the band; ties go by round id.
    expect(w.evidence).toEqual([
      { round_id: 'r00', date: '2026-10-10', shots: 3, strokes_gained: -1.1 },
      { round_id: 'r02', date: '2026-10-08', shots: 3, strokes_gained: -1.1 },
      { round_id: 'r04', date: '2026-10-06', shots: 3, strokes_gained: -1.1 },
      { round_id: 'r06', date: '2026-10-04', shots: 3, strokes_gained: -1.1 },
      { round_id: 'r08', date: '2026-10-02', shots: 3, strokes_gained: -1.1 },
    ]);
  });

  it('says the loss is spread evenly when no band is clearly the worst, and reads the whole area', () => {
    const overall = [percent('green_hit', 40, 90), percent('missed_short', 30, 50), percent('green_hit_125_175', 9, 30)];
    const w = readWhere(area(SPREAD, { a: [percent('green_hit', 9, 30)], overall }), 'strokes_gained_approach');
    expect(w.finding).toBe('spread_evenly');
    // The largest so far is still reported, marked as not named.
    expect(w.band).toMatchObject({ band: '125_175', named: false, separated_without_widening: false });
    expect(w.band!.against_other_bands.high).toBeGreaterThan(0);
    expect(w.patterns_scope).toBe('area');
    expect(w.patterns).toEqual(overall);
    expect(w.signature).toBe('approach/spread_evenly/missed_short');
    expect(w.why).toBe('Over 10 measured rounds no band is clearly worse than the others: the loss is spread across the area. approach shots from 125 to 175 yards are the largest so far, not separated from the rest.');
    // The rounds behind it are the ones where the whole area cost most: -1.5 in the even rounds (-1.6 + 0.5 - 0.4).
    expect(w.evidence.map((r) => [r.round_id, r.shots, r.strokes_gained])).toEqual([['r00', 9, -1.5], ['r02', 9, -1.5], ['r04', 9, -1.5], ['r06', 9, -1.5], ['r08', 9, -1.5]]);
  });

  it('does not name a band on fewer than ten shots, however large the loss', () => {
    const w = readWhere(area(CONCENTRATED, {}, 9), 'strokes_gained_approach');
    expect(w.finding).toBe('spread_evenly');
    expect(w.band).toMatchObject({ band: '125_175', shots: 9, named: false });
  });

  it('is not traced, with the reason, when the shots cannot support it', () => {
    expect(readWhere(undefined, 'strokes_gained_putting')).toMatchObject({ finding: 'not_traced', why: 'needs 5 rounds with shots logged; 0 so far this season', band: null, patterns: [], evidence: [], signature: 'putting/not_traced/-' });
    const four = area(CONCENTRATED);
    expect(readWhere({ ...four, rounds: four.rounds.slice(0, 4) }, 'strokes_gained_approach').why).toBe('needs 5 rounds with shots logged; 4 so far this season');
    // One band only: nothing to compare it with.
    const one = area(CONCENTRATED);
    expect(readWhere({ ...one, bands: one.bands.map((b) => (b.band === '125_175' ? b : { ...b, shots: 0 })) }, 'strokes_gained_approach')).toMatchObject({ finding: 'not_traced', why: 'the shots of this area fall in fewer than two bands, so there is nothing to compare' });
    // Rounds that do not vary cannot tell the bands apart: the bands are still listed.
    const flat = readWhere(area(() => ({ a: -1, b: 0, c: 0 })), 'strokes_gained_approach');
    expect(flat).toMatchObject({ finding: 'not_traced', why: 'the rounds do not vary, so the bands cannot be told apart' });
    expect(flat.bands.map((b) => b.band)).toEqual(['125_175', '50_125', 'under_50']);
  });
});

describe('the pattern to lead with', () => {
  it('is the share that sits clear of the teammates\' median, with the direction', () => {
    // 20 of 100 against a median of 50 from six teammates: the 95% range 13.3 to 28.9 does not reach 50.
    const lead = leadPattern([percent('green_hit', 20, 100, { median: 50, teammates: 6 }), percent('missed_short', 60, 80)]);
    expect(lead).toMatchObject({ id: 'green_hit', count: 20, of: 100, differs_from_team: true, direction: 'below' });
    expect(leadPattern([percent('from_rough', 40, 100, { median: 20, teammates: 6 })])).toMatchObject({ id: 'from_rough', differs_from_team: true, direction: 'above' });
  });

  it('takes the furthest from the median when several are clear', () => {
    const lead = leadPattern([percent('green_hit', 30, 100, { median: 50, teammates: 6 }), percent('from_rough', 60, 100, { median: 20, teammates: 6 })]);
    expect(lead).toMatchObject({ id: 'from_rough', direction: 'above' });
  });

  it('widens each range for how many shares were compared', () => {
    // 40 of 100 against 50: alone, the 95% range (30.9 to 49.8) excludes 50.
    expect(leadPattern([percent('green_hit', 40, 100, { median: 50, teammates: 6 })])).toMatchObject({ id: 'green_hit', differs_from_team: true });
    // As one of four compared, the range is 28.7 to 52.5 and reaches 50: no share is clear, so the largest miss side leads.
    const four = [
      percent('green_hit', 40, 100, { median: 50, teammates: 6 }),
      percent('missed_short', 30, 60, { median: 50, teammates: 6 }),
      percent('missed_right', 18, 60, { median: 30, teammates: 6 }),
      percent('from_rough', 25, 100, { median: 25, teammates: 6 }),
    ];
    expect(leadPattern(four)).toMatchObject({ id: 'missed_short', differs_from_team: false, direction: null });
  });

  it('needs five teammates with the pattern before it compares', () => {
    const lead = leadPattern([percent('green_hit', 20, 100, { median: 50, teammates: 4 }), percent('missed_long', 12, 30)]);
    expect(lead).toMatchObject({ id: 'missed_long', differs_from_team: false });
  });

  it('never leads with a pattern that was not traced', () => {
    const untraced: PatternFact = { id: 'missed_short', label: 'x', unit: 'percent', value: null, count: 3, of: 4, basis: 'counted_from_shots', not_traced: 'needs 10 misses; 4 so far' };
    expect(leadPattern([untraced])).toBeNull();
    expect(leadPattern([untraced, percent('green_hit', 5, 20)])).toMatchObject({ id: 'green_hit', differs_from_team: false });
    expect(leadPattern([])).toBeNull();
  });
});

// ── The same thing end to end, and how many players come out different ──────────────────────────────────────────────

describe('a team whose players all lose strokes on approach', () => {
  /**
   * Seven players, ten rounds each, approach the priority for all of them. Per round every player hits two approaches
   * from 150 yards and two from 100. They differ one level down:
   *   far    misses every green from 150 (45 to 90 feet away, so the rounds vary), hits every one from 100
   *   near   the reverse: misses from 100, hits from 150
   *   m1…m5  hit one of two from each distance; the missed one alternates by round, so no band stands out
   */
  const fx = new TeamFixture();
  const legs = { tee: -0.5, approach: -3, around: -0.5, putting: -0.5 };
  fx.player('far', tenRounds(2, legs, (i) => ({ approaches: [[150, 45 + 15 * (i % 3), false], [150, 60 + 30 * (i % 2), false], [100, 8, true], [100, 10, true]] })));
  fx.player('near', tenRounds(2, legs, (i) => ({ approaches: [[150, 15, true], [150, 18, true], [100, 45 + 15 * (i % 3), false], [100, 60 + 30 * (i % 2), false]] })));
  for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) {
    fx.player(id, tenRounds(2, legs, (i) => ({ approaches: i % 2 ? [[150, 50, false], [150, 15, true], [100, 10, true], [100, 12, true]] : [[150, 15, true], [150, 18, true], [100, 45, false], [100, 10, true]] })));
  }
  const sheets = assembleFactSheets(fx.rows());
  const whereOf = (id: string) => findNotable(sheets.find((s) => s.player_id === id)!).priority!.where;

  it('names a different band for the two whose loss is concentrated', () => {
    expect(whereOf('far')).toMatchObject({ finding: 'band', band: { band: '125_175', shots: 20, named: true }, patterns_scope: 'band' });
    expect(whereOf('near')).toMatchObject({ finding: 'band', band: { band: '50_125', shots: 20, named: true } });
    // The pattern is counted from the band's own shots and set against the five teammates who have it.
    expect(whereOf('far').lead_pattern).toMatchObject({ id: 'green_hit', count: 0, of: 20, value: 0, basis: 'counted_from_shots', differs_from_team: true, direction: 'below' });
    expect(whereOf('far').lead_pattern!.team).toMatchObject({ audience: 'coach_only', median: 75, teammates: 6 });
    expect(whereOf('far').signature).toBe('approach/125_175/green_hit:below_team');
    expect(whereOf('near').signature).toBe('approach/50_125/green_hit:below_team');
    // The rounds behind it: five, each with the two shots from that band.
    expect(whereOf('far').evidence).toHaveLength(5);
    expect(whereOf('far').evidence.every((r) => r.shots === 2 && r.strokes_gained < 0 && r.round_id.startsWith('far-'))).toBe(true);
  });

  it('says spread evenly for the players whose misses move between the bands', () => {
    expect(whereOf('m1')).toMatchObject({ finding: 'spread_evenly', patterns_scope: 'area', band: { named: false } });
    expect(whereOf('m1').signature).toBe(whereOf('m2').signature);
  });

  it('counts how many priorities differ from every teammate\'s, and counts identical rounds once', () => {
    const report = teamReport(TEAM_ID, sheets.map((sheet) => ({ sheet, notability: findNotable(sheet) })), comparePuttDefinitions(fx.shots));
    // Same area for all seven; one level down two of them are their own.
    expect(report.summary.distinct_priority_kinds).toBe(1);
    expect(report.distinctness).toMatchObject({ players_with_priority: 7, named_band: 2, spread_evenly: 5, not_traced: 0, distinct_from_every_teammate: 2 });
    // m1 to m5 played identical rounds (clones): counted once, the one that is left is alone with its signature.
    expect(report.distinctness.deduplicated).toEqual({ players: 3, distinct_from_every_teammate: 3 });
    expect(report.distinctness.signatures[0]).toMatchObject({ players: 5 });
    // The same golf under another id has the same fingerprint, whatever its round ids are; different shots do not.
    const print = (id: string) => report.per_player.find((p) => p.player_id === id)!.data_fingerprint;
    expect(print('m1')).toBe(print('m5'));
    expect(print('far')).not.toBe(print('near'));
    const far = report.per_player.find((p) => p.player_id === 'far')!;
    expect(far.priority).toMatchObject({ measure_id: 'strokes_gained_approach', certainty: 'clear', finding: 'band', band: '125_175', band_shots: 20, signature: 'approach/125_175/green_hit:below_team' });
    expect(far.priority!.pattern).toMatchObject({ id: 'green_hit', value: 0, count: 0, of: 20, team_median: 75, differs_from_team: true, scope: 'band' });
  });
});
