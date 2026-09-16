import { describe, expect, it } from 'vitest';
import { INTEGRITY_RULES, assessHoleIntegrity, isWeakMark, teeProbability } from '../hole-integrity';
import { markTerminal } from '../hole-lifecycle';
import type { LieClass } from '../lie-classifier';
import type { ShotAnchor } from '../shot-anchor';

// SYNTHETIC TEST VECTORS: a hole's marks in tap order. `p` is the primary
// class share; the remainder goes to the second class so the posterior sums.
function mark(sequence: number, lie: LieClass, over: Partial<ShotAnchor> & { p?: number; second?: LieClass } = {}): ShotAnchor {
  const { p = .95, second = 'primary_rough', ...rest } = over;
  return { schemaVersion: 2, id: `m${sequence}`, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h1', holeId: 1, sequence,
    tapTimestamp: new Date(1_000_000 + sequence * 60_000).toISOString(), finalizedTimestamp: new Date(1_000_750 + sequence * 60_000).toISOString(), provisional: false,
    positionWgs84: [0, 0, null], positionENU: [sequence * 100, 0, 0], covarianceENU2D: [[9, 0], [0, 9]], sigmaM: 3, reportedAccuracyMedianM: 3, calibratedUncertaintyM: 3, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: lie, p }, { featureId: null, lieClass: second, p: 1 - p }], primaryLie: lie, confidence: 'HIGH',
    terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null, geometryVersion: 'g', terrainVersion: null,
    terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...rest };
}
const cleanHole = () => markTerminal([mark(0, 'tee'), mark(1, 'fairway'), mark(2, 'green')], 'm2', 'CUP_MARK');

describe('hole integrity (§80)', () => {
  it('reads an explicit CUP_MARK hole with a tee start as CLEAN, with shots between marks', () => {
    expect(assessHoleIntegrity(cleanHole())).toMatchObject({ status: 'COMPLETE', terminalMethod: 'CUP_MARK', shots: 2, flags: [], integrity: 'CLEAN', markCount: 3, weakMarks: 0 });
    // A tee-edge split still counts as the start (§47): tee .45 / rough .55.
    expect(assessHoleIntegrity(markTerminal([mark(0, 'primary_rough', { p: .55, second: 'tee' }), mark(1, 'green')], 'm1', 'CUP_MARK')).flags).toEqual([]);
    expect(teeProbability(mark(0, 'primary_rough', { p: .55, second: 'tee' }))).toBeCloseTo(.45, 6);
  });

  it('flags MISSING_CUP for a next-tee inferred close and for an open hole the round left behind, never inventing a cup', () => {
    const inferred = markTerminal([mark(0, 'tee'), mark(1, 'green')], 'm1', 'NEXT_TEE_INFERRED');
    const report = assessHoleIntegrity(inferred);
    expect(report).toMatchObject({ status: 'COMPLETE', terminalMethod: 'NEXT_TEE_INFERRED', integrity: 'MISSING_CUP', flags: ['MISSING_CUP'], shots: 1 });
    expect(inferred).toHaveLength(2);
    expect(inferred.map(a => a.positionENU)).toEqual([[0, 0, 0], [100, 0, 0]]);
    const open = [mark(0, 'tee'), mark(1, 'fairway')];
    expect(assessHoleIntegrity(open).flags).toEqual([]);
    expect(assessHoleIntegrity(open, { expectClosed: true }).flags).toEqual(['MISSING_CUP']);
    expect(assessHoleIntegrity([], { expectClosed: true }).flags).toEqual([]);
  });

  it('flags MISSING_START when the first mark is not plausibly on the tee', () => {
    const late = markTerminal([mark(0, 'fairway'), mark(1, 'green')], 'm1', 'CUP_MARK');
    expect(assessHoleIntegrity(late).flags).toEqual(['MISSING_START']);
    // A deleted tee mark no longer counts as the start.
    const undone = markTerminal([mark(0, 'tee', { deletedAt: new Date(1_000_900).toISOString() }), mark(1, 'fairway'), mark(2, 'green')], 'm2', 'CUP_MARK');
    expect(assessHoleIntegrity(undone).flags).toEqual(['MISSING_START']);
  });

  it('flags LOW_LOCATION_QUALITY from location evidence (σ, poor accuracy), not from a lie-boundary confidence grade', () => {
    const boundary = markTerminal([mark(0, 'tee', { confidence: 'LOW', p: .5, second: 'primary_rough' }), mark(1, 'fairway'), mark(2, 'green', { confidence: 'LOW', p: .6, second: 'fringe' })], 'm2', 'CUP_MARK');
    expect(assessHoleIntegrity(boundary).flags).toEqual([]);
    const weak = markTerminal([mark(0, 'tee', { sigmaM: 9 }), mark(1, 'fairway', { sigmaM: 12, confidence: 'LOW' }), mark(2, 'green')], 'm2', 'CUP_MARK');
    expect(assessHoleIntegrity(weak)).toMatchObject({ flags: ['LOW_LOCATION_QUALITY'], weakMarks: 2, markCount: 3 });
    const one = markTerminal([mark(0, 'tee'), mark(1, 'fairway', { sigmaM: 9 }), mark(2, 'green')], 'm2', 'CUP_MARK');
    expect(assessHoleIntegrity(one).flags).toEqual([]);
    const hopeless = markTerminal([mark(0, 'tee'), mark(1, 'fairway', { sigmaM: INTEGRITY_RULES.poorSigmaM + 1 }), mark(2, 'green')], 'm2', 'CUP_MARK');
    expect(assessHoleIntegrity(hopeless).flags).toEqual(['LOW_LOCATION_QUALITY']);
    expect(isWeakMark({ sigmaM: 3, estimatorSummary: { sampleCount: 4, rejectedResiduals: 0, scatterMajorM: 2, scatterMinorM: 1, kAcc: 1, kAccCalibration: 'provisional', poorAccuracy: true, reportedSpeedMps: null, displacementM: null, basis: 'weighted_mean_of_window' } })).toBe(true);
  });

  it('flags UNKNOWN_SURFACE, PENALTY_UNRESOLVED and SEQUENCE_ANOMALY, in review order', () => {
    expect(assessHoleIntegrity(markTerminal([mark(0, 'tee'), mark(1, 'UNKNOWN', { second: 'UNKNOWN' }), mark(2, 'green')], 'm2', 'CUP_MARK')).flags).toEqual(['UNKNOWN_SURFACE']);
    expect(assessHoleIntegrity(cleanHole(), { unresolvedPenalties: 1 }).flags).toEqual(['PENALTY_UNRESOLVED']);
    // A mark after the cup mark.
    expect(assessHoleIntegrity([...cleanHole(), mark(3, 'fairway')]).flags).toEqual(['SEQUENCE_ANOMALY']);
    // Tap order disagreeing with the sequence.
    expect(assessHoleIntegrity(markTerminal([mark(0, 'tee'), mark(1, 'fairway', { tapTimestamp: new Date(900_000).toISOString() }), mark(2, 'green')], 'm2', 'CUP_MARK')).flags).toEqual(['SEQUENCE_ANOMALY']);
    // A cup mark off the green complex.
    expect(assessHoleIntegrity(markTerminal([mark(0, 'tee'), mark(1, 'fairway')], 'm1', 'CUP_MARK')).flags).toEqual(['SEQUENCE_ANOMALY']);
    const messy = assessHoleIntegrity(markTerminal([mark(0, 'fairway', { sigmaM: 20 }), mark(1, 'green')], 'm1', 'NEXT_TEE_INFERRED'), { unresolvedPenalties: 1 });
    expect(messy.flags).toEqual(['MISSING_CUP', 'MISSING_START', 'PENALTY_UNRESOLVED', 'LOW_LOCATION_QUALITY']);
    expect(messy.integrity).toBe('MISSING_CUP');
  });
});
