import { describe, it, expect } from 'vitest';
import {
  normalizeToYards,
  normalizeToFeet,
  normalizeShotType,
  isGreenHit,
  normalizeRoundType,
  safePercent,
  safeAverage,
  getPuttDistanceBucket,
  getApproachDistanceBucket,
  getAtgDistanceBucket,
  getExpectedStrokes,
  calculateStrokesGainedForShot,
  getStrokesGainedCategory,
  calculateHoleStatsFromShots,
  calculateStatsFromShots,
  formatStat,
  formatStatInt,
  AROUND_GREEN_THRESHOLD_YARDS,
} from '../golf-stats-calculator-shots';
import type { GolfStats, RawShot, HoleInfo } from '../golf-stats-calculator-shots';
import {
  makeRawShot,
  makeHoleInfo,
  makeRoundInfo,
  par4BirdieRawShots,
  par4BogeyRawShots,
  par3GirRawShots,
  sandSaveRawShots,
  threePuttRawShots,
  par5WithPenaltyRawShots,
} from '@/test/fixtures/golf-shots';

// ============================================================================
// normalizeToYards
// ============================================================================

describe('normalizeToYards', () => {
  it('returns distance unchanged for yards', () => {
    expect(normalizeToYards(150, 'yards')).toBe(150);
  });

  it('converts feet to yards', () => {
    expect(normalizeToYards(30, 'feet')).toBe(10);
  });

  it('returns 0 for null distance', () => {
    expect(normalizeToYards(null, 'yards')).toBe(0);
  });

  it('returns 0 for undefined distance', () => {
    expect(normalizeToYards(undefined, 'yards')).toBe(0);
  });

  it('treats null unit as yards (passthrough)', () => {
    expect(normalizeToYards(150, null)).toBe(150);
  });
});

// ============================================================================
// normalizeToFeet
// ============================================================================

describe('normalizeToFeet', () => {
  it('returns distance unchanged for feet', () => {
    expect(normalizeToFeet(30, 'feet')).toBe(30);
  });

  it('converts yards to feet', () => {
    expect(normalizeToFeet(10, 'yards')).toBe(30);
  });

  it('returns 0 for null distance', () => {
    expect(normalizeToFeet(null, 'feet')).toBe(0);
  });

  it('returns 0 for undefined distance', () => {
    expect(normalizeToFeet(undefined, 'feet')).toBe(0);
  });

  it('treats null unit as feet (passthrough)', () => {
    expect(normalizeToFeet(30, null)).toBe(30);
  });
});

// ============================================================================
// normalizeShotType
// ============================================================================

describe('normalizeShotType', () => {
  it('normalizes putt to putting', () => {
    expect(normalizeShotType('putt')).toBe('putting');
  });

  it('normalizes drive to tee', () => {
    expect(normalizeShotType('drive')).toBe('tee');
  });

  it('normalizes chip to around_green', () => {
    expect(normalizeShotType('chip')).toBe('around_green');
  });

  it('normalizes pitch to around_green', () => {
    expect(normalizeShotType('pitch')).toBe('around_green');
  });

  it('normalizes iron to approach', () => {
    expect(normalizeShotType('iron')).toBe('approach');
  });

  it('passes through already-normalized types', () => {
    expect(normalizeShotType('tee')).toBe('tee');
    expect(normalizeShotType('approach')).toBe('approach');
    expect(normalizeShotType('putting')).toBe('putting');
    expect(normalizeShotType('around_green')).toBe('around_green');
  });

  it('returns null for null input', () => {
    expect(normalizeShotType(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeShotType(undefined)).toBeNull();
  });

  it('passes through unknown types unchanged', () => {
    expect(normalizeShotType('penalty')).toBe('penalty');
  });
});

// ============================================================================
// isGreenHit
// ============================================================================

describe('isGreenHit', () => {
  it('returns true for green', () => {
    expect(isGreenHit('green')).toBe(true);
  });

  it('returns true for gir', () => {
    expect(isGreenHit('gir')).toBe(true);
  });

  it('returns true for hole', () => {
    expect(isGreenHit('hole')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isGreenHit('GREEN')).toBe(true);
    expect(isGreenHit('Green')).toBe(true);
    expect(isGreenHit('HOLE')).toBe(true);
  });

  it('returns false for fairway', () => {
    expect(isGreenHit('fairway')).toBe(false);
  });

  it('returns false for rough', () => {
    expect(isGreenHit('rough')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGreenHit(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isGreenHit(undefined)).toBe(false);
  });
});

// ============================================================================
// normalizeRoundType
// ============================================================================

describe('normalizeRoundType', () => {
  it('converts qualifying to qualifier', () => {
    expect(normalizeRoundType('qualifying')).toBe('qualifier');
  });

  it('passes through practice', () => {
    expect(normalizeRoundType('practice')).toBe('practice');
  });

  it('passes through qualifier', () => {
    expect(normalizeRoundType('qualifier')).toBe('qualifier');
  });

  it('passes through tournament', () => {
    expect(normalizeRoundType('tournament')).toBe('tournament');
  });

  it('passes through null', () => {
    expect(normalizeRoundType(null)).toBeNull();
  });
});

// ============================================================================
// safePercent
// ============================================================================

describe('safePercent', () => {
  it('returns null for zero attempts', () => {
    expect(safePercent(0, 0)).toBeNull();
  });

  it('calculates percentage correctly', () => {
    expect(safePercent(7, 10)).toBe(70.0);
  });

  it('rounds to one decimal place', () => {
    expect(safePercent(1, 3)).toBe(33.3);
  });

  it('returns 100 for perfect', () => {
    expect(safePercent(10, 10)).toBe(100.0);
  });

  it('returns 0 for none made', () => {
    expect(safePercent(0, 10)).toBe(0.0);
  });
});

// ============================================================================
// safeAverage
// ============================================================================

describe('safeAverage', () => {
  it('returns null for zero count', () => {
    expect(safeAverage(0, 0)).toBeNull();
  });

  it('calculates average correctly', () => {
    expect(safeAverage(300, 3)).toBe(100);
  });

  it('rounds to two decimal places', () => {
    expect(safeAverage(10, 3)).toBe(3.33);
  });
});

// ============================================================================
// getPuttDistanceBucket
// ============================================================================

describe('getPuttDistanceBucket', () => {
  it('returns 0_3 for 0 feet', () => {
    expect(getPuttDistanceBucket(0)).toBe('0_3');
  });

  it('returns 0_3 for exactly 3 feet', () => {
    expect(getPuttDistanceBucket(3)).toBe('0_3');
  });

  it('returns 3_5 for 4 feet', () => {
    expect(getPuttDistanceBucket(4)).toBe('3_5');
  });

  it('returns 3_5 for exactly 5 feet', () => {
    expect(getPuttDistanceBucket(5)).toBe('3_5');
  });

  it('returns 5_10 for 6 feet', () => {
    expect(getPuttDistanceBucket(6)).toBe('5_10');
  });

  it('returns 5_10 for exactly 10 feet', () => {
    expect(getPuttDistanceBucket(10)).toBe('5_10');
  });

  it('returns 10_15 for 12 feet', () => {
    expect(getPuttDistanceBucket(12)).toBe('10_15');
  });

  it('returns 15_20 for 18 feet', () => {
    expect(getPuttDistanceBucket(18)).toBe('15_20');
  });

  it('returns 20_25 for 22 feet', () => {
    expect(getPuttDistanceBucket(22)).toBe('20_25');
  });

  it('returns 25_30 for 28 feet', () => {
    expect(getPuttDistanceBucket(28)).toBe('25_30');
  });

  it('returns 30_35 for 32 feet', () => {
    expect(getPuttDistanceBucket(32)).toBe('30_35');
  });

  it('returns 35_plus for 36 feet', () => {
    expect(getPuttDistanceBucket(36)).toBe('35_plus');
  });

  it('returns 35_plus for 100 feet', () => {
    expect(getPuttDistanceBucket(100)).toBe('35_plus');
  });
});

// ============================================================================
// getApproachDistanceBucket
// ============================================================================

describe('getApproachDistanceBucket', () => {
  it('returns empty string for distance below threshold', () => {
    expect(getApproachDistanceBucket(20)).toBe('');
  });

  it('returns 30_75 for exactly 50 yards (at threshold)', () => {
    expect(getApproachDistanceBucket(AROUND_GREEN_THRESHOLD_YARDS)).toBe('30_75');
  });

  it('returns 30_75 for 60 yards', () => {
    expect(getApproachDistanceBucket(60)).toBe('30_75');
  });

  it('returns 75_100 for 80 yards', () => {
    expect(getApproachDistanceBucket(80)).toBe('75_100');
  });

  it('returns 100_125 for 110 yards', () => {
    expect(getApproachDistanceBucket(110)).toBe('100_125');
  });

  it('returns 125_150 for 140 yards', () => {
    expect(getApproachDistanceBucket(140)).toBe('125_150');
  });

  it('returns 150_175 for 160 yards', () => {
    expect(getApproachDistanceBucket(160)).toBe('150_175');
  });

  it('returns 175_200 for 190 yards', () => {
    expect(getApproachDistanceBucket(190)).toBe('175_200');
  });

  it('returns 200_225 for 210 yards', () => {
    expect(getApproachDistanceBucket(210)).toBe('200_225');
  });

  it('returns 225_plus for 230 yards', () => {
    expect(getApproachDistanceBucket(230)).toBe('225_plus');
  });
});

// ============================================================================
// getAtgDistanceBucket
// ============================================================================

describe('getAtgDistanceBucket', () => {
  it('returns 0_10 for 5 yards', () => {
    expect(getAtgDistanceBucket(5)).toBe('0_10');
  });

  it('returns 0_10 for exactly 10 yards', () => {
    expect(getAtgDistanceBucket(10)).toBe('0_10');
  });

  it('returns 10_20 for 15 yards', () => {
    expect(getAtgDistanceBucket(15)).toBe('10_20');
  });

  it('returns 10_20 for exactly 20 yards', () => {
    expect(getAtgDistanceBucket(20)).toBe('10_20');
  });

  it('returns 20_30 for 25 yards', () => {
    expect(getAtgDistanceBucket(25)).toBe('20_30');
  });

  it('returns 20_30 for 50 yards (catches all 20+)', () => {
    expect(getAtgDistanceBucket(50)).toBe('20_30');
  });
});

// ============================================================================
// getExpectedStrokes
// ============================================================================

describe('getExpectedStrokes', () => {
  it('returns 0 for null lie', () => {
    expect(getExpectedStrokes(null, 150)).toBe(0);
  });

  it('uses green benchmark (feet) for green lie', () => {
    // 10 feet → benchmark 1.61
    expect(getExpectedStrokes('green', 0, 10)).toBe(1.61);
  });

  it('uses closest green benchmark for in-between distances', () => {
    // 12 feet → closest to 10 (1.61) or 15 (1.78), 12 is closer to 10
    expect(getExpectedStrokes('green', 0, 12)).toBe(1.61);
  });

  it('uses fairway benchmark for fairway lie', () => {
    // 150 yards from fairway → 2.99
    expect(getExpectedStrokes('fairway', 150)).toBe(2.99);
  });

  it('uses rough benchmark for rough lie', () => {
    // 150 yards from rough → 3.15
    expect(getExpectedStrokes('rough', 150)).toBe(3.15);
  });

  it('uses sand benchmark for sand lie', () => {
    // 30 yards from sand → 2.60
    expect(getExpectedStrokes('sand', 30)).toBe(2.60);
  });

  it('falls back to fairway for tee shots under 400 yards', () => {
    // Tee at 150 yards (par 3) → should use fairway benchmark: 2.99
    expect(getExpectedStrokes('tee', 150)).toBe(2.99);
  });

  it('uses tee benchmark for 400+ yard shots', () => {
    // Tee at 400 yards → tee benchmark: 4.08
    expect(getExpectedStrokes('tee', 400)).toBe(4.08);
  });

  it('returns fallback 3.50 for unknown lie type', () => {
    expect(getExpectedStrokes('water', 100)).toBe(3.50);
  });
});

// ============================================================================
// calculateStrokesGainedForShot
// ============================================================================

describe('calculateStrokesGainedForShot', () => {
  it('returns null when lie_before is missing', () => {
    const shot = makeRawShot({ lie_before: null });
    expect(calculateStrokesGainedForShot(shot)).toBeNull();
  });

  it('returns null when distance_to_hole_before is missing', () => {
    const shot = makeRawShot({ distance_to_hole_before: null });
    expect(calculateStrokesGainedForShot(shot)).toBeNull();
  });

  it('calculates SG for a holed putt (expected after = 0)', () => {
    const shot = makeRawShot({
      lie_before: 'green', distance_to_hole_before: 10, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
    });
    const sg = calculateStrokesGainedForShot(shot);
    expect(sg).not.toBeNull();
    // SG = expected(10ft green) - (1 + 0) = 1.61 - 1 = 0.61
    expect(sg).toBeCloseTo(0.61, 1);
  });

  it('calculates SG for fairway approach to green', () => {
    const shot = makeRawShot({
      lie_before: 'fairway', distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet',
    });
    const sg = calculateStrokesGainedForShot(shot);
    expect(sg).not.toBeNull();
    // SG = expected(150yd fairway) - (1 + expected(20ft green))
    // = 2.99 - (1 + 1.87) = 0.12
    expect(sg).toBeCloseTo(0.12, 1);
  });

  it('returns null when distance_to_hole_after missing for non-green non-putt', () => {
    const shot = makeRawShot({
      lie_before: 'fairway', distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'rough', distance_to_hole_after: null, shot_type: 'approach',
    });
    expect(calculateStrokesGainedForShot(shot)).toBeNull();
  });

  it('estimates distance for missed putt with no after-distance', () => {
    const shot = makeRawShot({
      lie_before: 'green', distance_to_hole_before: 10, distance_unit_before: 'feet',
      result: 'green', distance_to_hole_after: null, shot_type: 'putting',
    });
    const sg = calculateStrokesGainedForShot(shot);
    // Should not be null — uses fallback of 3 feet
    expect(sg).not.toBeNull();
  });
});

// ============================================================================
// getStrokesGainedCategory
// ============================================================================

describe('getStrokesGainedCategory', () => {
  it('returns putting for putting shot', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'putting' }), 4)).toBe('putting');
  });

  it('returns tee for tee shot on par 4', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'tee' }), 4)).toBe('tee');
  });

  it('returns tee for tee shot on par 5', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'tee' }), 5)).toBe('tee');
  });

  it('returns approach for tee shot on par 3', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'tee' }), 3)).toBe('approach');
  });

  it('returns around_green for around_green shot', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'around_green' }), 4)).toBe('around_green');
  });

  it('returns approach for approach shot', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'approach' }), 4)).toBe('approach');
  });

  it('normalizes putt to putting', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'putt' }), 4)).toBe('putting');
  });

  it('normalizes drive to tee on par 4', () => {
    expect(getStrokesGainedCategory(makeRawShot({ shot_type: 'drive' }), 4)).toBe('tee');
  });
});

// ============================================================================
// calculateHoleStatsFromShots
// ============================================================================

describe('calculateHoleStatsFromShots', () => {
  describe('par 4 birdie', () => {
    const stats = calculateHoleStatsFromShots(par4BirdieRawShots(), 4);

    it('calculates score correctly', () => {
      expect(stats.score).toBe(3);
    });

    it('counts putts', () => {
      expect(stats.putts).toBe(1);
    });

    it('detects fairway hit', () => {
      expect(stats.fairwayHit).toBe(true);
    });

    it('detects driver used', () => {
      expect(stats.usedDriver).toBe(true);
    });

    it('records driving distance', () => {
      expect(stats.drivingDistance).toBe(250);
    });

    it('detects GIR', () => {
      expect(stats.greenInRegulation).toBe(true);
    });

    it('records approach distance', () => {
      expect(stats.approachDistance).toBe(150);
    });

    it('records approach lie', () => {
      expect(stats.approachLie).toBe('fairway');
    });

    it('records approach proximity in feet', () => {
      expect(stats.approachProximity).toBe(10);
    });

    it('no scramble attempt when GIR', () => {
      expect(stats.scrambleAttempt).toBe(false);
    });

    it('no sand save attempt', () => {
      expect(stats.sandSaveAttempt).toBe(false);
    });

    it('records first putt distance', () => {
      expect(stats.firstPuttDistance).toBe(10);
    });

    it('no first putt leave (made it)', () => {
      expect(stats.firstPuttLeave).toBeNull();
    });

    it('records first putt break', () => {
      expect(stats.firstPuttBreak).toBe('left_to_right');
    });

    it('records first putt slope', () => {
      expect(stats.firstPuttSlope).toBe('uphill');
    });

    it('no 3-putt', () => {
      expect(stats.threePutts).toBe(false);
    });

    it('no penalties', () => {
      expect(stats.penalties).toBe(0);
    });
  });

  describe('par 4 bogey (missed fairway & GIR)', () => {
    const stats = calculateHoleStatsFromShots(par4BogeyRawShots(), 4);

    it('calculates score correctly', () => {
      expect(stats.score).toBe(5);
    });

    it('counts putts', () => {
      expect(stats.putts).toBe(2);
    });

    it('detects fairway miss', () => {
      expect(stats.fairwayHit).toBe(false);
    });

    it('detects GIR miss', () => {
      expect(stats.greenInRegulation).toBe(false);
    });

    it('detects scramble attempt', () => {
      expect(stats.scrambleAttempt).toBe(true);
    });

    it('scramble not made (bogey > par)', () => {
      expect(stats.scrambleMade).toBe(false);
    });

    it('records drive miss direction', () => {
      expect(stats.driveMissDirection).toBe('right');
    });
  });

  describe('par 3 GIR', () => {
    const stats = calculateHoleStatsFromShots(par3GirRawShots(), 3);

    it('calculates score (par)', () => {
      expect(stats.score).toBe(3);
    });

    it('no fairway tracking for par 3', () => {
      // Par 3 has no fairway opportunity — fairwayHit should be null, not false
      expect(stats.fairwayHit).toBeNull();
    });

    it('detects GIR (shot 1 hits green, par-2=1)', () => {
      expect(stats.greenInRegulation).toBe(true);
    });

    it('approach lie normalized from tee to fairway', () => {
      expect(stats.approachLie).toBe('fairway');
    });

    it('records approach proximity', () => {
      expect(stats.approachProximity).toBe(20);
    });
  });

  describe('sand save', () => {
    const stats = calculateHoleStatsFromShots(sandSaveRawShots(), 4);

    it('calculates score (par)', () => {
      expect(stats.score).toBe(4);
    });

    it('detects sand save attempt', () => {
      expect(stats.sandSaveAttempt).toBe(true);
    });

    it('detects sand save made (par)', () => {
      expect(stats.sandSaveMade).toBe(true);
    });

    it('chip lie is sand', () => {
      expect(stats.chipLie).toBe('sand');
    });
  });

  describe('three-putt', () => {
    const stats = calculateHoleStatsFromShots(threePuttRawShots(), 4);

    it('counts 3 putts', () => {
      expect(stats.putts).toBe(3);
    });

    it('detects 3-putt', () => {
      expect(stats.threePutts).toBe(true);
    });

    it('calculates bogey score', () => {
      expect(stats.score).toBe(5);
    });

    it('records first putt distance', () => {
      expect(stats.firstPuttDistance).toBe(40);
    });

    it('records first putt leave', () => {
      expect(stats.firstPuttLeave).toBe(8);
    });
  });

  describe('par 5 with penalty', () => {
    const stats = calculateHoleStatsFromShots(par5WithPenaltyRawShots(), 5);

    it('includes penalty in score', () => {
      expect(stats.score).toBe(6);
    });

    it('counts penalty strokes', () => {
      expect(stats.penalties).toBe(1);
    });

    it('still detects fairway hit from tee', () => {
      expect(stats.fairwayHit).toBe(true);
    });
  });
});

// ============================================================================
// calculateStatsFromShots (integration)
// ============================================================================

describe('calculateStatsFromShots', () => {
  it('returns zero stats for empty data', () => {
    const stats = calculateStatsFromShots([], [], []);
    expect(stats.roundsPlayed).toBe(0);
    expect(stats.holesPlayed).toBe(0);
    expect(stats.scoringAverage).toBeNull();
  });

  it('calculates stats for a single round of 2 holes', () => {
    const shots = [
      ...par4BirdieRawShots(1),
      ...par4BogeyRawShots(2),
    ];
    const holes = [
      makeHoleInfo({ hole_number: 1, par: 4, yardage: 400 }),
      makeHoleInfo({ hole_number: 2, par: 4, yardage: 400 }),
    ];
    const rounds = [makeRoundInfo()];

    const stats = calculateStatsFromShots(shots, holes, rounds);

    expect(stats.roundsPlayed).toBe(1);
    expect(stats.holesPlayed).toBe(2);
    expect(stats.totalBirdies).toBe(1);
    expect(stats.totalBogeys).toBe(1);
    expect(stats.fairwaysHit).toBe(1);
    expect(stats.fairwayOpportunities).toBe(2);
  });

  it('calculates stats across multiple rounds', () => {
    const round1Shots = par4BirdieRawShots(1).map(s => ({ ...s, round_id: 'r1' }));
    const round2Shots = par3GirRawShots(1).map(s => ({ ...s, round_id: 'r2' }));
    const shots = [...round1Shots, ...round2Shots];
    const holes = [
      makeHoleInfo({ round_id: 'r1', hole_number: 1, par: 4, yardage: 400 }),
      makeHoleInfo({ round_id: 'r2', hole_number: 1, par: 3, yardage: 180 }),
    ];
    const rounds = [
      makeRoundInfo({ id: 'r1' }),
      makeRoundInfo({ id: 'r2' }),
    ];

    const stats = calculateStatsFromShots(shots, holes, rounds);

    expect(stats.roundsPlayed).toBe(2);
    expect(stats.holesPlayed).toBe(2);
  });

  it('tracks three-putt streaks', () => {
    const shots = [
      ...threePuttRawShots(1),
      ...par4BirdieRawShots(2),
    ];
    const holes = [
      makeHoleInfo({ hole_number: 1, par: 4 }),
      makeHoleInfo({ hole_number: 2, par: 4 }),
    ];
    const rounds = [makeRoundInfo()];

    const stats = calculateStatsFromShots(shots, holes, rounds);
    // Hole 2 had 1 putt (no 3-putt), so current streak = 1
    expect(stats.currentNo3PuttStreak).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// formatStat / formatStatInt
// ============================================================================

describe('formatStat', () => {
  it('returns dash for null value', () => {
    expect(formatStat(null)).toBe('--');
  });

  it('formats number with suffix', () => {
    expect(formatStat(72.5, '%')).toBe('72.5%');
  });

  it('formats with specified decimals', () => {
    expect(formatStat(72.567, '', 2)).toBe('72.57');
  });

  it('formats with default 1 decimal', () => {
    expect(formatStat(72.567)).toBe('72.6');
  });
});

describe('formatStatInt', () => {
  it('returns dash for null value', () => {
    expect(formatStatInt(null)).toBe('--');
  });

  it('formats number as integer (string)', () => {
    expect(formatStatInt(72.5)).toBe('73');
  });

  it('formats whole number', () => {
    expect(formatStatInt(10)).toBe('10');
  });

  it('rounds 0.5 up', () => {
    expect(formatStatInt(72.5)).toBe('73');
  });

  it('formats zero', () => {
    expect(formatStatInt(0)).toBe('0');
  });

  it('formats negative number', () => {
    expect(formatStatInt(-72.5)).toBe('-72');
  });
});

// ============================================================================
// EDGE CASES: normalizeToYards / normalizeToFeet
// ============================================================================

describe('normalizeToYards edge cases', () => {
  it('returns 0 for zero distance', () => {
    expect(normalizeToYards(0, 'yards')).toBe(0);
    expect(normalizeToYards(0, 'feet')).toBe(0);
  });

  it('treats unknown unit as yards (passthrough)', () => {
    expect(normalizeToYards(150, 'meters')).toBe(150);
  });

  it('treats empty string unit as yards', () => {
    expect(normalizeToYards(150, '')).toBe(150);
  });

  it('handles fractional feet→yards conversion', () => {
    expect(normalizeToYards(31, 'feet')).toBeCloseTo(10.33, 1);
  });
});

describe('normalizeToFeet edge cases', () => {
  it('returns 0 for zero distance', () => {
    expect(normalizeToFeet(0, 'feet')).toBe(0);
    expect(normalizeToFeet(0, 'yards')).toBe(0);
  });

  it('treats unknown unit as feet (passthrough)', () => {
    expect(normalizeToFeet(30, 'meters')).toBe(30);
  });

  it('handles fractional yards→feet conversion', () => {
    expect(normalizeToFeet(10.5, 'yards')).toBe(31.5);
  });
});

// ============================================================================
// EDGE CASES: normalizeShotType
// ============================================================================

describe('normalizeShotType edge cases', () => {
  it('empty string returns empty string (truthy)', () => {
    // Empty strings should normalize to null.
    expect(normalizeShotType('')).toBeNull();
  });

  it('normalizes uppercase variants case-insensitively', () => {
    expect(normalizeShotType('PUTT')).toBe('putting');
  });
});

// ============================================================================
// EDGE CASES: getPuttDistanceBucket boundaries
// ============================================================================

describe('getPuttDistanceBucket boundary precision', () => {
  it('3.001 feet → 3_5 (just over boundary)', () => {
    expect(getPuttDistanceBucket(3.001)).toBe('3_5');
  });

  it('5.001 → 5_10', () => {
    expect(getPuttDistanceBucket(5.001)).toBe('5_10');
  });

  it('10.001 → 10_15', () => {
    expect(getPuttDistanceBucket(10.001)).toBe('10_15');
  });

  it('0.1 feet → 0_3', () => {
    expect(getPuttDistanceBucket(0.1)).toBe('0_3');
  });

  it('35 exactly → 30_35', () => {
    expect(getPuttDistanceBucket(35)).toBe('30_35');
  });

  it('35.001 → 35_plus', () => {
    expect(getPuttDistanceBucket(35.001)).toBe('35_plus');
  });
});

// ============================================================================
// EDGE CASES: getApproachDistanceBucket boundaries
// ============================================================================

describe('getApproachDistanceBucket boundary precision', () => {
  it('49.9 yards → empty (below threshold)', () => {
    expect(getApproachDistanceBucket(49.9)).toBe('');
  });

  it('75 exactly → 30_75', () => {
    expect(getApproachDistanceBucket(75)).toBe('30_75');
  });

  it('75.001 → 75_100', () => {
    expect(getApproachDistanceBucket(75.001)).toBe('75_100');
  });

  it('100 exactly → 75_100', () => {
    expect(getApproachDistanceBucket(100)).toBe('75_100');
  });

  it('225 exactly → 200_225', () => {
    expect(getApproachDistanceBucket(225)).toBe('200_225');
  });

  it('225.001 → 225_plus', () => {
    expect(getApproachDistanceBucket(225.001)).toBe('225_plus');
  });

  it('0 → empty (below threshold)', () => {
    expect(getApproachDistanceBucket(0)).toBe('');
  });
});

// ============================================================================
// EDGE CASES: getAtgDistanceBucket boundaries
// ============================================================================

describe('getAtgDistanceBucket boundary precision', () => {
  it('10.001 → 10_20', () => {
    expect(getAtgDistanceBucket(10.001)).toBe('10_20');
  });

  it('20.001 → 20_30', () => {
    expect(getAtgDistanceBucket(20.001)).toBe('20_30');
  });

  it('0 → 0_10', () => {
    expect(getAtgDistanceBucket(0)).toBe('0_10');
  });
});

// ============================================================================
// EDGE CASES: getExpectedStrokes
// ============================================================================

describe('getExpectedStrokes edge cases', () => {
  it('tee at exactly 399 yards → uses fairway benchmark', () => {
    expect(getExpectedStrokes('tee', 399)).toBe(getExpectedStrokes('fairway', 399));
  });

  it('tee at exactly 400 yards → uses tee benchmark', () => {
    // Tee at 400 → tee benchmark 4.08, NOT fairway
    expect(getExpectedStrokes('tee', 400)).toBe(4.08);
  });

  it('green with very small putt (0.5 feet) → uses 1-foot benchmark', () => {
    expect(getExpectedStrokes('green', 0, 0.5)).toBe(1.00);
  });

  it('green without feet parameter uses the closest green benchmark', () => {
    const result = getExpectedStrokes('green', 100);
    expect(result).toBe(2.18);
  });

  it('sand at very close distance (20 yards) → uses benchmark', () => {
    expect(getExpectedStrokes('sand', 20)).toBe(2.53);
  });
});

// ============================================================================
// EDGE CASES: calculateStrokesGainedForShot
// ============================================================================

describe('calculateStrokesGainedForShot edge cases', () => {
  it('penalty shot returns null (lie_before present but is_penalty)', () => {
    const shot = makeRawShot({
      lie_before: 'fairway', distance_to_hole_before: 150,
      result: 'penalty', is_penalty: true, distance_to_hole_after: 150,
    });
    // SG is still calculable (not null) since lie_before and distance are present
    const sg = calculateStrokesGainedForShot(shot);
    expect(sg).not.toBeNull();
  });

  it('holed putt from 1 foot → SG near 0 (expected ~ 1.0)', () => {
    const shot = makeRawShot({
      lie_before: 'green', distance_to_hole_before: 1, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
    });
    const sg = calculateStrokesGainedForShot(shot);
    expect(sg).not.toBeNull();
    // SG = 1.00 - (1 + 0) = 0.00
    expect(sg).toBeCloseTo(0.0, 1);
  });

  it('sand shot to green', () => {
    const shot = makeRawShot({
      lie_before: 'sand', distance_to_hole_before: 30, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 10, distance_unit_after: 'feet',
    });
    const sg = calculateStrokesGainedForShot(shot);
    expect(sg).not.toBeNull();
    // SG = expected(30yd sand) - (1 + expected(10ft green)) = 2.60 - (1 + 1.61) = -0.01
    expect(sg).toBeCloseTo(-0.01, 1);
  });
});

// ============================================================================
// EDGE CASES: calculateHoleStatsFromShots
// ============================================================================

describe('calculateHoleStatsFromShots edge cases', () => {
  it('handles out-of-order shots (sorts by shot_number)', () => {
    const shots = [
      makeRawShot({ shot_number: 3, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 10, distance_unit_before: 'feet', result: 'hole', distance_to_hole_after: 0 }),
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, result: 'fairway', distance_to_hole_after: 150 }),
      makeRawShot({ shot_number: 2, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 150, result: 'green', distance_to_hole_after: 10, distance_unit_after: 'feet' }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 4);
    expect(stats.score).toBe(3);
    expect(stats.greenInRegulation).toBe(true);
  });

  it('par 5 GIR (green in 3)', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 540, result: 'fairway', distance_to_hole_after: 260 }),
      makeRawShot({ shot_number: 2, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 260, result: 'fairway', distance_to_hole_after: 100 }),
      makeRawShot({ shot_number: 3, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 100, result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
      makeRawShot({ shot_number: 4, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 20, distance_unit_before: 'feet', result: 'hole', distance_to_hole_after: 0 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 5);
    expect(stats.greenInRegulation).toBe(true);
    expect(stats.score).toBe(4); // birdie on par 5
    expect(stats.scrambleAttempt).toBe(false);
  });

  it('par 5 miss GIR (green in 4)', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 540, result: 'fairway', distance_to_hole_after: 260 }),
      makeRawShot({ shot_number: 2, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 260, result: 'fairway', distance_to_hole_after: 100 }),
      makeRawShot({ shot_number: 3, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 100, result: 'rough', distance_to_hole_after: 30 }),
      makeRawShot({ shot_number: 4, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 30, result: 'green', distance_to_hole_after: 10, distance_unit_after: 'feet' }),
      makeRawShot({ shot_number: 5, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 10, distance_unit_before: 'feet', result: 'hole', distance_to_hole_after: 0 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 5);
    expect(stats.greenInRegulation).toBe(false);
    expect(stats.scrambleAttempt).toBe(true);
    expect(stats.scrambleMade).toBe(true); // par on par 5
  });

  it('no green hit (never reaches green)', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, result: 'rough', distance_to_hole_after: 200 }),
      makeRawShot({ shot_number: 2, shot_type: 'approach', lie_before: 'rough', distance_to_hole_before: 200, result: 'rough', distance_to_hole_after: 50 }),
      makeRawShot({ shot_number: 3, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 50, result: 'rough', distance_to_hole_after: 20 }),
      makeRawShot({ shot_number: 4, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 20, result: 'rough', distance_to_hole_after: 10 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 4);
    expect(stats.greenInRegulation).toBe(false);
    expect(stats.scrambleAttempt).toBe(true);
    // Green never found → NO approach proximity. The approach finished off-green at
    // 50 yards; the old code ran that through normalizeToFeet (×3 = 150 "ft") and
    // reported a fake on-green proximity. Proximity is on-green-only now → null.
    expect(stats.approachProximity).toBeNull();
  });

  it('par 3 miss GIR (tee shot misses green)', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 180, result: 'rough', distance_to_hole_after: 20, miss_direction: 'short' }),
      makeRawShot({ shot_number: 2, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 20, result: 'green', distance_to_hole_after: 5, distance_unit_after: 'feet' }),
      makeRawShot({ shot_number: 3, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 5, distance_unit_before: 'feet', result: 'hole', distance_to_hole_after: 0 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 3);
    expect(stats.greenInRegulation).toBe(false);
    expect(stats.scrambleAttempt).toBe(true);
    expect(stats.scrambleMade).toBe(true); // par
  });

  it('sand save failed (bogey)', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, result: 'fairway', distance_to_hole_after: 150 }),
      makeRawShot({ shot_number: 2, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 150, result: 'sand', distance_to_hole_after: 20 }),
      makeRawShot({ shot_number: 3, shot_type: 'around_green', lie_before: 'sand', distance_to_hole_before: 20, result: 'green', distance_to_hole_after: 15, distance_unit_after: 'feet' }),
      makeRawShot({ shot_number: 4, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 15, distance_unit_before: 'feet', result: 'green', distance_to_hole_after: 3, distance_unit_after: 'feet' }),
      makeRawShot({ shot_number: 5, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 3, distance_unit_before: 'feet', result: 'hole', distance_to_hole_after: 0 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 4);
    expect(stats.sandSaveAttempt).toBe(true);
    expect(stats.sandSaveMade).toBe(false); // bogey > par
  });

  it('single shot hole-in-one on par 3', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 180, distance_unit_before: 'yards', result: 'hole', distance_to_hole_after: 0 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 3);
    expect(stats.score).toBe(1);
    expect(stats.putts).toBe(0);
    expect(stats.greenInRegulation).toBe(true);
    expect(stats.scrambleAttempt).toBe(false);
  });

  it('multiple penalties on same hole', () => {
    const shots = [
      makeRawShot({ shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, result: 'fairway', distance_to_hole_after: 250 }),
      makeRawShot({ shot_number: 2, shot_type: 'penalty', lie_before: 'fairway', result: 'penalty', distance_to_hole_after: 250, is_penalty: true }),
      makeRawShot({ shot_number: 3, shot_type: 'penalty', lie_before: 'fairway', result: 'penalty', distance_to_hole_after: 250, is_penalty: true }),
      makeRawShot({ shot_number: 4, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 250, result: 'green', distance_to_hole_after: 15, distance_unit_after: 'feet' }),
      makeRawShot({ shot_number: 5, shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: 15, distance_unit_before: 'feet', result: 'hole', distance_to_hole_after: 0 }),
    ];
    const stats = calculateHoleStatsFromShots(shots, 4);
    expect(stats.penalties).toBe(2);
    expect(stats.score).toBe(5);
  });
});

// ============================================================================
// EDGE CASES: calculateStatsFromShots integration
// ============================================================================

describe('calculateStatsFromShots edge cases', () => {
  it('handles shots with no matching hole (skips gracefully)', () => {
    const shots = par4BirdieRawShots(99); // hole 99
    const holes: ReturnType<typeof makeHoleInfo>[] = [];
    const rounds = [makeRoundInfo()];
    const stats = calculateStatsFromShots(shots, holes, rounds);
    // Shots for hole 99 have no HoleInfo, so should be excluded.
    expect(stats.holesPlayed).toBe(0);
  });

  it('handles round type aggregation (practice only)', () => {
    const shots = par4BirdieRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const rounds = [makeRoundInfo({ round_type: 'practice' })];
    const stats = calculateStatsFromShots(shots, holes, rounds);
    expect(stats.practiceRounds).toBe(1);
    expect(stats.tournamentRounds).toBe(0);
    expect(stats.qualifyingRounds).toBe(0);
  });

  it('handles qualifying round type normalization', () => {
    const shots = par4BirdieRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const rounds = [makeRoundInfo({ round_type: 'qualifying' })];
    const stats = calculateStatsFromShots(shots, holes, rounds);
    expect(stats.qualifyingRounds).toBe(1);
  });

  it('counts eagles correctly', () => {
    // Par 4 in 2 shots = eagle
    const shots = [
      makeRawShot({ hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 350, result: 'fairway', distance_to_hole_after: 120 }),
      makeRawShot({ hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 120, result: 'hole', distance_to_hole_after: 0 }),
    ];
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const rounds = [makeRoundInfo()];
    const stats = calculateStatsFromShots(shots, holes, rounds);
    expect(stats.totalEagles).toBe(1);
  });
});

// ============================================================================
// EDGE CASES: safePercent / safeAverage
// ============================================================================

describe('safePercent edge cases', () => {
  it('handles numerator > denominator (> 100%)', () => {
    expect(safePercent(15, 10)).toBe(150.0);
  });

  it('rounds 1/3 correctly', () => {
    expect(safePercent(1, 3)).toBe(33.3);
  });

  it('rounds 2/3 correctly', () => {
    expect(safePercent(2, 3)).toBe(66.7);
  });

  it('handles floating point inputs', () => {
    expect(safePercent(2.5, 10)).toBe(25.0);
  });
});

describe('safeAverage edge cases', () => {
  it('total=0, count>0 → 0', () => {
    expect(safeAverage(0, 5)).toBe(0);
  });

  it('rounds 1/3 correctly', () => {
    expect(safeAverage(1, 3)).toBe(0.33);
  });
});

// ============================================================================
// EDGE CASES: formatStat
// ============================================================================

describe('formatStat edge cases', () => {
  it('formats zero with suffix', () => {
    expect(formatStat(0, '%')).toBe('0.0%');
  });

  it('formats negative number', () => {
    expect(formatStat(-72.5, '%')).toBe('-72.5%');
  });
});

// ============================================================================
// LEGACY-BAND REGRESSION GUARD (aggregate putt make% + approach prox bands)
// ----------------------------------------------------------------------------
// The per-band aggregate fields on GolfStats (puttMakePct*, approachProx*) were
// previously only covered indirectly (the bucket function + per-hole fields are
// tested, but the top-level calculator's mapping of buckets → aggregate band
// fields was not asserted end-to-end). A future edit to getPuttDistanceBucket's
// boundaries — or to which puttMake[bucket] feeds which puttMakePct* field —
// could silently shift e.g. a 22 ft putt out of puttMakePct20_25 and into
// puttMakePct15_20 with NO test failure.
//
// This block pins the CURRENT, unchanged behavior of calculateStatsFromShots:
// it builds first-putt fixtures at distances placed deliberately at/around the
// legacy bucket boundaries and asserts each putt lands in the correct band
// field. It MUST PASS against the unchanged calculator (it captures the
// baseline). If it ever fails, a band boundary moved — fail loudly so the shift
// is intentional, not silent.
//
// NOTE: the legacy bands (15_20 / 20_25 / 25_30 / 30_35 / 35_plus) and the v3
// bands (15_25 / 25_plus) coexist permanently — this guard only concerns the
// LEGACY GolfStats fields the calculator produces today.
// ============================================================================

describe('legacy-band regression guard (putt make% aggregate bands)', () => {
  // Build a putt-only hole with a KNOWN first-putt distance (feet).
  //   made === true  → one-putt hole (firstPutt result = 'hole')  → counts as a "make"
  //   made === false → two-putt hole (firstPutt leaves a tap-in)   → counts as a "miss"
  // The bucket is determined SOLELY by the first putt's distance_to_hole_before,
  // so a make+miss pair at the same distance gives a band with total=2, made=1
  // → puttMakePct === 50 when the distance lands in that band.
  function puttHole(
    holeNumber: number,
    firstPuttFeet: number,
    made: boolean,
  ): RawShot[] {
    // Par-3 tee → green so the hole is well-formed; only the putts drive the band.
    const teeToGreen = makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'non_driver',
      lie_before: 'tee', distance_to_hole_before: 160, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: firstPuttFeet, distance_unit_after: 'feet',
      shot_distance: 160,
    });

    if (made) {
      return [
        teeToGreen,
        makeRawShot({
          hole_number: holeNumber, shot_number: 2, shot_type: 'putting', club_type: 'putter',
          lie_before: 'green', distance_to_hole_before: firstPuttFeet, distance_unit_before: 'feet',
          result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
          shot_distance: 0, putt_distance_feet: firstPuttFeet, putt_made: true,
        }),
      ];
    }
    return [
      teeToGreen,
      makeRawShot({
        hole_number: holeNumber, shot_number: 2, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: firstPuttFeet, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet',
        shot_distance: 0, putt_distance_feet: firstPuttFeet, putt_made: false,
      }),
      makeRawShot({
        hole_number: holeNumber, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 2, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        shot_distance: 0, putt_distance_feet: 2, putt_made: true,
      }),
    ];
  }

  // 9 legacy bands. One make + one miss in each → each band should report 50%.
  // Distances chosen to sit cleanly inside each legacy bucket (boundaries are
  // <=3, <=5, <=10, <=15, <=20, <=25, <=30, <=35, else 35_plus).
  const BANDS: Array<{ feet: number; field: keyof GolfStats; bucket: string }> = [
    { feet: 2,  field: 'puttMakePct0_3',    bucket: '0_3' },
    { feet: 4,  field: 'puttMakePct3_5',    bucket: '3_5' },
    { feet: 7,  field: 'puttMakePct5_10',   bucket: '5_10' },
    { feet: 12, field: 'puttMakePct10_15',  bucket: '10_15' },
    { feet: 17, field: 'puttMakePct15_20',  bucket: '15_20' },
    { feet: 22, field: 'puttMakePct20_25',  bucket: '20_25' },
    { feet: 27, field: 'puttMakePct25_30',  bucket: '25_30' },
    { feet: 32, field: 'puttMakePct30_35',  bucket: '30_35' },
    { feet: 40, field: 'puttMakePct35Plus', bucket: '35_plus' },
  ];

  // Assemble: 2 holes per band (make + miss) across distinct hole numbers.
  const shots: RawShot[] = [];
  const holes: HoleInfo[] = [];
  let holeNumber = 1;
  for (const band of BANDS) {
    shots.push(...puttHole(holeNumber, band.feet, true));
    holes.push(makeHoleInfo({ hole_number: holeNumber, par: 3, yardage: 160 }));
    holeNumber++;
    shots.push(...puttHole(holeNumber, band.feet, false));
    holes.push(makeHoleInfo({ hole_number: holeNumber, par: 3, yardage: 160 }));
    holeNumber++;
  }
  const rounds = [makeRoundInfo({ holes_played: holes.length })];
  const stats = calculateStatsFromShots(shots, holes, rounds);

  it('routes each first-putt distance into the correct legacy make% band (50% each)', () => {
    for (const band of BANDS) {
      expect(stats[band.field], `${band.feet}ft expected in ${String(band.field)} (bucket ${band.bucket})`).toBe(50);
    }
  });

  it('pins the 15 ft boundary into puttMakePct10_15 (<=15 closes the 10_15 band)', () => {
    const s = calculateStatsFromShots(
      [...puttHole(1, 15, true), ...puttHole(2, 15, false)],
      [makeHoleInfo({ hole_number: 1, par: 3, yardage: 160 }), makeHoleInfo({ hole_number: 2, par: 3, yardage: 160 })],
      [makeRoundInfo()],
    );
    expect(s.puttMakePct10_15).toBe(50);
    expect(s.puttMakePct15_20).toBeNull(); // no putts landed in 15_20
  });

  it('pins the 20 ft boundary into puttMakePct15_20 (<=20 closes the 15_20 band, NOT 20_25)', () => {
    const s = calculateStatsFromShots(
      [...puttHole(1, 20, true), ...puttHole(2, 20, false)],
      [makeHoleInfo({ hole_number: 1, par: 3, yardage: 160 }), makeHoleInfo({ hole_number: 2, par: 3, yardage: 160 })],
      [makeRoundInfo()],
    );
    expect(s.puttMakePct15_20).toBe(50);
    expect(s.puttMakePct20_25).toBeNull();
  });

  it('CRITICALLY: a 22 ft putt lands in puttMakePct20_25, NOT puttMakePct15_20', () => {
    const s = calculateStatsFromShots(
      [...puttHole(1, 22, true), ...puttHole(2, 22, false)],
      [makeHoleInfo({ hole_number: 1, par: 3, yardage: 160 }), makeHoleInfo({ hole_number: 2, par: 3, yardage: 160 })],
      [makeRoundInfo()],
    );
    expect(s.puttMakePct20_25).toBe(50);
    expect(s.puttMakePct15_20).toBeNull();
  });

  it('pins the 25 ft boundary into puttMakePct20_25 (<=25 closes the 20_25 band, NOT 25_30)', () => {
    const s = calculateStatsFromShots(
      [...puttHole(1, 25, true), ...puttHole(2, 25, false)],
      [makeHoleInfo({ hole_number: 1, par: 3, yardage: 160 }), makeHoleInfo({ hole_number: 2, par: 3, yardage: 160 })],
      [makeRoundInfo()],
    );
    expect(s.puttMakePct20_25).toBe(50);
    expect(s.puttMakePct25_30).toBeNull();
  });
});

describe('legacy-band regression guard (approach proximity aggregate bands)', () => {
  // Cheap parallel guard for the approachProx* band fields. On a GIR par-3 the
  // calculator uses the tee shot's distance_to_hole_before (yards) to bucket via
  // getApproachDistanceBucket, and its distance_to_hole_after (normalized to
  // feet) as the proximity value. A 160 yd → green shot leaving 30 ft pins band
  // 150_175 at 30 ft; a 110 yd shot leaving 24 ft pins band 100_125 at 24 ft.
  function girPar3(holeNumber: number, approachYards: number, proxFeet: number): RawShot[] {
    return [
      makeRawShot({
        hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'non_driver',
        lie_before: 'tee', distance_to_hole_before: approachYards, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: proxFeet, distance_unit_after: 'feet',
        shot_distance: approachYards,
      }),
      makeRawShot({
        hole_number: holeNumber, shot_number: 2, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: proxFeet, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        shot_distance: 0, putt_distance_feet: proxFeet, putt_made: true,
      }),
    ];
  }

  const stats = calculateStatsFromShots(
    [...girPar3(1, 110, 24), ...girPar3(2, 160, 30)],
    [
      makeHoleInfo({ hole_number: 1, par: 3, yardage: 110 }),
      makeHoleInfo({ hole_number: 2, par: 3, yardage: 160 }),
    ],
    [makeRoundInfo()],
  );

  it('routes a 110 yd approach proximity into approachProx100_125 (feet)', () => {
    expect(stats.approachProx100_125).toBe(24);
  });

  it('routes a 160 yd approach proximity into approachProx150_175 (feet)', () => {
    expect(stats.approachProx150_175).toBe(30);
  });

  // Regression: a MISSED approach (off-green finish, stored in yards) must NOT
  // contribute to any proximity band. The old code ran the yards finish through
  // normalizeToFeet (×3) and reported it as on-green "feet", inflating bands ~2×.
  function missedApproachPar4(holeNumber: number, approachYards: number, missYards: number): RawShot[] {
    return [
      makeRawShot({
        hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
        lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: approachYards, distance_unit_after: 'yards',
        shot_distance: 400 - approachYards,
      }),
      makeRawShot({
        hole_number: holeNumber, shot_number: 2, shot_type: 'approach', club_type: 'non_driver',
        lie_before: 'fairway', distance_to_hole_before: approachYards, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: missYards, distance_unit_after: 'yards',
        shot_distance: approachYards - missYards,
      }),
      makeRawShot({
        hole_number: holeNumber, shot_number: 3, shot_type: 'around_green', club_type: 'non_driver',
        lie_before: 'rough', distance_to_hole_before: missYards, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 8, distance_unit_after: 'feet', shot_distance: missYards,
      }),
      makeRawShot({
        hole_number: holeNumber, shot_number: 4, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 8, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        shot_distance: 0, putt_distance_feet: 8, putt_made: true,
      }),
    ];
  }

  it('excludes a missed approach (off-green yards) from the proximity bands — no ×3 inflation', () => {
    const mixed = calculateStatsFromShots(
      [...girPar3(1, 160, 30), ...missedApproachPar4(2, 160, 40)],
      [
        makeHoleInfo({ hole_number: 1, par: 3, yardage: 160 }),
        makeHoleInfo({ hole_number: 2, par: 4, yardage: 400 }),
      ],
      [makeRoundInfo()],
    );
    // Both approaches are ~160 yd → band 150_175. Only the GIR hole (30 ft) contributes;
    // the missed approach (40 yd off-green) would have been ×3'd to 120 ft and dragged the
    // band to 75. On-green-only keeps it at 30, and there is no fabricated "missed" proximity.
    expect(mixed.approachProx150_175).toBe(30);
    expect(mixed.approachProximityWhenMissedGreen).toBeNull();
    expect(mixed.approachProximityWhenHitGreen).toBe(30);
  });
});
