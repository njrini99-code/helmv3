import { describe, expect, it } from 'vitest';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import { computeParOpportunities } from '@/lib/coachhelm/v3/metrics/par-opportunities';

/**
 * A3 (repair-plan addendum §13) — par/length scoring + par-5 first-putt
 * opportunity metrics. See `metrics/par-opportunities.ts`'s file header for
 * the two-family design (identity-agnostic par/length aggregate vs
 * specific-hole opportunity/conversion rates).
 */

function scope(overrides: Partial<AnalysisScope> = {}): AnalysisScope {
  return {
    player_id: 'p-1',
    window_start: null,
    window_end: null,
    analysis_cutoff: '2026-12-31T00:00:00.000Z',
    ...overrides,
  };
}

function hole(overrides: Partial<HoleContext> & Pick<HoleContext, 'round_id' | 'hole_number' | 'par' | 'total_strokes'>): HoleContext {
  return {
    course_id: null,
    penalty_strokes: 0,
    putts: 2,
    gir: null,
    yardage: null,
    ...overrides,
  };
}

function shot(overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): ShotFact {
  return {
    shot_type: 'unknown',
    club_type: null,
    intent: 'unknown',
    distance_to_hole_before_feet: null,
    distance_to_hole_after_feet: null,
    lie_before: null,
    lie_after: null,
    result: null,
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    observed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A par-5 play: reaches the green at `greenShotNumber`, then holes out with
 *  `putts` putts. Total recorded shots = greenShotNumber + putts, which must
 *  equal `totalStrokes`. `putts: 0` means the green-reaching shot itself
 *  holed out directly (an albatross via a holed 2nd shot, an eagle via a
 *  holed 3rd-shot chip-in) — the shot's `result` is `'hole'` rather than
 *  `'green'`, and no separate putting shots are appended. */
function par5Play(opts: {
  round_id: string;
  course_id: string | null;
  hole_number: number;
  greenShotNumber: number;
  putts: 0 | 1 | 2 | 3;
  penaltyAtShot?: number;
}): { hole: HoleContext; facts: ShotFact[] } {
  const { round_id, course_id, hole_number, greenShotNumber, putts, penaltyAtShot } = opts;
  const totalStrokes = greenShotNumber + putts;
  const facts: ShotFact[] = [];
  for (let n = 1; n <= greenShotNumber; n++) {
    const isGreenShot = n === greenShotNumber;
    facts.push(
      shot({
        round_id,
        hole_number,
        shot_number: n,
        shot_type: n === penaltyAtShot ? 'unknown' : n === 1 ? 'tee' : 'approach',
        is_penalty: n === penaltyAtShot,
        result: isGreenShot ? (putts === 0 ? 'hole' : 'green') : 'fairway',
      }),
    );
  }
  for (let p = 1; p <= putts; p++) {
    const shotNumber = greenShotNumber + p;
    facts.push(
      shot({
        round_id,
        hole_number,
        shot_number: shotNumber,
        shot_type: 'putting',
        club_type: 'putter',
        intent: 'putt',
        result: p === putts ? 'hole' : null,
        putt_made: p === putts,
      }),
    );
  }
  return {
    hole: hole({
      round_id,
      course_id,
      hole_number,
      par: 5,
      total_strokes: totalStrokes,
      penalty_strokes: penaltyAtShot ? 1 : 0,
      putts,
    }),
    facts,
  };
}

describe('computeParOpportunities — par5 opportunity/conversion identity', () => {
  it('does not combine Course A hole 7 and Course B hole 7 into one specific-hole finding', () => {
    // Course A hole 7: reaches green in regulation (3) every play, converts
    // birdie once — the real signal a naive hole_number-only grouping would
    // dilute against course B's very different pattern.
    const a1 = par5Play({ round_id: 'a-r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 1 });
    const a2 = par5Play({ round_id: 'a-r2', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 });
    // Course B hole 7: never reaches green in regulation (lays up, long
    // approach) — opportunity rate should read 0%, never averaged with A's.
    const b1 = par5Play({ round_id: 'b-r1', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 });
    const b2 = par5Play({ round_id: 'b-r2', course_id: 'course-b', hole_number: 7, greenShotNumber: 4, putts: 2 });

    const holes = [a1.hole, a2.hole, b1.hole, b2.hole];
    const facts = [...a1.facts, ...a2.facts, ...b1.facts, ...b2.facts];
    const s = scope();
    const results = computeParOpportunities(facts, holes, s);

    const opp = results.filter((r) => r.metricId === 'par5_regulation_opportunity_rate');
    expect(opp).toHaveLength(2);

    const courseA = opp.find((r) => r.dimensions.course_hole_key === 'course-a:7');
    const courseB = opp.find((r) => r.dimensions.course_hole_key === 'course-b:7');
    expect(courseA).toBeDefined();
    expect(courseB).toBeDefined();
    // No combined finding: each course's hole 7 keeps its own extreme rate.
    expect(courseA!.value).toBe(100);
    expect(courseB!.value).toBe(0);

    const conv = results.filter((r) => r.metricId === 'par5_putting_conversion_rate');
    const convA = conv.find((r) => r.dimensions.course_hole_key === 'course-a:7');
    // 1 of 2 opportunities converted to birdie.
    expect(convA!.value).toBe(50);
  });

  it('excludes a round logged without a course_id from the specific-hole family, but keeps it in par/length aggregate', () => {
    const identified = par5Play({ round_id: 'r1', course_id: 'course-a', hole_number: 7, greenShotNumber: 3, putts: 2 });
    const noCourse = par5Play({ round_id: 'r2', course_id: null, hole_number: 7, greenShotNumber: 3, putts: 2 });

    const holes = [identified.hole, noCourse.hole];
    const facts = [...identified.facts, ...noCourse.facts];
    const results = computeParOpportunities(facts, holes, scope());

    const opp = results.filter((r) => r.metricId === 'par5_regulation_opportunity_rate');
    // Only the identified hole gets a specific-hole row.
    expect(opp).toHaveLength(1);
    expect(opp[0]!.observedCount).toBe(1);

    // Both holes (identified + course-less) still count toward the par-5
    // par/length aggregate — identity is not required there.
    const par5All = results.find((r) => r.metricId === 'par_length_scoring' && r.dimensions.par === 5 && r.dimensions.length_group === 'all');
    expect(par5All).toBeDefined();
    expect(par5All!.denominator).toBe(2);
  });

  it('accounts for total strokes: a penalty pushes the green-finding shot past regulation', () => {
    // Tee (1) -> hazard, penalty drop (2, is_penalty), recovery reaches green
    // (3rd RECORDED shot but golf's own "hitting your 4th" convention — the
    // penalty stroke is a real stroke), 1-putt (4) => total 4... make it a
    // clean disqualifying case: green reached at shot 4 (informally "the
    // shot after the drop"), 1-putt for par (5 total on a par 5).
    const play = par5Play({
      round_id: 'r-penalty',
      course_id: 'course-p',
      hole_number: 9,
      greenShotNumber: 4,
      putts: 1,
      penaltyAtShot: 2,
    });
    const results = computeParOpportunities(play.facts, [play.hole], scope());
    const opp = results.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    expect(opp!.value).toBe(0); // green reached on the 4th recorded stroke, par - 2 = 3
  });

  it('excludes an incomplete sequence from eligible/observed rather than guessing an opportunity', () => {
    // Missing the putt-out row entirely — buildHoleSequence must report
    // incomplete, and the opportunity metric must not guess at it.
    const play = par5Play({ round_id: 'r-incomplete', course_id: 'course-q', hole_number: 4, greenShotNumber: 3, putts: 2 });
    const truncatedFacts = play.facts.slice(0, -1); // drop the final holed putt
    const results = computeParOpportunities(truncatedFacts, [play.hole], scope());
    const opp = results.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    expect(opp!.eligibleCount).toBe(0);
    expect(opp!.value).toBeNull();
    expect(opp!.exclusions.incomplete_sequence).toBe(1);
  });

  it('reports green-in-two as a narrower, distinct rate from regulation opportunity and conversion', () => {
    // Play 1: green in two (eagle look) — reaches green at shot 2, 2-putt eagle.
    const eagle = par5Play({ round_id: 'r-e2', course_id: 'course-g2', hole_number: 15, greenShotNumber: 2, putts: 2 });
    // Play 2: regulation only — reaches green at shot 3 (not two), 2-putt par.
    const regOnly = par5Play({ round_id: 'r-reg', course_id: 'course-g2', hole_number: 15, greenShotNumber: 3, putts: 2 });

    const holes = [eagle.hole, regOnly.hole];
    const facts = [...eagle.facts, ...regOnly.facts];
    const results = computeParOpportunities(facts, holes, scope());

    const opp = results.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    const g2 = results.find((r) => r.metricId === 'par5_green_in_two_rate');
    const conv = results.find((r) => r.metricId === 'par5_putting_conversion_rate');

    expect(opp!.value).toBe(100); // both reached in regulation-or-better
    expect(g2!.value).toBe(50); // only the first reached in two
    // Conversion is birdie-or-better among regulation opportunities, not
    // gated by green-in-two: play 1 (eagle, total_strokes 4) converts,
    // play 2 (par, total_strokes 5) does not.
    expect(conv!.value).toBe(50);
  });

  it('counts a holed-out 2nd shot (albatross) as reaching the green, not a miss', () => {
    // No 'green'/'gir' result is ever logged — the ball goes straight in
    // from the fairway. reachedGreen must still match via result === 'hole'.
    const albatross = par5Play({ round_id: 'r-alb', course_id: 'course-h', hole_number: 11, greenShotNumber: 2, putts: 0 });
    const results = computeParOpportunities(albatross.facts, [albatross.hole], scope());
    const opp = results.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    const g2 = results.find((r) => r.metricId === 'par5_green_in_two_rate');
    const conv = results.find((r) => r.metricId === 'par5_putting_conversion_rate');
    expect(opp!.value).toBe(100); // holed at shot 2 <= par - 2 (3)
    expect(g2!.value).toBe(100); // holed at shot 2 <= par - 3 (2) — the best possible outcome
    expect(conv!.value).toBe(100); // total_strokes 2, par 5 -> -3, birdie-or-better
  });

  it('counts a holed-out 3rd shot (eagle chip-in) as reaching the green, regulation but not green-in-two', () => {
    const eagle = par5Play({ round_id: 'r-eag', course_id: 'course-h', hole_number: 11, greenShotNumber: 3, putts: 0 });
    const results = computeParOpportunities(eagle.facts, [eagle.hole], scope());
    const opp = results.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    const g2 = results.find((r) => r.metricId === 'par5_green_in_two_rate');
    const conv = results.find((r) => r.metricId === 'par5_putting_conversion_rate');
    expect(opp!.value).toBe(100); // holed at shot 3 <= par - 2 (3) — regulation
    expect(g2!.value).toBe(0); // shot 3 > par - 3 (2) — not green-in-two
    expect(conv!.value).toBe(100); // total_strokes 3, par 5 -> -2, birdie-or-better
  });
});

describe('computeParOpportunities — par/length scoring aggregate', () => {
  it('retains the par aggregate when a band cannot support enough holes on its own', () => {
    // 165yd -> 'mid' band (150-189), 190yd -> 'long' band (190+). Only 1
    // hole each, under PAR_LENGTH_MIN_SAMPLE_N (5) — no band row, only 'all'.
    const holes: HoleContext[] = [
      hole({ round_id: 'r1', hole_number: 3, par: 3, total_strokes: 3, yardage: 165 }),
      hole({ round_id: 'r2', hole_number: 6, par: 3, total_strokes: 4, yardage: 190 }),
    ];
    const results = computeParOpportunities([], holes, scope());
    const par3Rows = results.filter((r) => r.metricId === 'par_length_scoring' && r.dimensions.par === 3);
    expect(par3Rows).toHaveLength(1); // only 'all'
    expect(par3Rows[0]!.dimensions.length_group).toBe('all');
    expect(par3Rows[0]!.value).toBeCloseTo((0 + 1) / 2);
  });

  it('uses constant, versioned band boundaries once each band clears the sample floor', () => {
    // Par 4 bands: short <380, mid 380-429, long 430+ (PAR_LENGTH_BAND_VERSION).
    const short = [350, 360, 365, 370, 378];
    const mid = [390, 400, 410, 420, 425];
    const long = [430, 440, 450, 460, 470];
    const holes: HoleContext[] = [...short, ...mid, ...long].map((y, i) =>
      hole({ round_id: `r${i}`, hole_number: i + 1, par: 4, total_strokes: 4, yardage: y }),
    );
    const results = computeParOpportunities([], holes, scope());
    const rows = results.filter((r) => r.metricId === 'par_length_scoring' && r.dimensions.par === 4);
    const all = rows.find((r) => r.dimensions.length_group === 'all');
    const shortRow = rows.find((r) => r.dimensions.length_group === 'short');
    const midRow = rows.find((r) => r.dimensions.length_group === 'mid');
    const longRow = rows.find((r) => r.dimensions.length_group === 'long');
    expect(all!.denominator).toBe(15);
    expect(shortRow!.denominator).toBe(5);
    expect(midRow!.denominator).toBe(5);
    expect(longRow!.denominator).toBe(5);
    expect(shortRow!.dimensions.band_max_yards).toBe(379);
    expect(midRow!.dimensions.band_min_yards).toBe(380);
    expect(midRow!.dimensions.band_max_yards).toBe(429);
    expect(longRow!.dimensions.band_min_yards).toBe(430);
    expect(longRow!.dimensions.band_max_yards).toBeUndefined(); // no upper bound
    for (const r of [shortRow, midRow, longRow]) {
      expect(r!.dimensions.band_version).toBe('par-length-bands-v1');
    }
  });

  it('folds an under-supported band back into the broad aggregate rather than emitting a thin row', () => {
    // 4 holes in the 'long' band (430+) — one short of PAR_LENGTH_MIN_SAMPLE_N.
    const holes: HoleContext[] = [430, 440, 450, 460].map((y, i) =>
      hole({ round_id: `r${i}`, hole_number: i + 1, par: 4, total_strokes: 5, yardage: y }),
    );
    const results = computeParOpportunities([], holes, scope());
    const rows = results.filter((r) => r.metricId === 'par_length_scoring' && r.dimensions.par === 4);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dimensions.length_group).toBe('all');
    expect(rows[0]!.denominator).toBe(4);
  });

  it('band boundaries are constant and never vary with the scope object passed in', () => {
    // Same UNFILTERED `holes` array passed to both calls on purpose — this
    // function does not, and cannot, filter `holes` by scope (see
    // computeParLengthScoring's SCOPE CONTRACT doc comment; HoleContext has
    // no date field). This test only proves the band boundaries themselves
    // are compile-time constants, not that holes get scoped differently —
    // scoping `holes` per window/cutoff is the caller's (loader's) job.
    const holes: HoleContext[] = [390, 400, 410, 420, 425].map((y, i) =>
      hole({ round_id: `r${i}`, hole_number: i + 1, par: 4, total_strokes: 4, yardage: y }),
    );
    const lifetime = scope({ window_start: null, window_end: null });
    const recent = scope({ window_start: '2026-01-01', window_end: '2026-12-31' });
    const lifetimeMid = computeParOpportunities([], holes, lifetime).find(
      (r) => r.metricId === 'par_length_scoring' && r.dimensions.length_group === 'mid',
    );
    const recentMid = computeParOpportunities([], holes, recent).find(
      (r) => r.metricId === 'par_length_scoring' && r.dimensions.length_group === 'mid',
    );
    expect(lifetimeMid!.dimensions.band_min_yards).toBe(recentMid!.dimensions.band_min_yards);
    expect(lifetimeMid!.dimensions.band_max_yards).toBe(recentMid!.dimensions.band_max_yards);
    expect(lifetimeMid!.dimensions.band_version).toBe(recentMid!.dimensions.band_version);
  });

  it('does not require course_id for the par/length aggregate (identity-agnostic)', () => {
    const holes: HoleContext[] = [
      hole({ round_id: 'r1', hole_number: 5, par: 4, total_strokes: 5, course_id: null }),
      hole({ round_id: 'r2', hole_number: 5, par: 4, total_strokes: 4, course_id: null }),
    ];
    const results = computeParOpportunities([], holes, scope());
    const par4All = results.find((r) => r.metricId === 'par_length_scoring' && r.dimensions.par === 4 && r.dimensions.length_group === 'all');
    expect(par4All!.denominator).toBe(2);
  });
});

describe('computeParOpportunities — lifetime/recent/as-of consistency', () => {
  it('as-of cutoff excludes a shot observed after it, even when inside the window', () => {
    const play = par5Play({ round_id: 'r-cutoff', course_id: 'course-z', hole_number: 2, greenShotNumber: 3, putts: 2 });
    // Push the final putt's observed_at past the cutoff.
    const lateFacts = play.facts.map((f, i) =>
      i === play.facts.length - 1 ? { ...f, observed_at: '2026-09-01T00:00:00.000Z' } : f,
    );
    const narrowScope = scope({
      window_start: '2026-01-01',
      window_end: '2026-12-31',
      analysis_cutoff: '2026-08-01T00:00:00.000Z', // before the late shot
    });
    const results = computeParOpportunities(lateFacts, [play.hole], narrowScope);
    const opp = results.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    // The final holing putt is cut off, so the sequence can't terminate —
    // incomplete, not a guessed opportunity.
    expect(opp!.eligibleCount).toBe(0);
    expect(opp!.exclusions.incomplete_sequence).toBe(1);
  });

  it('a lifetime scope (no window bounds) includes the same play a recent window would exclude', () => {
    const play = par5Play({ round_id: 'r-old', course_id: 'course-z', hole_number: 2, greenShotNumber: 3, putts: 2 });
    const oldFacts = play.facts.map((f) => ({ ...f, observed_at: '2026-01-05T00:00:00.000Z' }));

    const lifetime = scope({ window_start: null, window_end: null, analysis_cutoff: '2026-12-31T00:00:00.000Z' });
    const recent = scope({ window_start: '2026-06-01', window_end: '2026-12-31', analysis_cutoff: '2026-12-31T00:00:00.000Z' });

    const lifetimeResults = computeParOpportunities(oldFacts, [play.hole], lifetime);
    const recentResults = computeParOpportunities(oldFacts, [play.hole], recent);

    const lifetimeOpp = lifetimeResults.find((r) => r.metricId === 'par5_regulation_opportunity_rate');
    const recentOpp = recentResults.find((r) => r.metricId === 'par5_regulation_opportunity_rate');

    expect(lifetimeOpp!.eligibleCount).toBe(1); // January shots are in scope lifetime
    expect(recentOpp!.eligibleCount).toBe(0); // excluded by the June-start window
    // ALL of this play's facts (every one dated January) fall outside the
    // recent window — a scope decision, not a broken/missing sequence, so
    // this is `out_of_scope`, distinct from `incomplete_sequence` (see the
    // as-of cutoff test above, where only ONE fact is excluded and the
    // remaining partial sequence is genuinely incomplete).
    expect(recentOpp!.exclusions.out_of_scope).toBe(1);
    expect(recentOpp!.exclusions.incomplete_sequence).toBeUndefined();
  });
});
