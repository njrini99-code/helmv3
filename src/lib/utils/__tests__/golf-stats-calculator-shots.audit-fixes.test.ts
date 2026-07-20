import { describe, it, expect } from 'vitest';
import { calculateStatsFromShots } from '../golf-stats-calculator-shots';
import type { RawShot, HoleInfo } from '../golf-stats-calculator-shots';
import {
  makeRawShot,
  makeHoleInfo,
  makeRoundInfo,
  par4BirdieRawShots,
  par4BogeyRawShots,
  par3GirRawShots,
  sandSaveRawShots,
  threePuttRawShots,
} from '@/test/fixtures/golf-shots';

/**
 * Regression tests for the 2026-06-08 stats-correctness audit fixes. Each test
 * pins a fix so the bug class cannot silently return. See branch
 * fix/stats-correctness-audit.
 */

const round = makeRoundInfo({ id: 'round-1', holes_played: 18 });

describe('audit fix B — 18-hole normalization (girPerRound / penaltiesPerRound)', () => {
  it('girPerRound normalizes by holes played, not raw round count (9-hole round)', () => {
    // 9-hole round: 5 GIR holes + 4 missed-GIR. girTotal=5, holesPlayed=9.
    const shots: RawShot[] = [];
    for (let h = 1; h <= 5; h++) shots.push(...par4BirdieRawShots(h)); // GIR
    for (let h = 6; h <= 9; h++) shots.push(...par4BogeyRawShots(h));  // no GIR
    const holes: HoleInfo[] = [];
    for (let h = 1; h <= 9; h++) holes.push(makeHoleInfo({ hole_number: h, par: 4 }));
    const r9 = makeRoundInfo({ id: 'round-1', holes_played: 9 });

    const stats = calculateStatsFromShots(shots, holes, [r9]);
    expect(stats.holesPlayed).toBe(9);
    expect(stats.girTotal).toBe(5);
    // (5 / 9) * 18 = 10.0 — NOT the raw 5 / 1 round.
    expect(stats.girPerRound).toBeCloseTo(10.0, 1);
  });
});

describe('audit fix C — streak counters reset per round (no cross-round chaining)', () => {
  it('mostParsRow does not chain a par at the end of one round into the next', () => {
    // Two separate rounds, each a single par hole. A par streak must not span
    // the round boundary → mostParsRow = 1, never 2.
    const r1 = makeRoundInfo({ id: 'r1', holes_played: 18 });
    const r2 = makeRoundInfo({ id: 'r2', holes_played: 18 });
    const shots: RawShot[] = [
      ...par3GirRawShots(1).map(s => ({ ...s, round_id: 'r1' })), // par
      ...par3GirRawShots(1).map(s => ({ ...s, round_id: 'r2' })), // par (next round)
    ];
    const holes: HoleInfo[] = [
      makeHoleInfo({ round_id: 'r1', hole_number: 1, par: 3 }),
      makeHoleInfo({ round_id: 'r2', hole_number: 1, par: 3 }),
    ];
    const stats = calculateStatsFromShots(shots, holes, [r1, r2]);
    expect(stats.totalPars).toBe(2);
    expect(stats.mostParsRow).toBe(1); // would be 2 if streak chained across rounds
  });
});

describe('audit fix D — sand save sourced from canonical golf_holes.sand_save flag', () => {
  it('credits a sand save when the flag is true', () => {
    const shots = sandSaveRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, sand_save: true })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.sandSaveAttempts).toBe(1);
    expect(stats.sandSavesMade).toBe(1);
  });

  it('counts the attempt but no save when the flag is false', () => {
    const shots = sandSaveRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, sand_save: false })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.sandSaveAttempts).toBe(1);
    expect(stats.sandSavesMade).toBe(0);
  });

  it('does NOT credit a sand save on a GIR par hole with no bunker (flag null)', () => {
    // par4 birdie = GIR, score < par, no bunker. The old `score <= par` rule
    // wrongly credited holes like this; the flag (null = no bunker visit) must not.
    const shots = par4BirdieRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, sand_save: null })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.sandSaveAttempts).toBe(0);
    expect(stats.sandSavesMade).toBe(0);
  });
});

describe('audit fix G — per-team SG baseline scale applied in the TS engine', () => {
  it('scale=1 is identical to passing no opts (men/PGA Tour unchanged)', () => {
    const shots = par4BogeyRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const base = calculateStatsFromShots(shots, holes, [round]);
    const scaled1 = calculateStatsFromShots(shots, holes, [round], { sgScale: 1 });
    expect(scaled1.strokesGainedTotal).toBe(base.strokesGainedTotal);
  });

  it('a >1 scale (women/NCAA) raises SG vs the unscaled PGA Tour baseline', () => {
    // Scaling the expected-strokes curve up makes an over-par player look better
    // (the baseline expects more strokes), so SG is less negative — matching the
    // DB sg_expected_strokes(...,p_scale). The -1 per shot stays unscaled.
    const shots = par4BogeyRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const pga = calculateStatsFromShots(shots, holes, [round], { sgScale: 1 });
    const womens = calculateStatsFromShots(shots, holes, [round], { sgScale: 1.083 });
    expect(womens.strokesGainedTotal).not.toBeNull();
    expect(pga.strokesGainedTotal).not.toBeNull();
    expect(womens.strokesGainedTotal!).toBeGreaterThan(pga.strokesGainedTotal!);
  });
});

describe('audit fix J — girPctFromFairway excludes par-3 tee approaches', () => {
  it('a par-3 GIR (tee→green) does not count as a fairway approach', () => {
    const shots = par3GirRawShots(1); // tee shot finds green; lie_before = 'tee'
    const holes = [makeHoleInfo({ hole_number: 1, par: 3 })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.girTotal).toBe(1);
    // The only GIR came from a tee shot, not a fairway approach → fairway-lie GIR
    // has no opportunities → null (was 100% when tee folded into 'fairway').
    expect(stats.girPctFromFairway).toBeNull();
  });
});

// ============================================================================
// 2026-06-09 stats-accuracy audit fixes (branch fix/stats-accuracy-audit-2026-06-09)
// ============================================================================

describe('2026-06-09 fix A — sg*PerRound divides by rounds WITH SG, not all rounds', () => {
  it('a shot-untracked round does not dilute the per-round SG averages', () => {
    // r1: full shot data (par-4 birdie) → contributes SG.
    // r2: hole-row only (score recorded, NO shots) → contributes zero SG.
    // DB cache divides by COUNT of rounds with strokes_gained_total IS NOT NULL
    // → denominator must be 1, so per-round SG === total SG (to safeAverage's
    // 2-decimal rounding). The old rounds.length denominator halved it.
    const r1 = makeRoundInfo({ id: 'r1', holes_played: 18 });
    const r2 = makeRoundInfo({ id: 'r2', holes_played: 18 });
    const shots = par4BirdieRawShots(1).map(s => ({ ...s, round_id: 'r1' }));
    const holes: HoleInfo[] = [
      makeHoleInfo({ round_id: 'r1', hole_number: 1, par: 4 }),
      makeHoleInfo({ round_id: 'r2', hole_number: 1, par: 4, score: 4, putts: 2, gir: true }),
    ];

    const stats = calculateStatsFromShots(shots, holes, [r1, r2]);

    expect(stats.roundsPlayed).toBe(2);
    expect(stats.strokesGainedTotal).not.toBeNull();
    // A par-4 birdie gains ~+1 stroke vs the PGA baseline, so total/1 and
    // total/2 are far apart — the closeTo(…, 2dp) below is discriminating.
    expect(Math.abs(stats.strokesGainedTotal!)).toBeGreaterThan(0.5);
    expect(stats.sgTotalPerRound).toBeCloseTo(stats.strokesGainedTotal!, 2);
    expect(stats.sgPuttingPerRound).toBeCloseTo(stats.strokesGainedPutting!, 2);
    // Regression guard: the old behavior (divide by ALL rounds) would land here.
    expect(stats.sgTotalPerRound).not.toBeCloseTo(stats.strokesGainedTotal! / 2, 2);
  });
});

describe('2026-06-09 fix B — puttingByBreak is all-putt (every break-tagged putt, made = holed)', () => {
  // Par 3: tee → green 20ft, then two putts that BOTH carry a break.
  function twoPuttHoleShots(secondPuttBreak: 'straight' | 'left_to_right'): RawShot[] {
    return [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', club_type: 'non_driver',
        lie_before: 'tee', distance_to_hole_before: 160, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet',
        shot_distance: 160,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 20, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 4, distance_unit_after: 'feet',
        shot_distance: 0, putt_break: 'straight', putt_distance_feet: 20, putt_made: false,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 4, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        shot_distance: 0, putt_break: secondPuttBreak, putt_distance_feet: 4, putt_made: true,
      }),
    ];
  }
  const holes = [makeHoleInfo({ hole_number: 1, par: 3 })];

  it('counts the second putt toward ITS break and band (was first-putt-only)', () => {
    // 20ft straight miss + 4ft straight make → straight: 2 attempts, 1 holed.
    // Hand-derived: 20ft → band 15_20 (0 of 1), 4ft → band 3_5 (1 of 1),
    // overall = 1/2 = 50%. Old code: 1 attempt (first putt), made=false → 0%.
    const stats = calculateStatsFromShots(twoPuttHoleShots('straight'), holes, [round]);
    const straight = stats.puttingByBreak.straight;
    expect(straight.totalPutts).toBe(2);
    expect(straight.overallMakePct).toBe(50);
    expect(straight.makePct15_20).toBe(0);
    expect(straight.makePct3_5).toBe(100);
  });

  it('a second putt with a DIFFERENT break lands in that break bucket', () => {
    // First putt straight (missed), second putt left_to_right (holed).
    // left_to_right: 1 attempt, 1 made → 100% overall, 100% in 3_5.
    // Old code never counted non-first putts → left_to_right.totalPutts was 0.
    const stats = calculateStatsFromShots(twoPuttHoleShots('left_to_right'), holes, [round]);
    expect(stats.puttingByBreak.straight.totalPutts).toBe(1);
    expect(stats.puttingByBreak.straight.overallMakePct).toBe(0);
    expect(stats.puttingByBreak.left_to_right.totalPutts).toBe(1);
    expect(stats.puttingByBreak.left_to_right.overallMakePct).toBe(100);
    expect(stats.puttingByBreak.left_to_right.makePct3_5).toBe(100);
  });
});

describe('2026-06-09 fix C — make% bands not gated on the FIRST putt having a distance', () => {
  it('a distance-tagged later putt still feeds the make% grid when putt 1 lacks distance', () => {
    // First putt has NO distance_to_hole_before → firstPuttDistance is null and
    // the old code skipped the whole make% merge for the hole. The 3ft second
    // putt (holed) must still register: band 0_3 = 1 of 1 → 100%.
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', club_type: 'non_driver',
        lie_before: 'tee', distance_to_hole_before: 160, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet',
        shot_distance: 160,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: null, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 3, distance_unit_after: 'feet',
        shot_distance: 0, putt_made: false,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 3, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        shot_distance: 0, putt_distance_feet: 3, putt_made: true,
      }),
    ];
    const holes = [makeHoleInfo({ hole_number: 1, par: 3 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.puttMakeCount0_3).toBe(1);
    expect(stats.puttMakePct0_3).toBe(100);
  });
});

describe('2026-06-09 fix D — shotless holes with NULL score/putts are null-honest', () => {
  it('does not fabricate score=par / putts=2 into totals, averages, or streaks', () => {
    // Hole 1: real shot data (par-4 birdie, 1 putt). Hole 2: hole row only,
    // score/putts/gir all NULL — previously fabricated a par with 2 putts.
    const shots = par4BirdieRawShots(1);
    const holes: HoleInfo[] = [
      makeHoleInfo({ hole_number: 1, par: 4 }),
      makeHoleInfo({ hole_number: 2, par: 4 }), // score/putts undefined → null
    ];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.roundsPlayed).toBe(1);
    expect(stats.holesPlayed).toBe(2);
    expect(stats.totalBirdies).toBe(1);
    expect(stats.totalPars).toBe(0);      // was 1 (fabricated par on hole 2)
    expect(stats.totalPutts).toBe(1);     // was 3 (fabricated 2 putts on hole 2)
    expect(stats.onePuttsTotal).toBe(1);
    // The round has a hole without a score → NO round-level scoring aggregates
    // (a partial 1-hole sum must not pose as a round total).
    expect(stats.scoringAverage).toBeNull();
    expect(stats.bestRound).toBeNull();
    expect(stats.worstRound).toBeNull();
    // gir=null + score=null is NOT a scramble attempt (canonical: gir=false
    // AND score IS NOT NULL). Old code logged an attempt AND a fabricated make.
    expect(stats.scrambleAttempts).toBe(0);
    // Hole 1 (1 putt) extends the no-3-putt run; hole 2 (unknown putts) BREAKS
    // it rather than extending it.
    expect(stats.longestNo3PuttStreak).toBe(1);
    expect(stats.currentNo3PuttStreak).toBe(0);
  });

  it('a shotless hole WITH recorded score/putts still counts normally', () => {
    // Bogey 5 with 2 putts on a missed green, recorded only in golf_holes.
    const holes: HoleInfo[] = [
      makeHoleInfo({ hole_number: 1, par: 4, score: 5, putts: 2, gir: false }),
    ];
    const stats = calculateStatsFromShots([], holes, [makeRoundInfo({ holes_played: 9 })]);

    expect(stats.holesPlayed).toBe(1);
    expect(stats.totalBogeys).toBe(1);
    expect(stats.totalPutts).toBe(2);
    // Missed GIR with a recorded score = scramble attempt; 5 > par 4 → no make.
    expect(stats.scrambleAttempts).toBe(1);
    expect(stats.scramblesMade).toBe(0);
    expect(stats.threePuttsTotal).toBe(0);
  });
});

// ============================================================================
// fix/prod-readiness-audit — putting denominator + per-cell sample counts
// ============================================================================

/** Hole-out chip-in: tee→fairway, approach misses green, chip HOLES OUT
 *  directly (no putting shot at all) → 0 recorded putts, a legitimate value,
 *  not missing data (calculateHoleStatsFromShots falls back to
 *  puttingShots.length, which is genuinely 0 here). */
function holeOutFromChipRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
      lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards',
      shot_distance: 250,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'rough', distance_to_hole_after: 30, distance_unit_after: 'yards',
      shot_distance: 130, miss_direction: 'short',
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'around_green', club_type: 'non_driver',
      lie_before: 'rough', distance_to_hole_before: 30, distance_unit_before: 'yards',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 30,
    }),
  ];
}

describe('FIX 1 — puttsPerRound counts every hole with a RECORDED putts value, including legitimate 0-putt holes', () => {
  it('a chip-in hole-out (0 recorded putts) counts in the denominator, not just holes with putts > 0', () => {
    const shots: RawShot[] = [
      ...par4BirdieRawShots(1), // hole 1: 1 putt
      ...holeOutFromChipRawShots(2), // hole 2: 0 putts (holed a chip, no putting shot)
    ];
    const holes: HoleInfo[] = [
      makeHoleInfo({ hole_number: 1, par: 4 }),
      makeHoleInfo({ hole_number: 2, par: 4 }),
    ];
    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.totalPutts).toBe(1); // 1 + 0
    // Old bug: `if (hole.putts > 0) totalHolesWithPutts++` only counted hole 1,
    // so puttsPerRound = (1 / 1) * 18 = 18.0 — the 0-putt chip-in hole was
    // silently dropped from the denominator despite carrying a real value.
    // Fixed: both holes have a RECORDED putts value → denominator = 2, so
    // puttsPerRound = (1 / 2) * 18 = 9.0.
    expect(stats.puttsPerRound).toBeCloseTo(9, 1);
  });

  it('a genuinely unlogged hole (null putts, no shots) is still excluded from the denominator', () => {
    const shots = par4BirdieRawShots(1);
    const holes: HoleInfo[] = [
      makeHoleInfo({ hole_number: 1, par: 4 }),
      makeHoleInfo({ hole_number: 2, par: 4 }), // shotless, score/putts null
    ];
    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.totalPutts).toBe(1);
    // Denominator = 1 (only hole 1 has a recorded value) → (1/1)*18 = 18.0.
    expect(stats.puttsPerRound).toBeCloseTo(18, 1);
  });
});

describe('FIX 2 — threePuttsPerRound denominator matches puttsPerRound (holes-with-putts, not holesPlayed)', () => {
  it('an unlogged hole does not dilute the 3-putt rate via the holesPlayed denominator', () => {
    const shots: RawShot[] = [
      ...threePuttRawShots(1),
      ...par4BirdieRawShots(3),
    ];
    const holes: HoleInfo[] = [
      makeHoleInfo({ hole_number: 1, par: 4 }),
      makeHoleInfo({ hole_number: 2, par: 4 }), // shotless, score/putts null (genuinely missing)
      makeHoleInfo({ hole_number: 3, par: 4 }),
    ];
    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.holesPlayed).toBe(3);
    expect(stats.threePuttsTotal).toBe(1);
    // Old bug divided by stats.holesPlayed (3) → (1/3)*18 = 6.0. Fixed:
    // divide by holes with a RECORDED putts value (2 — hole 2 is
    // null-skipped, same denominator as puttsPerRound / FIX 1) → (1/2)*18 = 9.0.
    expect(stats.threePuttsPerRound).toBeCloseTo(9, 1);
  });

  it('a genuine zero-three-putt round still reports 0, not a fabricated null', () => {
    const shots = par4BirdieRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.threePuttsTotal).toBe(0);
    expect(stats.threePuttsPerRound).toBe(0);
  });
});

describe('FIX 3 — puttingByBreak exposes a per-band attempt count for every band the RampMatrix renders', () => {
  it('counts land in the putt-distance band matching each putt, for the correct break type', () => {
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', club_type: 'non_driver',
        lie_before: 'tee', distance_to_hole_before: 160, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet',
        shot_distance: 160,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 20, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 4, distance_unit_after: 'feet',
        shot_distance: 0, putt_break: 'straight', putt_distance_feet: 20, putt_made: false,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 4, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        shot_distance: 0, putt_break: 'straight', putt_distance_feet: 4, putt_made: true,
      }),
    ];
    const holes = [makeHoleInfo({ hole_number: 1, par: 3 })];
    const stats = calculateStatsFromShots(shots, holes, [round]);

    const straight = stats.puttingByBreak.straight;
    // 20ft putt → band 15_20 (1 attempt); 4ft putt → band 3_5 (1 attempt).
    expect(straight.count15_20).toBe(1);
    expect(straight.count3_5).toBe(1);
    expect(straight.makePct15_20).toBe(0);
    expect(straight.makePct3_5).toBe(100);
    // Bands with no attempts stay a real 0, never undefined — the
    // RampMatrix n= badge and the RxCard's n>=8 gate both compare against it.
    expect(straight.count0_3).toBe(0);
    expect(straight.count5_10).toBe(0);
    expect(straight.count10_15).toBe(0);
    expect(straight.count20_25).toBe(0);
    expect(straight.count35Plus).toBe(0);
  });
});
