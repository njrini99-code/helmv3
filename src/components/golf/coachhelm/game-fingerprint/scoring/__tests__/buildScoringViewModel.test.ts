import { describe, expect, it } from 'vitest';
import { computeParOpportunities } from '@/lib/coachhelm/v3/metrics/par-opportunities';
import {
  scope,
  par5Play,
  PAR3_ALL_ONLY_HOLES,
  PAR4_MID_BAND_HOLES,
} from '@/test/coachhelm/v3/fixtures/par-opportunities-fixtures';
import { buildScoringViewModel } from '../buildScoringViewModel';

describe('buildScoringViewModel', () => {
  it('groups par_length_scoring rows by par, with an "all" row plus any length band that clears its own sample floor', () => {
    // Par 4: 5 holes at 400 yd — clears the 5-hole floor on its own, so
    // both 'all' and the 380-429 yd 'mid' band are emitted (supported).
    // Par 3: 2 holes, no yardage — well under floor, 'all' only, insufficient.
    const holes = [...PAR4_MID_BAND_HOLES, ...PAR3_ALL_ONLY_HOLES];
    const results = computeParOpportunities([], holes, scope('p1'));
    const vm = buildScoringViewModel(results);

    expect(vm.parSections.map((s) => s.par)).toEqual([3, 4]);

    const par3 = vm.parSections.find((s) => s.par === 3);
    expect(par3!.rows.map((r) => r.lengthGroup)).toEqual(['all']);
    expect(par3!.rows[0]!.kind).toBe('insufficient');
    expect(par3!.rows[0]!.label).toBe('All');

    const par4 = vm.parSections.find((s) => s.par === 4);
    expect(par4!.rows.map((r) => r.lengthGroup)).toEqual(['all', 'mid']);
    expect(par4!.rows.every((r) => r.kind === 'supported')).toBe(true);
    // 400 yd falls in par 4's mid band (380-429).
    expect(par4!.rows.find((r) => r.lengthGroup === 'mid')!.label).toBe('380-429 yd');
    // Average strokes-relative-to-par across the 5 holes: (0+1+0+1+0)/5.
    expect(par4!.rows[0]!.row.value).toBe(0.4);
  });

  it('groups par-5 specific-hole rows by course+hole identity, one card per hole, in fixed metric order', () => {
    // Course A hole 7: three plays, all reach the green in regulation (shot 3)
    // — eligible (3) clears HOLE_OPPORTUNITY_MIN_SAMPLE_N (3) -> supported.
    const supported = [
      par5Play({ round_id: 'a-r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
      par5Play({ round_id: 'a-r2', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 1 }),
      par5Play({ round_id: 'a-r3', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
    ];
    // Course B hole 9: only one play, but it DOES reach the green in
    // regulation (shot 3, par - 2 = 3) so all three metrics get a nonzero
    // denominator — eligible/created = 1, under HOLE_OPPORTUNITY_MIN_SAMPLE_N
    // (3), so every row is 'insufficient' rather than 'invalid' (which would
    // instead mean zero evidence, a different case this test isn't after).
    const thin = [par5Play({ round_id: 'b-r1', course_id: 'course-b', hole_number: 9, greenShotNumber: 3, putts: 2 })];

    const holes = [...supported, ...thin].map((p) => p.hole);
    const facts = [...supported, ...thin].flatMap((p) => p.facts);
    const results = computeParOpportunities(facts, holes, scope('p1'));
    const vm = buildScoringViewModel(results);

    // Sorted by hole number: hole 7 before hole 9.
    expect(vm.par5Holes.map((h) => h.holeNumber)).toEqual([7, 9]);

    const hole7 = vm.par5Holes.find((h) => h.courseHoleKey === 'course-a:7');
    expect(hole7!.label).toBe('Hole 7');
    expect(hole7!.rows.map((r) => r.metricId)).toEqual([
      'par5_regulation_opportunity_rate',
      'par5_green_in_two_rate',
      'par5_putting_conversion_rate',
    ]);
    expect(hole7!.rows.every((r) => r.kind === 'supported')).toBe(true);
    // All 3 plays reached the green in regulation (shot 3, par - 2 = 3).
    expect(hole7!.rows[0]!.row.value).toBe(100);

    const hole9 = vm.par5Holes.find((h) => h.courseHoleKey === 'course-b:9');
    expect(hole9!.rows.every((r) => r.kind === 'insufficient')).toBe(true);
  });

  it('resolves a par-5 card\'s courseLabel from courseNameById, falling back to a short id fragment when a name is missing', () => {
    const play = par5Play({ round_id: 'r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 });
    const results = computeParOpportunities(play.facts, [play.hole], scope('p1'));

    const resolved = buildScoringViewModel(results, { 'course-a': 'Pinehurst No. 2' });
    expect(resolved.par5Holes[0]!.courseLabel).toBe('Pinehurst No. 2');

    const unresolved = buildScoringViewModel(results, {});
    expect(unresolved.par5Holes[0]!.courseLabel).toBe('Course course-a');
    expect(unresolved.par5Holes[0]!.courseId).toBe('course-a');
  });

  it('does not conflate the same hole number at two different courses into one card', () => {
    // Mirrors A3's own two-courses-same-hole-number fixture
    // (par-opportunities.test.ts): course A hole 7 always reaches the green
    // in regulation, course B hole 7 never does — a naive hole_number-only
    // grouping would average these into one misleading finding.
    const a = [
      par5Play({ round_id: 'a-r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
      par5Play({ round_id: 'a-r2', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 1 }),
      par5Play({ round_id: 'a-r3', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 }),
    ];
    const b = [
      par5Play({ round_id: 'b-r1', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 }),
      par5Play({ round_id: 'b-r2', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 }),
      par5Play({ round_id: 'b-r3', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 }),
    ];
    const holes = [...a, ...b].map((p) => p.hole);
    const facts = [...a, ...b].flatMap((p) => p.facts);
    const results = computeParOpportunities(facts, holes, scope('p1'));
    const vm = buildScoringViewModel(results, { 'course-a': 'Course A', 'course-b': 'Course B' });

    // Two distinct cards, both labeled "Hole 7", disambiguated by courseLabel.
    const bothHole7 = vm.par5Holes.filter((h) => h.holeNumber === 7);
    expect(bothHole7).toHaveLength(2);
    expect(bothHole7.map((h) => h.courseLabel).sort()).toEqual(['Course A', 'Course B']);

    const courseA = vm.par5Holes.find((h) => h.courseHoleKey === 'course-a:7');
    const courseB = vm.par5Holes.find((h) => h.courseHoleKey === 'course-b:7');
    expect(courseA!.rows[0]!.row.value).toBe(100);
    expect(courseB!.rows[0]!.row.value).toBe(0);
  });

  it('returns empty sections for an empty input, never a fabricated placeholder', () => {
    const vm = buildScoringViewModel([]);
    expect(vm.parSections).toEqual([]);
    expect(vm.par5Holes).toEqual([]);
  });
});
