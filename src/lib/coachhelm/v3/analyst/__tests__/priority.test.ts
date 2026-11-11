import { describe, expect, it } from 'vitest';
import { assembleFactSheets } from '../fact-sheet';
import { MIN_MEASURED_ROUNDS_FOR_COST, findNotable, type Notability } from '../notability';
import { comparePuttDefinitions } from '../putt-definitions';
import type { ShotRow } from '../sources';
import { withoutCoachOnly, type FactSheet } from '../types';
import { EVEN, TeamFixture, tenRounds, type Legs } from './fixtures';

const sheetOf = (fx: TeamFixture, playerId = 'subject'): FactSheet => assembleFactSheets(fx.rows()).find((s) => s.player_id === playerId)!;
const read = (fx: TeamFixture, playerId = 'subject'): Notability => findNotable(sheetOf(fx, playerId));
/** Twenty rounds, all this season: the last 10 at `now`, the 10 before at `before`. */
const season = (now: Legs, before: Legs) => [...tenRounds(2, now), ...tenRounds(52, before)];

describe('the priority: where the strokes go this season', () => {
  it('is the area with the most strokes a round at stake, with its range, and says how sure it is', () => {
    // Ten measured rounds this season: off the tee -0.5, approach -3.0, around the green -0.5, putting -0.5.
    const n = read(new TeamFixture().player('subject', tenRounds(2, { tee: -0.5, approach: -3, around: -0.5, putting: -0.5 })));
    const p = n.priority!;
    expect(p).toMatchObject({ tier: 'priority', measure_id: 'strokes_gained_approach', area: 'approach', window: 'season', rounds: 10, certainty: 'clear' });
    // Approach: mean -3.0; its zero-sum pattern has sum of squares 0.96, / 9 = 0.10667, sd 0.3266, se 0.10328.
    // t(0.975, 9) = 2.2622 → half width 0.2336. Strokes lost a round: 3.0, 2.7664 to 3.2336.
    expect(p.strokes_per_round).toEqual({ value: 3, low: 2.7664, high: 3.2336, level: 0.95 });
    // Against the player's own other areas: -2.5, widened for choosing one of four (as rule c): -2.9364 to -2.0636.
    expect(p.against_own_other_areas.value).toBe(-2.5);
    expect(p.against_own_other_areas.low).toBeCloseTo(-2.9364, 3);
    expect(p.against_own_other_areas.level).toBe(0.9875);
    expect(p.areas).toEqual([
      { measure_id: 'strokes_gained_off_the_tee', strokes_gained_per_round: -0.5 },
      { measure_id: 'strokes_gained_approach', strokes_gained_per_round: -3 },
      { measure_id: 'strokes_gained_around_the_green', strokes_gained_per_round: -0.5 },
      { measure_id: 'strokes_gained_putting', strokes_gained_per_round: -0.5 },
    ]);
    expect(p.certainty_why).toBe("Over 10 measured rounds this area is a loss and is worse than the player's other three areas, round by round, beyond what chance explains.");
    expect(p.questions[0]).toEqual({ ask: 'strokes_gained_by_shot_distance', area: 'approach' });
    expect(n.priority_missing).toBeNull();
    // No team on the sheet, so no team shape.
    expect(p.team_shape).toBeUndefined();
  });

  it('is "likely" when the area is a loss but not clearly worse than the others', () => {
    // Approach -2.2 against -2.0 elsewhere: a real loss, 0.2 from the rest, inside the round-to-round noise.
    const p = read(new TeamFixture().player('subject', tenRounds(2, { tee: -2, approach: -2.2, around: -2, putting: -2 }))).priority!;
    expect(p.measure_id).toBe('strokes_gained_approach');
    expect(p.certainty).toBe('likely');
    expect(p.strokes_per_round.low).toBeGreaterThan(0);
    expect(p.against_own_other_areas.high).toBeGreaterThan(0);
    expect(p.certainty_why).toContain('do not separate it');
  });

  it('is "leaning" when the lowest area is told apart neither from zero nor from the others, and says so', () => {
    // Approach -0.05, the rest +0.1: the range of the approach mean is about ±0.23, so it reaches zero.
    const p = read(new TeamFixture().player('subject', tenRounds(2, { tee: 0.1, approach: -0.05, around: 0.1, putting: 0.1 }))).priority!;
    expect(p.measure_id).toBe('strokes_gained_approach');
    expect(p.certainty).toBe('leaning');
    expect(p.strokes_per_round.value).toBe(0.05);
    expect(p.strokes_per_round.low).toBeLessThan(0);
    expect(p.certainty_why).toContain('separate it neither from zero nor from');
  });

  it('reads the whole season, not the last 10 rounds', () => {
    // The last 10 rounds are even; over the 10 before, approach was -3. Over the season approach averages -2.
    const n = read(new TeamFixture().player('subject', season(EVEN, { ...EVEN, approach: -3 })));
    expect(n.priority).toMatchObject({ measure_id: 'strokes_gained_approach', rounds: 20, certainty: 'clear' });
    expect(n.priority!.strokes_per_round.value).toBe(2);
    // Rule (c) over the last 10 rounds has nothing to say, and the season version, reported beside it, does.
    expect(n.test_log.find((t) => t.rule === 'biggest_cost')).toMatchObject({ supported: false, range_excludes_zero: false });
    expect(n.biggest_cost_season).toMatchObject({ measure_id: 'strokes_gained_approach', rounds: 20, passes_ranges: true });
  });

  it('is never a claim that something changed: it is not a candidate and does not make one', () => {
    // Every area a steady -1.0, in both windows. A priority exists; nothing is unusual.
    const n = read(new TeamFixture().player('subject', season(EVEN, EVEN)));
    expect(n.priority).not.toBeNull();
    expect(n.priority!.certainty).toBe('likely');
    expect(n.candidates).toEqual([]);
    expect(n.good_news).toEqual([]);
    expect(n.tests.supported).toBe(0);
  });

  it('is null under five measured rounds this season, with the reason', () => {
    expect(MIN_MEASURED_ROUNDS_FOR_COST).toBe(5);
    const four = read(new TeamFixture().player('subject', tenRounds(2, { tee: -1, approach: -6, around: -1, putting: -1 }).slice(0, 4)));
    expect(four.priority).toBeNull();
    expect(four.priority_missing).toBe('needs 5 rounds with shots logged; 4 so far this season');
    expect(four.biggest_cost_season).toBeNull();
    // Rounds with no shots logged never count: an estimate cannot set a priority.
    const estimated = read(new TeamFixture().player('subject', tenRounds(2, { tee: 0, approach: -4, around: 0, putting: 0 }, () => ({ shots: false }))));
    expect(estimated.priority).toBeNull();
    expect(estimated.priority_missing).toBe('needs 5 rounds with shots logged; 0 so far this season');
  });
});

describe('the priority against the team', () => {
  // Six players who all lose most on approach. The teammates' approach figures: -3.0, -3.1, -3.2, -3.3, -3.4.
  const team = (subjectApproach: number): TeamFixture => {
    const fx = new TeamFixture();
    fx.player('subject', tenRounds(2, { tee: -0.5, approach: subjectApproach, around: -0.5, putting: -0.5 }));
    for (let k = 0; k < 5; k++) fx.player(`mate-${k}`, tenRounds(2, { tee: -0.5, approach: -3 - k * 0.1, around: -0.5, putting: -0.5 }));
    return fx;
  };

  it('says when the priority is the team\'s worst area too, and how the player sits against the team in it', () => {
    // The subject at -4.5: range ±0.23 around it, well below the teammates' median of -3.2.
    const worse = read(team(-4.5)).priority!;
    expect(worse.team_shape).toEqual({
      audience: 'coach_only',
      team_worst_area: 'strokes_gained_approach',
      same_as_team: true,
      player_vs_team: { team_median: -3.2, teammates: 5, difference: -1.3, verdict: 'worse' },
    });
    // At -3.1 the player's own range (-3.33 to -2.87) reaches the median: the same as the team.
    expect(read(team(-3.1)).priority!.team_shape!.player_vs_team).toEqual({ team_median: -3.2, teammates: 5, difference: 0.1, verdict: 'same' });
    // At -2.0 the area is still the player's worst, and the player is better at it than the team.
    expect(read(team(-2)).priority!.team_shape).toMatchObject({ same_as_team: true, player_vs_team: { difference: 1.2, verdict: 'better' } });
  });

  it('says when the priority is NOT the team\'s worst area', () => {
    const fx = team(-0.5);
    // The subject's own worst area is putting.
    const own = new TeamFixture();
    own.player('subject', tenRounds(2, { tee: -0.5, approach: -0.5, around: -0.5, putting: -2.5 }));
    for (let k = 0; k < 5; k++) own.player(`mate-${k}`, tenRounds(2, { tee: -0.5, approach: -3 - k * 0.1, around: -0.5, putting: -0.5 }));
    expect(read(own).priority).toMatchObject({ measure_id: 'strokes_gained_putting', team_shape: { team_worst_area: 'strokes_gained_approach', same_as_team: false, player_vs_team: { team_median: -0.5, verdict: 'worse' } } });
    expect(read(fx).priority).not.toBeNull();
  });

  it('carries the teammates\' season spread on the four areas only, and drops it with the other coach-only blocks', () => {
    const sheet = sheetOf(team(-4.5));
    const withSeason = sheet.measures.filter((m) => m.team_season !== undefined).map((m) => m.id);
    expect(withSeason).toEqual(['strokes_gained_off_the_tee', 'strokes_gained_approach', 'strokes_gained_around_the_green', 'strokes_gained_putting']);
    expect(sheet.measures.find((m) => m.id === 'strokes_gained_approach')!.team_season).toMatchObject({ audience: 'coach_only', window: 'season', n: 5, median: -3.2 });
    const safe = withoutCoachOnly(sheet);
    expect(JSON.stringify(safe)).not.toContain('mate-');
    expect(safe.measures.find((m) => m.id === 'strokes_gained_approach')!.team_season).toBeNull();
  });
});

describe('the two make-rate definitions', () => {
  const shot = (s: Partial<ShotRow>): ShotRow => ({
    id: 's',
    round_id: 'r',
    hole_id: null,
    shot_type: 'putting',
    lie_before: 'green',
    distance_to_hole_before: null,
    distance_unit_before: 'feet',
    distance_to_hole_after: null,
    distance_unit_after: 'feet',
    result: null,
    lie_after: null,
    putt_made: null,
    putt_distance_feet: null,
    ...s,
  });

  it('counts where the one definition and the Clubhouse Stats loader part', () => {
    const count = comparePuttDefinitions([
      // The same under both.
      shot({ distance_to_hole_before: 7, putt_distance_feet: 7, putt_made: true, result: 'hole' }),
      // The two distance columns disagree across a band edge: 5 feet is "3 to 5", 6 feet is "5 to 10".
      shot({ distance_to_hole_before: 5, putt_distance_feet: 6, putt_made: false }),
      // Holed by its result with putt_made false: a make under the one definition, a miss for the loader.
      shot({ distance_to_hole_before: 4, putt_distance_feet: 4, putt_made: false, result: 'hole' }),
      // Holed with putt_made never set: only the one definition counts it.
      shot({ distance_to_hole_before: 2, putt_distance_feet: 2, putt_made: null, result: 'hole' }),
      // No start distance: only the loader counts it.
      shot({ distance_to_hole_before: null, putt_distance_feet: 30, putt_made: false }),
      // A chip with a putt distance filled in: only the loader counts it.
      shot({ shot_type: 'around_green', distance_to_hole_before: 12, putt_distance_feet: 12, putt_made: true }),
      // Not a putt under either.
      shot({ shot_type: 'approach', distance_to_hole_before: 150 }),
    ]);
    expect(count).toMatchObject({ putts: 6, agree: 1, different_band: 1, different_result: 1, only_the_one_definition: 1, only_clubhouse: 2 });
    expect(count.bands.find((b) => b.band === '3_5')).toEqual({ band: '3_5', one_definition: { made: 1, attempts: 2 }, clubhouse: { made: 0, attempts: 1 } });
    expect(count.bands.find((b) => b.band === '5_10')).toEqual({ band: '5_10', one_definition: { made: 1, attempts: 1 }, clubhouse: { made: 1, attempts: 2 } });
  });

  it('agrees on every fixture putt, where both columns are filled the same', () => {
    const fx = new TeamFixture().player('p1', tenRounds(2, EVEN, () => ({ putts: [[4, true], [8, false], [30, false]] })));
    expect(comparePuttDefinitions(fx.shots)).toMatchObject({ putts: 30, agree: 30, different_band: 0, different_result: 0, only_the_one_definition: 0, only_clubhouse: 0 });
  });
});
