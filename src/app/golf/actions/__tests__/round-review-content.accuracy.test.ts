import { describe, it, expect } from 'vitest';
import {
  generateReviewContent,
  buildHoleBreakdowns,
  selectBaselineRounds,
  BASELINE_ROUND_LIMIT,
  type BaselineRoundRow,
} from '../round-review-content';
import type { ComparisonAverages, HoleBreakdown, RoundData, ShotRow } from '../round-review-system';

/**
 * CoachHelm deep audit rows 39, 42, 43 — round review accuracy.
 *
 *  - 39: the prior-20 baseline must drop test and non-countable rounds, and
 *    strokes-to-gain must come from the player's data (constants only as a
 *    labelled fallback).
 *  - 42: puttingBreakdown uses the one shared distance field and edges.
 *  - 43: the letter grade compares against a bounded reference (strokes and
 *    percentage points), not a percent of a possibly near-zero mean, and
 *    records whether it was graded against the player or a benchmark.
 */

function makeHole(overrides: Partial<HoleBreakdown> = {}): HoleBreakdown {
  return {
    hole: 1, par: 4, score: 4, scoreToPar: 0, putts: 2,
    fairwayHit: true, gir: true, threePutt: false, onePutt: false, penalties: 0,
    scrambleAttempt: false, scrambleSuccess: false, sandSaveAttempt: false, sandSaveSuccess: false,
    driveClub: null, driveDist: null, driveMiss: null, firstPuttFeet: null,
    approachClub: null, approachDist: null, approachMiss: null,
    ...overrides,
  };
}

function makeRound(overrides: Partial<RoundData> = {}): RoundData {
  return {
    id: 'r1', player_id: 'p1', course_name: 'Test GC', round_date: '2026-06-15',
    total_score: 72, score_to_par: 0, total_putts: 30,
    total_fairways_hit: 7, total_fairways: 14, total_gir: 9, total_gir_possible: 18,
    holes_played: 18, status: 'completed',
    ...overrides,
  };
}

function avgs(overrides: Partial<ComparisonAverages> = {}): ComparisonAverages {
  return { avgScore: 72, avgScoreToPar: 0, avgPutts: 30, avgGirPct: 50, avgFairwayPct: 50, ...overrides };
}

// ───────────────────────────── Row 39: baseline ─────────────────────────────

function baselineRow(overrides: Partial<BaselineRoundRow> = {}): BaselineRoundRow {
  return {
    id: 'b', total_score: 76, score_to_par: 4, total_putts: 31,
    total_gir: 9, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14,
    holes_played: 18, front_nine: 38, back_nine: 38, is_test: false,
    ...overrides,
  };
}

describe('selectBaselineRounds (row 39)', () => {
  it('drops test rounds', () => {
    const out = selectBaselineRounds([baselineRow({ id: 'real' }), baselineRow({ id: 'test', is_test: true })]);
    expect(out.map((r) => r.id)).toEqual(['real']);
  });

  it('drops rounds the countable-round rule rejects', () => {
    const out = selectBaselineRounds([
      baselineRow({ id: 'ok18' }),
      baselineRow({ id: 'ok9', holes_played: 9, total_score: 38, score_to_par: 2, total_putts: 15, front_nine: 38, back_nine: null }),
      baselineRow({ id: 'holes-missing', back_nine: null }),
      baselineRow({ id: 'implausible', total_score: 37, front_nine: 18, back_nine: 19, total_putts: 18 }),
      baselineRow({ id: 'odd-length', holes_played: 12 }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['ok18', 'ok9']);
  });

  it('keeps caller order and caps at the baseline limit AFTER filtering', () => {
    const rows = [
      baselineRow({ id: 'test-first', is_test: true }),
      ...Array.from({ length: 25 }, (_, i) => baselineRow({ id: `r${i}` })),
    ];
    const out = selectBaselineRounds(rows);
    expect(BASELINE_ROUND_LIMIT).toBe(20);
    expect(out).toHaveLength(20);
    expect(out[0]!.id).toBe('r0');
    expect(out[19]!.id).toBe('r19');
  });
});

// ─────────────────────────── Row 43: letter grade ───────────────────────────

describe('overall grade — bounded reference (row 43)', () => {
  it('near-zero average: one stroke over a +0.2 average is an ordinary round, not an F-factor', () => {
    // Old algorithm: (1 - 0.2) / 0.2 = +400% worse -> score factor 1 -> D.
    const c = generateReviewContent(makeRound({ score_to_par: 1, total_score: 73 }), [], avgs({ avgScoreToPar: 0.2 }));
    expect(c.overallGrade).toBe('C');
    expect(c.gradeBasis).toBe('player');
  });

  it('near-zero average: the same letter for +0.2 and -0.2 averages (no sign blow-up)', () => {
    const r = makeRound({ score_to_par: 1, total_score: 73 });
    expect(generateReviewContent(r, [], avgs({ avgScoreToPar: -0.2 })).overallGrade)
      .toBe(generateReviewContent(r, [], avgs({ avgScoreToPar: 0.2 })).overallGrade);
  });

  it('pins an A for a round clearly better than the player on every factor', () => {
    const c = generateReviewContent(
      makeRound({ score_to_par: -4, total_score: 68, total_gir: 12, total_fairways_hit: 10, total_putts: 28 }),
      [],
      avgs({ avgScoreToPar: 5, avgGirPct: 50, avgFairwayPct: 57, avgPutts: 31 }),
    );
    expect(c.overallGrade).toBe('A');
    expect(c.gradeBasis).toBe('player');
  });

  it('pins an F for a round clearly worse than the player on every factor', () => {
    const c = generateReviewContent(
      makeRound({ score_to_par: 12, total_score: 84, total_gir: 6, total_fairways_hit: 5, total_putts: 34 }),
      [],
      avgs({ avgScoreToPar: 6, avgGirPct: 50, avgFairwayPct: 50, avgPutts: 31 }),
    );
    expect(c.overallGrade).toBe('F');
  });

  it('pins a C for a round at the player\'s own averages', () => {
    const c = generateReviewContent(makeRound({ score_to_par: 6, total_score: 78 }), [], avgs({ avgScoreToPar: 6 }));
    expect(c.overallGrade).toBe('C');
  });

  it('grades a 9-hole round per 18 holes against the 18-hole average', () => {
    // +3 over 9 holes = +6 per 18, exactly the player's +6 average.
    const c = generateReviewContent(
      makeRound({ holes_played: 9, score_to_par: 3, total_score: 39, total_putts: 15, total_gir: 4, total_gir_possible: 9, total_fairways_hit: 3, total_fairways: 7 }),
      [],
      avgs({ avgScoreToPar: 6, avgPutts: 30, avgGirPct: 44, avgFairwayPct: 43 }),
    );
    expect(c.overallGrade).toBe('C');
  });

  it('labels a benchmark-graded review and keeps the benchmark letters', () => {
    const c = generateReviewContent(makeRound({ score_to_par: 0, total_fairways_hit: 8, total_putts: 31 }), [], null);
    // to-par 0 -> 3.5 (x2), GIR 50% -> 3, FW 57% -> 3, putts 31 -> 3 => 16/5 = 3.2 -> C
    expect(c.overallGrade).toBe('C');
    expect(c.gradeBasis).toBe('benchmark');
  });
});

// ───────────────────────── Row 39: strokes to gain ─────────────────────────

describe('strokes to gain — player-derived (row 39)', () => {
  it('counts each three-putt as exactly one stroke (turning it into a two-putt)', () => {
    const holes = Array.from({ length: 18 }, (_, i) =>
      makeHole({ hole: i + 1, threePutt: i < 2, putts: i < 2 ? 3 : 2, firstPuttFeet: i === 0 ? 40 : i === 1 ? 6 : null }),
    );
    const c = generateReviewContent(makeRound(), holes, null);
    const putting = c.strokesToGain.find((s) => s.category === 'Putting')!;
    expect(putting.potentialStrokes).toBe(2);
    expect(putting.basis).toBe('exact');
  });

  it('values extra greens from this round\'s own GIR vs non-GIR scoring and targets the player\'s GIR average', () => {
    // 6 GIR holes at par, 12 missed-green holes at bogey => 1.0 stroke per extra green.
    const holes = Array.from({ length: 18 }, (_, i) =>
      makeHole({ hole: i + 1, gir: i < 6, score: i < 6 ? 4 : 5, scoreToPar: i < 6 ? 0 : 1, scrambleAttempt: i >= 6 }),
    );
    const c = generateReviewContent(
      makeRound({ total_gir: 6, total_score: 84, score_to_par: 12 }),
      holes,
      avgs({ avgGirPct: 61 }),
    );
    const approach = c.strokesToGain.find((s) => s.category === 'Approach Shots')!;
    // target round(18 * 0.61) = 11 greens -> 5 more x 1.0
    expect(approach.potentialStrokes).toBe(5);
    expect(approach.basis).toBe('player');
    expect(approach.description).toMatch(/your 61% average/);
  });

  it('falls back to the fixed GIR constants when the player data cannot support an estimate, and says so', () => {
    const c = generateReviewContent(makeRound({ total_gir: 6 }), [], null);
    const approach = c.strokesToGain.find((s) => s.category === 'Approach Shots')!;
    // benchmark: target 50% of 18 = 9 -> 3 more x 0.7
    expect(approach.potentialStrokes).toBe(2.1);
    expect(approach.basis).toBe('benchmark');
    expect(approach.description).toMatch(/typical/i);
  });

  it('claims no approach opportunity when the round already beat the player\'s GIR average', () => {
    const c = generateReviewContent(makeRound({ total_gir: 8 }), [], avgs({ avgGirPct: 40 }));
    expect(c.strokesToGain.find((s) => s.category === 'Approach Shots')).toBeUndefined();
  });

  it('marks the scramble estimate as a benchmark (no per-player scramble baseline exists)', () => {
    const holes = Array.from({ length: 18 }, (_, i) =>
      makeHole({ hole: i + 1, gir: false, scrambleAttempt: true, scrambleSuccess: i < 3, scoreToPar: i < 3 ? 0 : 1, score: i < 3 ? 4 : 5 }),
    );
    const c = generateReviewContent(makeRound(), holes, null);
    const sg = c.strokesToGain.find((s) => s.category === 'Short Game');
    expect(sg?.basis).toBe('benchmark');
  });
});

// ─────────────────────── Row 42: putting breakdown field ───────────────────────

function putt(overrides: Partial<ShotRow>): ShotRow {
  return {
    hole_number: 1, shot_number: 2, shot_type: 'putting', club_type: 'putter',
    distance_to_hole_before: null, distance_unit_before: 'feet', result: null,
    lie_before: 'green', lie_after: 'green', miss_direction: null,
    putt_distance_feet: null, shot_distance: null, is_penalty: false, putt_made: false,
    ...overrides,
  };
}

describe('puttingBreakdown — shared distance field and edges (row 42)', () => {
  it('buckets on the shared edges from distance_to_hole_before (yards converted), not putt_distance_feet', () => {
    const shots: ShotRow[] = [
      putt({ distance_to_hole_before: '2', putt_distance_feet: '30', putt_made: true, result: 'hole' }),
      putt({ distance_to_hole_before: '4', putt_distance_feet: '4' }),
      putt({ distance_to_hole_before: '4', distance_unit_before: 'yards', putt_distance_feet: '4', putt_made: true, result: 'hole' }),
      putt({ distance_to_hole_before: '30', putt_distance_feet: '2' }),
    ];
    const c = generateReviewContent(makeRound(), [], null, shots);
    const byLabel = Object.fromEntries(c.puttingBreakdown.ranges.map((r) => [r.label, r]));
    expect(c.puttingBreakdown.ranges.map((r) => r.label)).toEqual([
      '0–3 ft', '3–5 ft', '5–10 ft', '10–15 ft', '15–25 ft', '25+ ft',
    ]);
    expect(byLabel['0–3 ft']!.attempts).toBe(1);
    expect(byLabel['0–3 ft']!.made).toBe(1);
    expect(byLabel['3–5 ft']!.attempts).toBe(1);
    expect(byLabel['10–15 ft']!.attempts).toBe(1); // 4 yd = 12 ft
    expect(byLabel['25+ ft']!.attempts).toBe(1);
  });

  it('reads the first-putt distance from the same field', () => {
    const shots: ShotRow[] = [
      { ...putt({}), shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: '150', distance_unit_before: 'yards', lie_after: 'green', result: 'green' },
      putt({ shot_number: 2, distance_to_hole_before: '9', putt_distance_feet: '20' }),
      putt({ shot_number: 3, distance_to_hole_before: '1', putt_distance_feet: '1', putt_made: true, result: 'hole' }),
    ];
    const holes = buildHoleBreakdowns(shots, makeRound({ total_score: null }), [
      { hole_number: 1, par: 3, score: 3, putts: 2, fairway_hit: null, gir: true },
    ]);
    expect(holes[0]!.firstPuttFeet).toBe(9);
  });
});
