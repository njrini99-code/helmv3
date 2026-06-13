import { describe, it, expect } from 'vitest';
import {
  calculateStatsFromShots,
  calculateHoleStatsFromShots,
} from '../golf-stats-calculator-shots';
import type { RawShot } from '../golf-stats-calculator-shots';
import {
  makeRawShot,
  makeHoleInfo,
  makeRoundInfo,
  par4BirdieRawShots,
  threePuttRawShots,
} from '@/test/fixtures/golf-shots';

/**
 * Regression tests for the approach-putting average-leave metric.
 *
 * Spec: "average distance left to the hole after a putt is hit; a make is 0;
 * average across ALL putts (not just first putts); also broken out by starting
 * distance segment."
 */

const round = makeRoundInfo({ id: 'round-1', holes_played: 18 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One-putt make from `dist` feet (result = hole, leave = 0). */
function makePutt(dist: number, leave: number | null, made: boolean, holeNumber = 1): RawShot {
  return makeRawShot({
    hole_number: holeNumber,
    shot_number: 1,
    shot_type: 'putting',
    club_type: 'putter',
    lie_before: 'green',
    distance_to_hole_before: dist,
    distance_unit_before: 'feet',
    result: made ? 'hole' : 'green',
    distance_to_hole_after: made ? 0 : leave,
    distance_unit_after: 'feet',
    putt_distance_feet: dist,
    putt_made: made,
  });
}

// ---------------------------------------------------------------------------
// Hole-level: firstPuttLeave correctness (existing behaviour unchanged)
// ---------------------------------------------------------------------------

describe('calculateHoleStatsFromShots — firstPuttLeave', () => {
  it('is null when the first putt is holed (make = leave 0 for aggregate, not null)', () => {
    // A holed first putt: distance_to_hole_after = 0, result = hole.
    const shots = par4BirdieRawShots();
    const stats = calculateHoleStatsFromShots(shots, 4);
    // Existing behaviour: firstPuttLeave is null (the hole-level field still
    // uses null for made putts — only the aggregate uses 0).
    expect(stats.firstPuttLeave).toBeNull();
  });

  it('records firstPuttLeave for a missed putt', () => {
    const shots = threePuttRawShots();
    const stats = calculateHoleStatsFromShots(shots, 4);
    // three-putt fixture: first putt from 40 ft, leaves 8 ft.
    expect(stats.firstPuttLeave).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Aggregate: approachPuttAvgLeave
// ---------------------------------------------------------------------------

describe('calculateStatsFromShots — approachPuttAvgLeave', () => {
  it('is null when no putting data', () => {
    const stats = calculateStatsFromShots([], [], []);
    expect(stats.approachPuttAvgLeave).toBeNull();
  });

  it('is 0 for a single holed putt (make = 0 leave)', () => {
    // Par 4 birdie — one putt from 10 ft, holed.
    const shots = par4BirdieRawShots(1);
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    expect(stats.approachPuttAvgLeave).toBe(0);
  });

  it('averages leave of a single missed putt', () => {
    // 25 ft putt missed, leaves 3 ft.
    const shots = [
      makeRawShot({ hole_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250 }),
      makeRawShot({ hole_number: 1, shot_type: 'approach',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 25, distance_unit_after: 'feet' }),
      makePutt(25, 3, false),
      makePutt(3, 0, true),
    ];
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    // Putts: 25→miss (leave 3), 3→make (leave 0). avg = (3 + 0) / 2 = 1.5
    expect(stats.approachPuttAvgLeave).toBeCloseTo(1.5, 3);
  });

  it('calculates average across ALL putts on a three-putt hole', () => {
    // three-putt fixture: 40 ft miss (leave 8), 8 ft miss (leave 2), 2 ft make (leave 0).
    // avg = (8 + 2 + 0) / 3 = 10 / 3 ≈ 3.333
    const shots = threePuttRawShots(1);
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    // safeAverage rounds to 2 dp: 10/3 = 3.33
    expect(stats.approachPuttAvgLeave).toBeCloseTo(3.33, 2);
  });

  it('excludes missed putts with unknown leave (null-honest)', () => {
    // A missed putt whose distance_to_hole_after is null must be excluded.
    const shots = [
      makeRawShot({ hole_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250 }),
      makeRawShot({ hole_number: 1, shot_type: 'approach',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
      // Missed putt, no leave recorded.
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: 20, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: null, distance_unit_after: 'feet',
        putt_distance_feet: 20, putt_made: false,
      }),
      // Make from 5 ft.
      makePutt(5, 0, true, 1),
    ];
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    // Only the 5 ft make (leave = 0) qualifies — the missed 20 ft putt is excluded.
    expect(stats.approachPuttAvgLeave).toBe(0);
  });

  it('counts a putt with no starting distance in the OVERALL average (only the band split needs a start distance)', () => {
    // Spec: missing starting distance only excludes the per-band metric — the
    // headline average still counts any putt with a known outcome/leave. A holed
    // putt with null distance_to_hole_before has a known leave of 0, so it must
    // contribute 0 to the overall average (NOT be dropped, which would bias the
    // advertised average upward).
    const shots = [
      makeRawShot({ hole_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250 }),
      makeRawShot({ hole_number: 1, shot_type: 'approach',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 15, distance_unit_after: 'feet' }),
      makeRawShot({
        hole_number: 1, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: null, distance_unit_before: 'feet',
        result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
        putt_distance_feet: null, putt_made: true,
      }),
    ];
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    // The holed putt (leave 0) counts in the overall average even though it has
    // no starting distance: sum 0 / count 1 = 0.
    expect(stats.approachPuttAvgLeave).toBe(0);
    // ...but it is excluded from every per-band entry (no start distance → no band key).
    expect(stats.approachPuttAvgLeaveByBand).toEqual({});
  });

  it('overall average counts an unbanded putt while the band split drops it', () => {
    // Hole 1: a missed putt from a KNOWN 20 ft start (leave 5) — banded.
    // Hole 2: a missed putt with UNKNOWN start (leave 1) — counts overall, no band.
    // Overall: (5 + 1) / 2 = 3.0. Band 15_20: 5/1 = 5. No band for the unbanded putt.
    const shots = [
      makeRawShot({ hole_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250 }),
      makeRawShot({ hole_number: 1, shot_type: 'approach',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
      makePutt(20, 5, false, 1),
      makePutt(5, 0, true, 1),
      makeRawShot({ hole_number: 2, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 350, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 140, distance_unit_after: 'yards', shot_distance: 210 }),
      makeRawShot({ hole_number: 2, shot_type: 'approach',
        distance_to_hole_before: 140, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 12, distance_unit_after: 'feet' }),
      // Missed putt, start distance unknown, leave 1.
      makeRawShot({
        hole_number: 2, shot_number: 3, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', distance_to_hole_before: null, distance_unit_before: 'feet',
        result: 'green', distance_to_hole_after: 1, distance_unit_after: 'feet',
        putt_distance_feet: null, putt_made: false,
      }),
      makePutt(1, 0, true, 2),
    ];
    const stats = calculateStatsFromShots(
      shots,
      [
        makeHoleInfo({ hole_number: 1, par: 4 }),
        makeHoleInfo({ hole_number: 2, par: 4 }),
      ],
      [round],
    );
    // Overall: leaves 5, 0 (5ft make), 1 (unbanded miss), 0 (1ft make) → (5+0+1+0)/4 = 1.5.
    expect(stats.approachPuttAvgLeave).toBeCloseTo(1.5, 3);
    // 20 ft → band 15_20, leave 5.
    expect(stats.approachPuttAvgLeaveByBand['15_20']).toBe(5);
    // The unbanded leave-1 putt does NOT create any band keyed on a fabricated start.
    // (5 ft make → 3_5 band leave 0; 1 ft make → 0_3 band leave 0; no '?'/null band key.)
    expect(Object.keys(stats.approachPuttAvgLeaveByBand).sort()).toEqual(['0_3', '15_20', '3_5']);
  });

  it('aggregates across multiple holes (sum/sum, not average-of-averages)', () => {
    // Hole 1: 10 ft make (leave 0).
    // Hole 2: three-putt — 40 ft miss (leave 8), 8 ft miss (leave 2), 2 ft make (leave 0).
    // Total: sum = 0 + 8 + 2 + 0 = 10, count = 4 → avg = 2.5
    const h1Shots = par4BirdieRawShots(1).map(s => ({ ...s, round_id: 'round-1' }));
    const h2Shots = threePuttRawShots(2).map(s => ({ ...s, round_id: 'round-1' }));
    const stats = calculateStatsFromShots(
      [...h1Shots, ...h2Shots],
      [
        makeHoleInfo({ hole_number: 1, par: 4 }),
        makeHoleInfo({ hole_number: 2, par: 4 }),
      ],
      [round],
    );
    expect(stats.approachPuttAvgLeave).toBeCloseTo(2.5, 3);
  });
});

// ---------------------------------------------------------------------------
// Aggregate: approachPuttAvgLeaveByBand
// ---------------------------------------------------------------------------

describe('calculateStatsFromShots — approachPuttAvgLeaveByBand', () => {
  it('is an empty record when no putting data', () => {
    const stats = calculateStatsFromShots([], [], []);
    expect(stats.approachPuttAvgLeaveByBand).toEqual({});
  });

  it('places a 10 ft make into the 5_10 band with avg 0', () => {
    // 10 ft make → bucket '5_10', leave = 0.
    const shots = par4BirdieRawShots(1);
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    expect(stats.approachPuttAvgLeaveByBand['5_10']).toBe(0);
  });

  it('places a 25 ft missed putt into the 20_25 band with its leave', () => {
    const shots = [
      makeRawShot({ hole_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250 }),
      makeRawShot({ hole_number: 1, shot_type: 'approach',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 25, distance_unit_after: 'feet' }),
      makePutt(25, 3, false),
      makePutt(3, 0, true),
    ];
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    // 25 ft → '20_25' band (getPuttDistanceBucket: 25 > 20 so bucket is 20_25).
    expect(stats.approachPuttAvgLeaveByBand['20_25']).toBe(3);
    // 3 ft make → '0_3' band, leave 0.
    expect(stats.approachPuttAvgLeaveByBand['0_3']).toBe(0);
  });

  it('averages multiple putts in the same band (sum/sum)', () => {
    // Two putts both starting from 20 ft (band 15_20):
    // Putt 1: miss, leaves 4 ft. Putt 2: miss, leaves 6 ft.
    // Band avg = (4 + 6) / 2 = 5.
    const shots = [
      makeRawShot({ hole_number: 1, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 400, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250 }),
      makeRawShot({ hole_number: 1, shot_type: 'approach',
        distance_to_hole_before: 150, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
      makePutt(20, 4, false, 1),
      makePutt(4, 0, true, 1),
      makeRawShot({ hole_number: 2, shot_type: 'tee', lie_before: 'tee',
        distance_to_hole_before: 350, distance_unit_before: 'yards',
        result: 'fairway', distance_to_hole_after: 140, distance_unit_after: 'yards', shot_distance: 210 }),
      makeRawShot({ hole_number: 2, shot_type: 'approach',
        distance_to_hole_before: 140, distance_unit_before: 'yards',
        result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
      makePutt(20, 6, false, 2),
      makePutt(6, 0, true, 2),
    ];
    const stats = calculateStatsFromShots(
      shots,
      [
        makeHoleInfo({ hole_number: 1, par: 4 }),
        makeHoleInfo({ hole_number: 2, par: 4 }),
      ],
      [round],
    );
    // 20 ft → bucket '15_20' (getPuttDistanceBucket: 15 < 20 <= 20, so '15_20').
    expect(stats.approachPuttAvgLeaveByBand['15_20']).toBeCloseTo(5, 3);
  });

  it('three-putt: each putt in its own band with correct leave avg', () => {
    // three-putt fixture: 40→8, 8→2, 2→hole.
    // band '35_plus': avg = 8 / 1 = 8
    // band '5_10':    avg = 2 / 1 = 2
    // band '0_3':     avg = 0 / 1 = 0
    const shots = threePuttRawShots(1);
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    expect(stats.approachPuttAvgLeaveByBand['35_plus']).toBe(8);
    expect(stats.approachPuttAvgLeaveByBand['5_10']).toBe(2);
    expect(stats.approachPuttAvgLeaveByBand['0_3']).toBe(0);
  });

  it('does not fabricate a band entry when no eligible putts in that band', () => {
    // Only a 10 ft make — no putts from other bands.
    const shots = par4BirdieRawShots(1);
    const stats = calculateStatsFromShots(
      shots,
      [makeHoleInfo({ hole_number: 1, par: 4 })],
      [round],
    );
    // Other bands should not appear (omitted, not null-padded).
    expect(stats.approachPuttAvgLeaveByBand['35_plus']).toBeUndefined();
    expect(stats.approachPuttAvgLeaveByBand['20_25']).toBeUndefined();
  });
});
