import { describe, expect, it } from 'vitest';
import { SHOT_PATH_OPACITY } from '../../course-geometry/scene-markers';
import { PLAYER_MARKER_KEY, markersFromAnchors } from '../scene-markers';
import type { ShotAnchor } from '../shot-anchor';

function anchor(id: string, sequence: number, e: number, n: number, over: Partial<ShotAnchor> = {}): ShotAnchor {
  return { schemaVersion: 2, id, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h', holeId: 7, sequence, tapTimestamp: '2026-09-16T12:00:00.000Z', finalizedTimestamp: '2026-09-16T12:00:01.000Z', provisional: false,
    positionWgs84: [0, 0, null], positionENU: [e, n, 0], covarianceENU2D: [[4, 0], [0, 4]], sigmaM: 2, reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: 'fairway', p: 1 }], primaryLie: 'fairway', confidence: 'HIGH', terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null,
    geometryVersion: 'g', terrainVersion: null, terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...over };
}

describe('markers from anchors', () => {
  it('numbers earlier marks, labels the newest BALL and links consecutive finalized marks', () => {
    const out = markersFromAnchors([anchor('a', 0, 0, 0), anchor('b', 1, 100, 0), anchor('c', 2, 200, 5)], 'c');
    expect(out.markers.map(m => [m.kind, m.label, m.sigmaM])).toEqual([['anchor', '1', 2], ['anchor', '2', 2], ['ball', 'BALL', 2]]);
    expect(out.links.map(l => l.key)).toEqual(['a>b', 'b>c']);
    expect(out.links[1]).toMatchObject({ fromM: [100, 0], toM: [200, 5] });
    expect(out.rippleKey).toBe('c');
  });
  it('draws a provisional mark hollow without a derived shot, and not at all before it has a fix', () => {
    const withFix = anchor('p', 1, 50, 0, { provisional: true, sigmaM: 3, covarianceENU2D: [[9, 0], [0, 9]] });
    const out = markersFromAnchors([anchor('a', 0, 0, 0), withFix]);
    expect(out.markers.map(m => m.kind)).toEqual(['ball', 'provisional']);
    expect(out.links).toEqual([]);
    const blind = markersFromAnchors([anchor('a', 0, 0, 0), anchor('q', 1, 50, 0, { provisional: true, sigmaM: 0, covarianceENU2D: [[0, 0], [0, 0]], reportedAccuracyMedianM: 0, calibratedUncertaintyM: 0 })]);
    expect(blind.markers.map(m => m.key)).toEqual(['a']);
  });
  it('draws YOU from the live position with its halo while the BALL stays where it was marked (§5)', () => {
    const anchors = [anchor('a', 0, 0, 0), anchor('b', 1, 100, 0)];
    const before = markersFromAnchors(anchors, null, { positionENU: [101, 1], accuracyM: 4 });
    const after = markersFromAnchors(anchors, null, { positionENU: [160, 12], accuracyM: 6, stale: true });
    expect(before.markers.find(m => m.kind === 'ball')).toMatchObject({ key: 'b', pointM: [100, 0], label: 'BALL' });
    expect(after.markers.find(m => m.kind === 'ball')).toMatchObject({ key: 'b', pointM: [100, 0], label: 'BALL' });
    expect(before.markers.at(-1)).toEqual({ key: PLAYER_MARKER_KEY, pointM: [101, 1], kind: 'player', sigmaM: 4, label: 'YOU', dimmed: false });
    expect(after.markers.at(-1)).toEqual({ key: PLAYER_MARKER_KEY, pointM: [160, 12], kind: 'player', sigmaM: 6, label: 'YOU', dimmed: true });
    // The walk from the ball to the phone is never a shot: links join finalized marks only.
    expect(after.links.map(l => l.key)).toEqual(['a>b']);
    expect(after.links.some(l => l.toM[0] === 160 || l.fromM[0] === 160)).toBe(false);
    expect(markersFromAnchors([], null, { positionENU: [5, 5], accuracyM: 3 })).toMatchObject({ markers: [{ kind: 'player' }], links: [] });
    expect(markersFromAnchors(anchors).markers.some(m => m.kind === 'player')).toBe(false);
  });
  it('gives each shot its drawn shape, its place in the hierarchy and one reveal (§62–63)', () => {
    const anchors = [anchor('a', 0, 0, 0, { primaryLie: 'tee' }), anchor('b', 1, 0, 180), anchor('c', 2, 0, 210, { primaryLie: 'green' }), anchor('d', 3, 0, 214, { primaryLie: 'green' })];
    const out = markersFromAnchors(anchors, 'd');
    expect(out.links.map(l => [l.basis, l.apexM])).toEqual([
      ['illustrative_endpoint_arc', 14.4], // H = clamp(0.08 × 180, 4, 24)
      ['illustrative_endpoint_arc', 4],    // a 30 m pitch sits on the clamp's floor
      ['surface_connector', 0],            // green → green: a putt never flies
    ]);
    // §63: the shot just played is fully lit, the one before it falls back, the rest go quiet.
    expect(out.links.map(l => l.opacity)).toEqual([SHOT_PATH_OPACITY.older, SHOT_PATH_OPACITY.previous, SHOT_PATH_OPACITY.current]);
    // Only the newest shot reveals, and only because its closing mark is the fresh one.
    expect(out.links.map(l => l.reveal)).toEqual([false, false, true]);
    // Restored from storage (nothing rippling) the hole is drawn, never replayed.
    expect(markersFromAnchors(anchors).links.some(l => l.reveal)).toBe(false);
    // A ripple on an older mark is not this shot's reveal either.
    expect(markersFromAnchors(anchors, 'b').links.some(l => l.reveal)).toBe(false);
    // One shot: it is the current one and it reveals.
    const first = markersFromAnchors([anchors[0]!, anchors[1]!], 'b');
    expect(first.links).toHaveLength(1);
    expect(first.links[0]).toMatchObject({ opacity: SHOT_PATH_OPACITY.current, reveal: true });
  });
  it('marks the cup mark as terminal and drops tombstoned anchors', () => {
    const out = markersFromAnchors([anchor('a', 0, 0, 0), anchor('gone', 1, 10, 0, { deletedAt: '2026-09-16T12:00:05.000Z' }), anchor('cup', 2, 300, 0, { terminal: true, terminalMethod: 'CUP_MARK' })]);
    expect(out.markers.map(m => [m.key, m.kind, m.label])).toEqual([['a', 'anchor', '1'], ['cup', 'terminal', 'HOLED']]);
    expect(out.links.map(l => l.key)).toEqual(['a>cup']);
  });
});
