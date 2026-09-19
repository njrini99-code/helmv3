import { describe, expect, it } from 'vitest';
import { markTerminal } from '../hole-lifecycle';
import type { LieClass } from '../lie-classifier';
import { createPenaltyEvent } from '../penalty-event';
import type { ShotAnchor } from '../shot-anchor';
import { toRoundShots } from '../to-round-shots';

// SYNTHETIC TEST VECTORS: a straight par 4 along the x axis; the green centre
// sits at x = 382 m, the daily pin is unspecified.
const GREEN: [number, number] = [382, 0];
const HOLE = { number: 7, par: 4, yardage: 420 };
function mark(sequence: number, x: number, lie: LieClass, over: Partial<ShotAnchor> = {}): ShotAnchor {
  return { schemaVersion: 2, id: `m${sequence}`, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h7', holeId: 7, sequence,
    tapTimestamp: new Date(1_000_000 + sequence * 60_000).toISOString(), finalizedTimestamp: new Date(1_000_750 + sequence * 60_000).toISOString(), provisional: false,
    positionWgs84: [0, 0, null], positionENU: [x, 0, 0], covarianceENU2D: [[9, 0], [0, 9]], sigmaM: 3, reportedAccuracyMedianM: 3, calibratedUncertaintyM: 3, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: lie, p: 1 }], primaryLie: lie, confidence: 'HIGH',
    terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null, geometryVersion: 'g', terrainVersion: null,
    terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...over };
}
const identity = { roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h7', holeId: 7 };

describe('to-round-shots adapter (§77)', () => {
  it('adapts a cup-marked hole into ShotRecords and HoleStats with provenance, no club invention and the pin unspecified', () => {
    const anchors = markTerminal([mark(0, 0, 'tee'), mark(1, 250, 'fairway'), mark(2, 380, 'green'), mark(3, 382, 'green')], 'm3', 'CUP_MARK');
    const result = toRoundShots({ anchors, hole: HOLE, greenCentreENU: GREEN });
    expect(result).toMatchObject({ complete: true, needsManualCompletion: false, penaltyStrokes: 0, basis: 'one_tap_anchors' });
    expect(result.shots.map(s => [s.shotNumber, s.shotType, s.clubType, s.lieBefore, s.result])).toEqual([
      [1, 'tee', 'non_driver', 'tee', 'fairway'], [2, 'approach', 'non_driver', 'fairway', 'green'], [3, 'putting', 'putter', 'green', 'hole'],
    ]);
    // Distances: to the green centre in yards, feet on the green, the cup at 0.
    expect(result.shots[0]).toMatchObject({ distanceToHoleBefore: 418, distanceUnitBefore: 'yards', distanceToHoleAfter: 144, distanceUnitAfter: 'yards', shotDistance: 273, isPenalty: false });
    expect(result.shots[1]).toMatchObject({ distanceToHoleBefore: 144, distanceToHoleAfter: 7, distanceUnitAfter: 'feet', shotDistance: 142 });
    expect(result.shots[2]).toMatchObject({ distanceToHoleBefore: 7, distanceUnitBefore: 'feet', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 2 });
    for (const shot of result.shots) expect(shot.provenance).toMatchObject({ source: 'one_tap_location', pin: 'UNSPECIFIED', clubSource: 'unknown', distanceBasis: 'inferred_endpoint_separation' });
    expect(result.shots[1]!.provenance).toMatchObject({ fromAnchorId: 'm1', toAnchorId: 'm2', sigmaStartM: 3, sigmaEndM: 3, confidenceStart: 'HIGH', horizontalM: 130 });
    expect(result.stats).toMatchObject({ holeNumber: 7, par: 4, score: 3, putts: 1, fairwayHit: true, greenInRegulation: true, usedDriver: null, drivingDistance: 273, penaltyStrokes: 0 });
  });

  it('feeds penalties into the official score as their own records after the stroke that found the trouble, and the drop mark stays an ordinary shot', () => {
    // tee → fairway → (into the water) drop → green → cup, with the penalty added while the ball was at the fairway mark.
    const anchors = markTerminal([mark(0, 0, 'tee'), mark(1, 250, 'fairway'), mark(2, 300, 'primary_rough'), mark(3, 380, 'green'), mark(4, 382, 'green')], 'm4', 'CUP_MARK');
    const penalty = createPenaltyEvent({ ...identity, id: 'p1' }, 'penalty_area', 1, 'm1', 1_090_000);
    const result = toRoundShots({ anchors, penalties: [penalty], hole: HOLE, greenCentreENU: GREEN });
    expect(result.shots.map(s => [s.shotNumber, s.shotType, s.result, s.isPenalty])).toEqual([
      [1, 'tee', 'fairway', false], [2, 'approach', 'rough', false], [3, 'penalty', 'penalty', true], [4, 'approach', 'green', false], [5, 'putting', 'hole', false],
    ]);
    expect(result.shots[2]).toMatchObject({ penaltyType: 'water', shotDistance: 0, lieBefore: 'fairway', distanceToHoleBefore: 144, provenance: { distanceBasis: 'penalty_event', penaltyEventId: 'p1', fromAnchorId: 'm1' } });
    expect(result.shots[3]).toMatchObject({ isPenalty: false, provenance: { fromAnchorId: 'm2', toAnchorId: 'm3' } });
    expect(result.stats).toMatchObject({ score: 5, penaltyStrokes: 1, putts: 1, greenInRegulation: false });
    expect(result).toMatchObject({ penaltyStrokes: 1, needsManualCompletion: false });
    // A two-stroke penalty is two records; one added before any mark opens the record.
    const early = createPenaltyEvent({ ...identity, id: 'p0' }, 'other', 2, null, 900_000);
    const shots = toRoundShots({ anchors, penalties: [early], hole: HOLE, greenCentreENU: GREEN }).shots;
    expect(shots.slice(0, 3).map(s => [s.shotNumber, s.isPenalty, s.lieBefore])).toEqual([[1, true, 'other'], [2, true, 'other'], [3, false, 'tee']]);
  });

  it('never scores a hole short: an inferred close, a missing tee mark or an unresolved penalty hands the hole back for manual completion', () => {
    const inferred = markTerminal([mark(0, 0, 'tee'), mark(1, 250, 'fairway'), mark(2, 380, 'green')], 'm2', 'NEXT_TEE_INFERRED');
    const a = toRoundShots({ anchors: inferred, hole: HOLE, greenCentreENU: GREEN });
    expect(a).toMatchObject({ complete: true, needsManualCompletion: true, stats: null });
    expect(a.integrity.flags).toEqual(['MISSING_CUP']);
    expect(a.shots.map(s => s.result)).toEqual(['fairway', 'green']);
    const late = markTerminal([mark(0, 250, 'fairway'), mark(1, 380, 'green'), mark(2, 382, 'green')], 'm2', 'CUP_MARK');
    expect(toRoundShots({ anchors: late, hole: HOLE, greenCentreENU: GREEN })).toMatchObject({ needsManualCompletion: true, stats: null });
    const closed = markTerminal([mark(0, 0, 'tee'), mark(1, 250, 'fairway'), mark(2, 382, 'green')], 'm2', 'CUP_MARK');
    const dangling = createPenaltyEvent({ ...identity, id: 'p9' }, 'lost_ball', 1, 'm2', Date.parse(closed[2]!.tapTimestamp) + 1000);
    const c = toRoundShots({ anchors: closed, penalties: [dangling], hole: HOLE, greenCentreENU: GREEN });
    expect(c).toMatchObject({ needsManualCompletion: true, stats: null, penaltyStrokes: 1 });
    expect(c.shots.at(-1)).toMatchObject({ isPenalty: true, penaltyType: 'lost' });
    // An open hole is shots so far, no stats, and a deleted mark is gone.
    const open = toRoundShots({ anchors: [mark(0, 0, 'tee'), mark(1, 250, 'fairway', { deletedAt: new Date(1_070_000).toISOString() }), mark(2, 260, 'fairway')], hole: HOLE, greenCentreENU: GREEN });
    expect(open).toMatchObject({ complete: false, stats: null, needsManualCompletion: false });
    expect(open.shots).toHaveLength(1);
    expect(open.shots[0]!.provenance.toAnchorId).toBe('m2');
    // A par 3 tee shot is the approach; weak positions remain evidence, not a reason to drop the record.
    const par3 = markTerminal([mark(0, 0, 'tee', { sigmaM: 12, confidence: 'LOW' }), mark(1, 150, 'green', { sigmaM: 9 }), mark(2, 152, 'green')], 'm2', 'CUP_MARK');
    const p = toRoundShots({ anchors: par3, hole: { number: 3, par: 3, yardage: 170 }, greenCentreENU: [152, 0] });
    expect(p.shots[0]).toMatchObject({ shotType: 'approach', provenance: { sigmaStartM: 12, confidenceStart: 'LOW' } });
    expect(p.integrity.flags).toEqual(['LOW_LOCATION_QUALITY']);
    expect(p.stats).toMatchObject({ score: 2, greenInRegulation: true });
  });
});
