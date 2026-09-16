import { describe, expect, it } from 'vitest';
import { UNDO_WINDOW_MS, deriveShots, distanceSigma, finalAnchor, hasFix, liveAnchors, migrateAnchorRow, newAnchorId, provisionalAnchor, shotAnchorSchema, tombstoneAnchor, undoable, type ShotAnchor } from '../shot-anchor';

// SYNTHETIC TEST VECTOR: three anchors in a made-up ENU frame.
function anchor(id: string, sequence: number, e: number, n: number, z: number | null, lie: ShotAnchor['primaryLie'] = 'fairway', sigma = 2): ShotAnchor {
  return { schemaVersion: 2, id, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h', holeId: 1, sequence, tapTimestamp: '2026-09-17T12:00:00.000Z', finalizedTimestamp: '2026-09-17T12:00:01.000Z', provisional: false,
    positionWgs84: [-79.744, 42.06, null], positionENU: [e, n, z ?? 0], covarianceENU2D: [[sigma * sigma, 0], [0, sigma * sigma]], sigmaM: sigma, reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: lie, p: 1 }], primaryLie: lie, confidence: 'HIGH', terrainElevationMeters: z, terrainSlopeDegrees: null, terrainAspectDegrees: null,
    geometryVersion: 'g1', terrainVersion: 't1', terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null };
}
describe('one-tap shot anchors', () => {
  it('derives shots between consecutive live anchors with the plan’s ENU math', () => {
    const shots = deriveShots([anchor('a', 0, 0, 0, 100, 'tee'), anchor('b', 1, 30, 40, 105), anchor('c', 2, 30, 40, null, 'green')]);
    expect(shots).toHaveLength(2);
    const s = shots[0]!;
    expect(s.horizontalM).toBeCloseTo(50, 9);
    expect(s.threeDM).toBeCloseTo(Math.sqrt(2525), 9);
    expect(s.bearingDegrees).toBeCloseTo(Math.atan2(30, 40) * 180 / Math.PI, 9);
    expect(s.gradePercent).toBeCloseTo(10, 9);
    expect(s.verticalAngleDegrees).toBeCloseTo(Math.atan2(5, 50) * 180 / Math.PI, 9);
    expect(s.sigmaDistanceM).toBeCloseTo(2 * Math.SQRT2, 9);
    expect(s).toMatchObject({ startLie: 'tee', endLie: 'fairway', basis: 'enu_between_anchors' });
    expect(shots[1]).toMatchObject({ horizontalM: 0, threeDM: null, gradePercent: null, elevationDeltaM: null });
  });
  it('projects the summed covariance on the displacement axis', () => {
    expect(distanceSigma([[4, 0], [0, 1]], [[4, 0], [0, 1]], [10, 0])).toBeCloseTo(Math.sqrt(8), 9);
    expect(distanceSigma([[4, 0], [0, 1]], [[4, 0], [0, 1]], [0, 10])).toBeCloseTo(Math.sqrt(2), 9);
  });
  it('tombstones on undo and re-derives the neighbours without renumbering', () => {
    const anchors = [anchor('a', 0, 0, 0, 100, 'tee'), anchor('b', 1, 30, 40, 105), anchor('c', 2, 60, 80, 110, 'green')];
    const after = tombstoneAnchor(anchors, 'b', Date.parse('2026-09-17T12:00:03.000Z'));
    expect(after.find(a => a.id === 'b')?.deletedAt).toBe('2026-09-17T12:00:03.000Z');
    expect(after.map(a => a.sequence)).toEqual([0, 1, 2]);
    expect(liveAnchors(after).map(a => a.id)).toEqual(['a', 'c']);
    expect(deriveShots(after)).toHaveLength(1);
    expect(deriveShots(after)[0]!.horizontalM).toBeCloseTo(100, 9);
    expect(undoable(anchors[1]!, Date.parse('2026-09-17T12:00:01.000Z') + UNDO_WINDOW_MS)).toBe(true);
    expect(undoable(anchors[1]!, Date.parse('2026-09-17T12:00:01.000Z') + UNDO_WINDOW_MS + 1)).toBe(false);
    expect(undoable(after[1]!, 0)).toBe(false);
  });
  it('migrates a V1 lab row under the round binding, drops the raw window and rejects unknown versions', () => {
    const { schemaVersion: _v, courseId: _c, siteId: _s, reportedAccuracyMedianM: _r, calibratedUncertaintyM: _u, captureMotion: _m, estimatorSummary: _e, ...v1 } = anchor('00000001-a', 0, 3, 4, 100);
    const sample = { timestampMs: 900, longitude: -79.744, latitude: 42.06, altitudeM: null, horizontalAccuracyM: 3, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' };
    const row = { ...v1, rawLocationSamples: [sample, sample], estimator: { sigmaDeviceM: 3, sigmaScatterM: .7, medianAccuracyM: 3.5, usedSamples: 2, rejectedResiduals: 1, poorAccuracy: false, kAcc: 1, basis: 'weighted_mean_of_window' } };
    const migrated = migrateAnchorRow(row, { courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904' });
    expect(migrated?.migrated).toBe(true);
    expect(migrated!.anchor).toMatchObject({ schemaVersion: 2, id: '00000001-a', courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904', captureMotion: 'unknown',
      reportedAccuracyMedianM: 3.5, calibratedUncertaintyM: 3, positionENU: [3, 4, 100], primaryLie: 'fairway' });
    expect(migrated!.anchor.estimatorSummary).toMatchObject({ sampleCount: 2, rejectedResiduals: 1, scatterMajorM: .7, scatterMinorM: .7, kAcc: 1, kAccCalibration: 'provisional' });
    expect(migrated!.anchor).not.toHaveProperty('rawLocationSamples');
    expect(migrated!.anchor).not.toHaveProperty('estimator');
    // A V1 row that never finalized has no estimator block: the σ it stored stands in.
    expect(migrateAnchorRow({ ...v1, rawLocationSamples: [], estimator: null }, { courseId: 'c', siteId: 's' })?.anchor).toMatchObject({ reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, estimatorSummary: null });
    // Current rows pass through unchanged; a newer or unknown shape is invalid, not guessed.
    expect(migrateAnchorRow(anchor('00000001-a', 0, 3, 4, 100), { courseId: 'c', siteId: 's' })).toEqual({ anchor: anchor('00000001-a', 0, 3, 4, 100), migrated: false });
    expect(migrateAnchorRow({ ...anchor('00000001-a', 0, 3, 4, 100), schemaVersion: 3 }, { courseId: 'c', siteId: 's' })).toBeNull();
    expect(migrateAnchorRow({ id: 'broken' }, { courseId: 'c', siteId: 's' })).toBeNull();
    expect(migrateAnchorRow(null, { courseId: 'c', siteId: 's' })).toBeNull();
  });
  it('builds provisional and final anchors that satisfy the schema and keep versions', () => {
    const identity = { id: newAnchorId(1_000), roundId: 'r', courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904', holeKey: 'h', holeId: 15, sequence: 0, tapMs: 1_000 };
    const sample = { timestampMs: 900, longitude: -79.744, latitude: 42.06, altitudeM: null, horizontalAccuracyM: 3, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' as const };
    const provisional = provisionalAnchor(identity, sample, [1, 2, 0], 'g1', 't1');
    expect(shotAnchorSchema.parse(provisional)).toMatchObject({ schemaVersion: 2, provisional: true, sigmaM: 3, courseId: 'peek-n-peak-upper', siteId: 'osm-way-136097904', geometryVersion: 'g1', terrainVersion: 't1', primaryLie: 'UNKNOWN', captureMotion: 'unknown', reportedAccuracyMedianM: 3 });
    expect(hasFix(provisional)).toBe(true);
    expect(hasFix(provisionalAnchor(identity, null, null, 'g1', 't1'))).toBe(false);
    const final = finalAnchor(provisional, { positionENU: [1.5, 2.5], positionWgs84: [-79.744, 42.06, null], covarianceENU2D: [[4, 0], [0, 4]], covarianceScatterENU2D: [[.16, 0], [0, .16]], covarianceDeviceENU2D: [[4, 0], [0, 4]],
      sigmaM: 2, sigmaDeviceM: 2, sigmaScatterM: .4, reportedRadiusM: 2, medianAccuracyM: 2, kAcc: 1, kAccCalibration: 'provisional', captureMotion: 'stationary',
      motion: { captureMotion: 'stationary', reportedSpeedMps: null, displacementSpeedMps: 0, displacementM: 0 },
      windowSamples: [sample], usedSamples: 1, rejectedResiduals: 0, poorAccuracy: false, basis: 'weighted_mean_of_window' },
    { elevationM: 480, slopeDegrees: 3, aspectDegrees: 90, gradient: [0, 0], normal: [0, 0, 1], deltaM: 2, elevationQuality: 'LIDAR', verticalDatum: 'NAVD88', basis: 'central_differences_metric_grid' },
    { classes: [{ featureId: 'g', lieClass: 'green', p: .8 }, { featureId: null, lieClass: 'primary_rough', p: .2 }], primaryLie: 'green', primaryFeatureId: 'g', pMax: .8, method: 'monte_carlo', sampleCount: 128, edgeSigmaM: 2.5, queryRadiusM: 9, basis: 'canonical_partition' },
    'MEDIUM', 1_750);
    expect(shotAnchorSchema.parse(final)).toMatchObject({ provisional: false, primaryLie: 'green', confidence: 'MEDIUM', terrainElevationMeters: 480, positionENU: [1.5, 2.5, 480] });
    expect(final.liePosterior).toHaveLength(2);
    // §71: the raw window is not on the durable record; the summary is.
    expect(final).not.toHaveProperty('rawLocationSamples');
    expect(final).toMatchObject({ reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary' });
    expect(final.estimatorSummary).toEqual({ sampleCount: 1, rejectedResiduals: 0, scatterMajorM: .4, scatterMinorM: .4, kAcc: 1, kAccCalibration: 'provisional', poorAccuracy: false,
      reportedSpeedMps: null, displacementM: 0, basis: 'weighted_mean_of_window' });
    expect(JSON.stringify(final)).not.toContain('"longitude"');
    expect(newAnchorId(2_000) > newAnchorId(1_000)).toBe(true);
  });
});
