import { describe, it, expect } from 'vitest';
import { calculateStatsFromShots } from '../golf-stats-calculator-shots';
import type { RawShot, HoleInfo } from '../golf-stats-calculator-shots';
import { makeRawShot, makeHoleInfo, makeRoundInfo } from '@/test/fixtures/golf-shots';

/**
 * Coverage for the short-game "Misses" tab additions:
 *   - scramblingByMissDirection / scramblingMissDirectionTotal
 *   - scrambleFairway/Rough/Sand Attempts+Made + scramblingPctFringe (+ counts)
 *   - atgProximityAvg / atgProximityByLie
 *
 * Every metric here is derived PURELY from raw shot rows (lie_before,
 * miss_direction, distance_to_hole_after) already flowing through
 * golf-stats-calculator-shots.ts — no new DB reads. Tests pin the
 * null-honest contract: a metric with no qualifying data is null/omitted,
 * never fabricated or zeroed.
 */

const round = makeRoundInfo({ id: 'round-1', holes_played: 18 });

// ============================================================================
// scramblingByMissDirection
// ============================================================================

describe('short-game misses — scrambling by miss direction', () => {
  it('buckets a simple direction (short) and computes pct + shareOfMisses', () => {
    // Par 4: tee->fairway, approach misses green SHORT, chip reaches green, 1 putt -> par (up-and-down)
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 20, distance_unit_after: 'yards',
        miss_direction: 'short', shot_distance: 130,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'rough',
        distance_to_hole_before: 20, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 4, distance_unit_after: 'feet', shot_distance: 20,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 4, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 4 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.scrambleAttempts).toBe(1);
    expect(stats.scramblesMade).toBe(1);
    expect(stats.scramblingMissDirectionTotal).toBe(1);
    expect(stats.scramblingByMissDirection.short).toEqual({
      attempts: 1, made: 1, pct: 100, shareOfMisses: 100,
    });
    // Directions that never happened are OMITTED, not zeroed.
    expect(stats.scramblingByMissDirection.long).toBeUndefined();
    expect(stats.scramblingByMissDirection.left).toBeUndefined();
    expect(stats.scramblingByMissDirection.right).toBeUndefined();
  });

  it('a compound direction (short_left) counts toward BOTH axes', () => {
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 12, distance_unit_after: 'yards',
        miss_direction: 'short_left', shot_distance: 138,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'rough',
        distance_to_hole_before: 12, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 4, distance_unit_after: 'feet', shot_distance: 12,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 4, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 4 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.scramblingMissDirectionTotal).toBe(1); // ONE attempt, not two
    expect(stats.scramblingByMissDirection.short).toEqual({
      attempts: 1, made: 1, pct: 100, shareOfMisses: 100,
    });
    expect(stats.scramblingByMissDirection.left).toEqual({
      attempts: 1, made: 1, pct: 100, shareOfMisses: 100,
    });
    expect(stats.scramblingByMissDirection.long).toBeUndefined();
    expect(stats.scramblingByMissDirection.right).toBeUndefined();
  });

  it('excludes scramble attempts with unknown miss direction from the breakdown (null-honest)', () => {
    // Missed GIR, but the approach shot's own miss_direction was never logged.
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 25, distance_unit_after: 'yards',
        miss_direction: null, shot_distance: 125,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'fairway',
        distance_to_hole_before: 25, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 10, distance_unit_after: 'feet', shot_distance: 25,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 10, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet', putt_made: false,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 5, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 2, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 4 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.scrambleAttempts).toBe(1); // still a real scramble attempt
    expect(stats.scramblingMissDirectionTotal).toBe(0); // but NOT direction-tagged
    expect(stats.scramblingByMissDirection).toEqual({});
    expect(stats.scrambleFairwayAttempts).toBe(1); // lie breakdown is unaffected
  });

  it('returns an empty breakdown when there are no scramble attempts', () => {
    const stats = calculateStatsFromShots([], [], []);
    expect(stats.scramblingByMissDirection).toEqual({});
    expect(stats.scramblingMissDirectionTotal).toBe(0);
  });
});

// ============================================================================
// Scrambling by lie — fringe bucket + attempt/made counts
// ============================================================================

describe('short-game misses — scrambling by lie (fringe + counts)', () => {
  it('buckets a fringe chip separately from fairway/rough/sand', () => {
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 8, distance_unit_after: 'yards', shot_distance: 142,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'fringe',
        distance_to_hole_before: 8, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 3, distance_unit_after: 'feet', shot_distance: 8,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 3, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 4 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.scrambleFringeAttempts).toBe(1);
    expect(stats.scrambleFringeMade).toBe(1);
    expect(stats.scramblingPctFringe).toBe(100);
    // The fairway/rough/sand trio is untouched by the fringe attempt.
    expect(stats.scrambleFairwayAttempts).toBe(0);
    expect(stats.scramblingPctFairway).toBeNull();
  });

  it('exposes attempt/made counts alongside the existing fairway/rough/sand percentages', () => {
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'sand', distance_to_hole_after: 15, distance_unit_after: 'yards', shot_distance: 135,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'sand',
        distance_to_hole_before: 15, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 5, distance_unit_after: 'feet', shot_distance: 15,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 5, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet', putt_made: false,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 5, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 2, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 4 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    // 5 shots on a par 4 = bogey -> scramble NOT made.
    expect(stats.scrambleSandAttempts).toBe(1);
    expect(stats.scrambleSandMade).toBe(0);
    expect(stats.scramblingPctSand).toBe(0);
  });
});

// ============================================================================
// atgProximityAvg / atgProximityByLie
// ============================================================================

describe('short-game misses — proximity after chip', () => {
  it('averages proximity ONLY for chips that reached the green, by lie', () => {
    // Hole A: sand chip reaches the green at 8ft.
    const holeA: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'sand', distance_to_hole_after: 15, distance_unit_after: 'yards', shot_distance: 135,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'sand',
        distance_to_hole_before: 15, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 8, distance_unit_after: 'feet', shot_distance: 15,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 8, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet', putt_made: false,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 5, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 2, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    // Hole B: rough chip reaches the green at 3ft.
    const holeB: RawShot[] = [
      makeRawShot({
        hole_number: 2, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 160, distance_unit_after: 'yards', shot_distance: 240,
      }),
      makeRawShot({
        hole_number: 2, shot_number: 2, shot_type: 'approach', lie_before: 'rough',
        distance_to_hole_before: 160, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 10, distance_unit_after: 'yards', shot_distance: 150,
      }),
      makeRawShot({
        hole_number: 2, shot_number: 3, shot_type: 'around_green', lie_before: 'rough',
        distance_to_hole_before: 10, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 3, distance_unit_after: 'feet', shot_distance: 10,
      }),
      makeRawShot({
        hole_number: 2, shot_number: 4, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 3, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [
      makeHoleInfo({ hole_number: 1, par: 4 }),
      makeHoleInfo({ hole_number: 2, par: 4 }),
    ];

    const stats = calculateStatsFromShots([...holeA, ...holeB], holes, [round]);

    expect(stats.atgProximityAvg).toBeCloseTo((8 + 3) / 2, 5);
    expect(stats.atgProximityByLie.sand).toBe(8);
    expect(stats.atgProximityByLie.rough).toBe(3);
    expect(stats.atgProximityByLie.fairway).toBeNull();
  });

  it('a holed chip contributes 0, not null', () => {
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 10, distance_unit_after: 'yards', shot_distance: 140,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'rough',
        distance_to_hole_before: 10, distance_unit_before: 'yards',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'yards', shot_distance: 10,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 4 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.atgProximityAvg).toBe(0);
    expect(stats.atgProximityByLie.rough).toBe(0);
  });

  it('a chip that never reaches the green does not affect atgProximityAvg (still reflected in ATG efficiency)', () => {
    // Par 5: tee, layup, approach misses green LEFT, first chip stays off the
    // green (chunked), second chip reaches the green.
    const shots: RawShot[] = [
      makeRawShot({
        hole_number: 1, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 540, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 300, distance_unit_after: 'yards', shot_distance: 240,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 300, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 40, distance_unit_after: 'yards', shot_distance: 260,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'approach', lie_before: 'fairway',
        distance_to_hole_before: 40, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 12, distance_unit_after: 'yards',
        miss_direction: 'left', shot_distance: 30,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 4, shot_type: 'around_green', lie_before: 'rough',
        distance_to_hole_before: 12, distance_unit_before: 'yards',
        result: 'rough', distance_to_hole_after: 5, distance_unit_after: 'yards', shot_distance: 8,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 5, shot_type: 'around_green', lie_before: 'rough',
        distance_to_hole_before: 5, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 6, distance_unit_after: 'feet', shot_distance: 5,
      }),
      makeRawShot({
        hole_number: 1, shot_number: 6, shot_type: 'putting', lie_before: 'green',
        distance_to_hole_before: 6, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
      }),
    ];
    const holes: HoleInfo[] = [makeHoleInfo({ hole_number: 1, par: 5 })];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    // Only the SECOND chip (the one that actually reached the green) feeds
    // proximity — the chunked first chip is excluded, never fabricated.
    expect(stats.atgProximityAvg).toBe(6);
    expect(stats.atgProximityByLie.rough).toBe(6);
    // Both around-green shots still feed ATG efficiency (pre-existing behavior, unaffected).
    expect(stats.atgEfficiency0_10).not.toBeNull();
    expect(stats.atgEfficiency10_20).not.toBeNull();
  });

  it('is null when no around-green shot has reached the green with a known leave', () => {
    const stats = calculateStatsFromShots([], [], []);
    expect(stats.atgProximityAvg).toBeNull();
    expect(stats.atgProximityByLie).toEqual({ fairway: null, rough: null, sand: null });
  });
});
