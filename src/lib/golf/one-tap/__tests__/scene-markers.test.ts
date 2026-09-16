import { describe, expect, it } from 'vitest';
import { markersFromAnchors } from '../scene-markers';
import type { ShotAnchor } from '../shot-anchor';

function anchor(id: string, sequence: number, e: number, n: number, over: Partial<ShotAnchor> = {}): ShotAnchor {
  return { schemaVersion: 2, id, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h', holeId: 7, sequence, tapTimestamp: '2026-09-16T12:00:00.000Z', finalizedTimestamp: '2026-09-16T12:00:01.000Z', provisional: false,
    positionWgs84: [0, 0, null], positionENU: [e, n, 0], covarianceENU2D: [[4, 0], [0, 4]], sigmaM: 2, reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: 'fairway', p: 1 }], primaryLie: 'fairway', confidence: 'HIGH', terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null,
    geometryVersion: 'g', terrainVersion: null, terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...over };
}

describe('markers from anchors', () => {
  it('numbers earlier marks, labels the newest YOU and links consecutive finalized marks', () => {
    const out = markersFromAnchors([anchor('a', 0, 0, 0), anchor('b', 1, 100, 0), anchor('c', 2, 200, 5)], 'c');
    expect(out.markers.map(m => [m.kind, m.label, m.sigmaM])).toEqual([['anchor', '1', 2], ['anchor', '2', 2], ['you', 'YOU', 2]]);
    expect(out.links.map(l => l.key)).toEqual(['a>b', 'b>c']);
    expect(out.links[1]).toMatchObject({ fromM: [100, 0], toM: [200, 5] });
    expect(out.rippleKey).toBe('c');
  });
  it('draws a provisional mark hollow without a derived shot, and not at all before it has a fix', () => {
    const withFix = anchor('p', 1, 50, 0, { provisional: true, sigmaM: 3, covarianceENU2D: [[9, 0], [0, 9]] });
    const out = markersFromAnchors([anchor('a', 0, 0, 0), withFix]);
    expect(out.markers.map(m => m.kind)).toEqual(['you', 'provisional']);
    expect(out.links).toEqual([]);
    const blind = markersFromAnchors([anchor('a', 0, 0, 0), anchor('q', 1, 50, 0, { provisional: true, sigmaM: 0, covarianceENU2D: [[0, 0], [0, 0]], reportedAccuracyMedianM: 0, calibratedUncertaintyM: 0 })]);
    expect(blind.markers.map(m => m.key)).toEqual(['a']);
  });
  it('marks the cup mark as terminal and drops tombstoned anchors', () => {
    const out = markersFromAnchors([anchor('a', 0, 0, 0), anchor('gone', 1, 10, 0, { deletedAt: '2026-09-16T12:00:05.000Z' }), anchor('cup', 2, 300, 0, { terminal: true, terminalMethod: 'CUP_MARK' })]);
    expect(out.markers.map(m => [m.key, m.kind, m.label])).toEqual([['a', 'anchor', '1'], ['cup', 'terminal', 'HOLED']]);
    expect(out.links.map(l => l.key)).toEqual(['a>cup']);
  });
});
