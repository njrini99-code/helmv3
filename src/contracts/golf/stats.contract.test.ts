import { describe, expect, it } from 'vitest';

import {
  computeFairwayPct,
  computeGirPct,
  computePerRound18,
  computePuttsPerRound,
  computeSandSavePct,
  computeScoringAverage,
  computeScoringAverageVsPar,
  computeScramblingPct,
  pct,
} from '@/lib/golf/stat-formulas';
import {
  calculateHoleStatsFromShots,
  calculateStatsFromShots,
  calculateStrokesGainedForShot,
  normalizePuttFeet,
  type HoleInfo,
  type RawShot,
  type RoundInfo,
} from '@/lib/utils/golf-stats-calculator-shots';
import {
  defaultSgBaseline,
  effectiveSgBaseline,
  SG_BASELINE_OPTIONS,
  sgBaselineScale,
  WOMENS_SG_SCALE,
} from '@/lib/golf/sg-benchmarks';

const baseShot = (overrides: Partial<RawShot>): RawShot => ({
  id: overrides.id ?? `shot-${overrides.hole_number ?? 1}-${overrides.shot_number ?? 1}`,
  round_id: overrides.round_id ?? 'round-1',
  hole_number: overrides.hole_number ?? 1,
  shot_number: overrides.shot_number ?? 1,
  shot_type: overrides.shot_type ?? 'approach',
  club_type: overrides.club_type ?? null,
  lie_before: 'lie_before' in overrides ? overrides.lie_before! : 'fairway',
  lie_after: overrides.lie_after,
  distance_to_hole_before: 'distance_to_hole_before' in overrides ? overrides.distance_to_hole_before! : 100,
  distance_unit_before: overrides.distance_unit_before ?? 'yards',
  result: overrides.result ?? 'green',
  distance_to_hole_after: 'distance_to_hole_after' in overrides ? overrides.distance_to_hole_after! : 20,
  distance_unit_after: overrides.distance_unit_after ?? 'feet',
  shot_distance: overrides.shot_distance,
  miss_direction: overrides.miss_direction ?? null,
  putt_break: overrides.putt_break ?? null,
  putt_distance_feet: overrides.putt_distance_feet,
  putt_slope: overrides.putt_slope ?? null,
  putt_made: overrides.putt_made,
  is_penalty: overrides.is_penalty,
  penalty_type: overrides.penalty_type,
});

describe('GolfHelm stat formula contracts', () => {
  it('GH-STATS-006 keeps missing denominators null instead of fabricating zero performance', () => {
    expect(pct(0, 0)).toBeNull();
    expect(computeFairwayPct(0, 0)).toBeNull();
    expect(computeGirPct(0, 0)).toBeNull();
    expect(computeScramblingPct(0, 0)).toBeNull();
    expect(computeSandSavePct(0, 0)).toBeNull();
    expect(computePuttsPerRound(0, 0)).toBeNull();
    expect(computePerRound18(0, 0)).toBeNull();
    expect(computeScoringAverage(0, 0)).toBeNull();
    expect(computeScoringAverageVsPar(0, 0)).toBeNull();
  });

  it('normalizes per-round stats to 18 holes and keeps scoring averages round-based', () => {
    expect(computePuttsPerRound(15, 9)).toBe(30);
    expect(computePerRound18(2, 9)).toBe(4);
    expect(computeScoringAverage(153, 2)).toBe(76.5);
    expect(computeScoringAverageVsPar(5, 2)).toBe(2.5);
  });
});

describe('GolfHelm shot-derived hole contracts', () => {
  it('GH-STATS-003 counts a 3-putt only when a hole has 3 or more putts', () => {
    const hole = calculateHoleStatsFromShots(
      [
        baseShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', result: 'green' }),
        baseShot({ shot_number: 2, shot_type: 'putt', lie_before: 'green', result: 'green', distance_to_hole_before: 30, distance_to_hole_after: 4 }),
        baseShot({ shot_number: 3, shot_type: 'putt', lie_before: 'green', result: 'green', distance_to_hole_before: 4, distance_to_hole_after: 1 }),
        baseShot({ shot_number: 4, shot_type: 'putt', lie_before: 'green', result: 'hole', distance_to_hole_before: 1, distance_to_hole_after: 0 }),
      ],
      { hole_number: 1, par: 3, score: 4, putts: null, fairway_hit: null, gir: true },
    );

    expect(hole.putts).toBe(3);
    expect(hole.threePutts).toBe(true);
  });

  it('GH-STATS-004 and GH-STATS-005 only count scrambling on missed-GIR holes', () => {
    const missedGirPar = calculateHoleStatsFromShots(
      [
        baseShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', result: 'rough' }),
        baseShot({ shot_number: 2, shot_type: 'around_green', lie_before: 'rough', result: 'green', distance_to_hole_before: 20 }),
        baseShot({ shot_number: 3, shot_type: 'putt', lie_before: 'green', result: 'hole', distance_to_hole_before: 4 }),
      ],
      { hole_number: 2, par: 3, score: 3, putts: null, fairway_hit: null, gir: false },
    );
    const girPar = calculateHoleStatsFromShots(
      [
        baseShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', result: 'green' }),
        baseShot({ shot_number: 2, shot_type: 'putt', lie_before: 'green', result: 'green', distance_to_hole_before: 30, distance_to_hole_after: 2 }),
        baseShot({ shot_number: 3, shot_type: 'putt', lie_before: 'green', result: 'hole', distance_to_hole_before: 2 }),
      ],
      { hole_number: 3, par: 3, score: 3, putts: null, fairway_hit: null, gir: true },
    );

    expect(missedGirPar.scrambleAttempt).toBe(true);
    expect(missedGirPar.scrambleMade).toBe(true);
    expect(girPar.scrambleAttempt).toBe(false);
    expect(girPar.scrambleMade).toBe(false);
  });

  it('GH-STATS-006 preserves null score/putt facts for shotless holes in aggregates', () => {
    const stats = calculateStatsFromShots(
      [],
      [{ round_id: 'round-1', hole_number: 4, par: 4, yardage: 400, score: null, putts: null, fairway_hit: null, gir: null }],
      [{ id: 'round-1', round_date: '2026-06-01', course_name: null, round_type: 'practice', holes_played: 1 }],
    );

    expect(stats.scoringAverage).toBeNull();
    expect(stats.avgScoreToPar).toBeNull();
    expect(stats.scrambleAttempts).toBe(0);
    expect(stats.threePuttsTotal).toBe(0);
  });
});

describe('GolfHelm round aggregate contracts', () => {
  it('GH-STATS-001 and GH-STATS-002 aggregate gross score and score-to-par from complete hole facts', () => {
    const round: RoundInfo = {
      id: 'round-1',
      round_date: '2026-06-01',
      course_name: 'Contract Course',
      round_type: 'practice',
      course_par: 72,
      holes_played: 18,
    };
    const holes: HoleInfo[] = Array.from({ length: 18 }, (_, index) => ({
      round_id: 'round-1',
      hole_number: index + 1,
      par: 4,
      yardage: 400,
      score: 5,
      putts: index === 0 ? 3 : 2,
      fairway_hit: index % 2 === 0,
      gir: false,
    }));

    const stats = calculateStatsFromShots([], holes, [round]);

    expect(stats.scoringByPar.par4.avgToPar).toBe(1);
    expect(stats.scoringAverage18).toBe(90);
    expect(stats.avgScoreToPar).toBe(18);
    expect(stats.threePuttsTotal).toBe(1);
  });

  it('GH-STATS-007 does not let partial hole data masquerade as a full scoring average', () => {
    const stats = calculateStatsFromShots(
      [],
      [
        { round_id: 'round-1', hole_number: 1, par: 4, yardage: 390, score: 4, putts: 2, gir: true },
        { round_id: 'round-1', hole_number: 2, par: 4, yardage: 410, score: null, putts: null, gir: null },
      ],
      [{ id: 'round-1', round_date: '2026-06-01', course_name: null, round_type: 'practice', holes_played: 2 }],
    );

    expect(stats.scoringAverage).toBeNull();
    expect(stats.avgScoreToPar).toBeNull();
    expect(stats.totalPars).toBe(1);
  });
});

describe('GolfHelm strokes-gained baseline contracts', () => {
  it('GH-STATS-008 and GH-STATS-009 keep PGA/LPGA baseline selection explicit', () => {
    expect(SG_BASELINE_OPTIONS.map((option) => option.key)).toEqual(['pga_tour', 'womens']);
    expect(defaultSgBaseline('mens')).toBe('pga_tour');
    expect(defaultSgBaseline('womens')).toBe('womens');
    expect(effectiveSgBaseline('womens', 'mens')).toBe('womens');
    expect(sgBaselineScale('pga_tour')).toBe(1);
    expect(sgBaselineScale('womens')).toBe(WOMENS_SG_SCALE);
  });

  it('GH-STATS-008 returns null for incomplete strokes-gained facts instead of zeroing them', () => {
    expect(calculateStrokesGainedForShot(baseShot({ lie_before: null }))).toBeNull();
    expect(calculateStrokesGainedForShot(baseShot({ distance_to_hole_before: null }))).toBeNull();
    expect(normalizePuttFeet(390)).toBe(120);
  });
});
