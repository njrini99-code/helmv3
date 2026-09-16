import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { MemoryAnchorRepository, SyncQueue } from '../anchor-repository';
import { enuToWgs84, localOriginFor } from '../geodesy';
import { buildSurfacePartition } from '../lie-classifier';
import { LocationBuffer, type LocationSample } from '../location-estimator';
import { OneTapController } from '../one-tap-controller';
import { holeStatus } from '../hole-lifecycle';

// SYNTHETIC TEST VECTOR: a square green at 0..20 m and a tee 190 m west.
const originWgs84 = [-79.744, 42.06] as const, origin = localOriginFor({ originWgs84, projection: 'wgs84-local-enu-v1' });
const ring = (points: [number, number][]) => [...points, points[0]!].map(([e, n]) => { const p = enuToWgs84([e, n, 0], origin); return [p[0], p[1]]; });
const pkg = parseGeometryPackage({
  schemaVersion: 1, siteId: 'synthetic', name: 'SYNTHETIC TEST VECTOR', contentHash: 'd'.repeat(64), status: 'source_candidate', originWgs84, projection: 'wgs84-local-enu-v1',
  sources: [{ id: 's', provider: 'synthetic', licenseId: 'none', url: 'https://example.invalid', capturedAt: null, retrievedAt: '2026-09-17', attribution: 'synthetic' }],
  features: [
    { id: 'green', kind: 'green', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'Polygon', coordinates: [ring([[0, 0], [20, 0], [20, 20], [0, 20]])] }, reviewed: true, accuracyMeters: .5 },
    { id: 'fairway', kind: 'fairway', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'Polygon', coordinates: [ring([[-170, -20], [-10, -20], [-10, 40], [-170, 40]])] }, reviewed: false, accuracyMeters: null },
    { id: 'tee', kind: 'tee', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'Polygon', coordinates: [ring([[-200, 0], [-180, 0], [-180, 12], [-200, 12]])] }, reviewed: true, accuracyMeters: 1 },
    { id: 'route', kind: 'route', sourceIds: ['s'], holeKeys: ['h'], geometryWgs84: { type: 'LineString', coordinates: ring([[-190, 6], [10, 10]]).slice(0, 2) }, reviewed: false, accuracyMeters: null },
  ],
  holes: [{ key: 'h', ordinal: 15, par: 3, scorecardYards: 200, featureIds: ['green', 'fairway', 'tee', 'route'], routeFeatureId: 'route', greenFeatureId: 'green', nominalTargetWgs84: null, completeness: 'partial', gaps: [] }],
});
function sample(e: number, n: number, tMs: number, acc = 3): LocationSample {
  const [lon, lat] = enuToWgs84([e, n, 0], origin);
  return { timestampMs: tMs, longitude: lon, latitude: lat, altitudeM: null, horizontalAccuracyM: acc, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' };
}
function build(transport: { upsertAnchors: (a: readonly unknown[]) => Promise<{ acceptedIds: string[] }> } | null = null) {
  const repo = new MemoryAnchorRepository(), buffer = new LocationBuffer();
  const sync = new SyncQueue(repo, transport as never, 'r');
  const haptics: string[] = [];
  const controller = new OneTapController({ roundId: 'r', origin, buffer, repo, sync, geometryVersion: pkg.contentHash, haptic: k => { haptics.push(k); },
    hole: { holeKey: 'h', holeId: 15, partition: buildSurfacePartition(pkg, 'h'), terrain: null, terrainVersion: null } });
  return { repo, buffer, controller, haptics, sync };
}
describe('one-tap controller', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
  afterEach(() => { vi.useRealTimers(); });
  it('writes a provisional anchor at the tap, finalizes after 750 ms and derives shots between marks', async () => {
    const { controller, haptics, repo } = build();
    const states: string[] = [];
    controller.subscribe(s => { if (states.at(-1) !== s.state) states.push(s.state); });
    for (let t = -1500; t <= 0; t += 500) controller.pushSample(sample(-190 + t / 5000, 6, 100_000 + t));
    const pending = controller.markBall();
    expect(controller.snapshot().state).toBe('CAPTURE_PENDING');
    expect(haptics).toEqual(['light']);
    const provisional = repo.list('r');
    expect(provisional).toHaveLength(1);
    expect(provisional[0]).toMatchObject({ provisional: true, sequence: 0, geometryVersion: pkg.contentHash });
    controller.pushSample(sample(-190.2, 6.1, 100_300));
    await vi.advanceTimersByTimeAsync(750);
    const first = await pending;
    expect(first).toMatchObject({ provisional: false, primaryLie: 'tee', confidence: 'HIGH', sequence: 0, syncState: 'QUEUED' });
    expect(first!.rawLocationSamples.length).toBeGreaterThanOrEqual(4);
    expect(controller.snapshot()).toMatchObject({ state: 'ANCHOR_SAVED', outcome: 'saved', undoableId: first!.id });
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.snapshot().state).toBe('HOLE_READY');
    // Second mark 150 m down the hole: shot 1 closes.
    vi.setSystemTime(160_000);
    for (let t = -1000; t <= 0; t += 250) controller.pushSample(sample(-40, 8, 160_000 + t, 4));
    const second = controller.markBall();
    await vi.advanceTimersByTimeAsync(750);
    await second;
    const snap = controller.snapshot();
    expect(snap.shots).toHaveLength(1);
    expect(snap.shots[0]!.horizontalM).toBeCloseTo(150.1, 0);
    expect(snap.shots[0]!.startLie).toBe('tee');
    expect(snap.shots[0]!.endLie).toBe('fairway');
    expect(snap.shots[0]!.sigmaDistanceM).toBeGreaterThan(0);
    expect(states).toEqual(['HOLE_READY', 'CAPTURE_PENDING', 'ANCHOR_SAVED', 'HOLE_READY', 'CAPTURE_PENDING', 'ANCHOR_SAVED']);
    expect(controller.cameraObservation()).toMatchObject({ terminal: false });
    expect(controller.cameraObservation()!.distanceToGreenM).toBeCloseTo(Math.hypot(50, 2), 0);
  });
  it('reports GPS_UNAVAILABLE with no fix, fabricates nothing and recovers on the next sample', async () => {
    const { controller, repo, haptics } = build();
    const result = controller.markBall();
    await vi.advanceTimersByTimeAsync(750);
    expect(await result).toBeNull();
    expect(repo.list('r')).toEqual([]);
    expect(controller.snapshot()).toMatchObject({ state: 'GPS_UNAVAILABLE', outcome: 'gps_unavailable' });
    expect(haptics).toEqual(['light', 'warning']);
    controller.pushSample(sample(-190, 6, 100_800));
    expect(controller.snapshot().state).toBe('HOLE_READY');
  });
  it('marks a poor fix honestly as LOW_CONFIDENCE and an unmapped fix as OUTSIDE_MODELED_AREA', async () => {
    const { controller } = build();
    controller.pushSample(sample(-90, 10, 99_800, 12));
    let mark = controller.markBall();
    await vi.advanceTimersByTimeAsync(750);
    const poor = await mark;
    expect(poor).toMatchObject({ confidence: 'LOW', primaryLie: 'fairway' });
    expect(poor!.sigmaM).toBeGreaterThanOrEqual(12);
    expect(poor!.liePosterior.length).toBeGreaterThan(1);
    expect(controller.snapshot()).toMatchObject({ state: 'LOW_CONFIDENCE', outcome: 'low_confidence' });
    await vi.advanceTimersByTimeAsync(700);
    vi.setSystemTime(120_000);
    controller.pushSample(sample(400, 400, 119_900, 3));
    mark = controller.markBall();
    await vi.advanceTimersByTimeAsync(750);
    expect((await mark)!.primaryLie).toBe('UNKNOWN');
    expect(controller.snapshot().state).toBe('OUTSIDE_MODELED_AREA');
  });
  it('undoes inside the five-second window by tombstone, and CUP_MARK completes the hole', async () => {
    const { controller, repo } = build();
    controller.pushSample(sample(-190, 6, 99_900));
    let mark = controller.markBall();
    await vi.advanceTimersByTimeAsync(750);
    await mark;
    vi.setSystemTime(130_000);
    controller.pushSample(sample(10, 10, 129_900));
    mark = controller.markBall();
    await vi.advanceTimersByTimeAsync(750);
    const onGreen = await mark;
    expect(onGreen!.primaryLie).toBe('green');
    expect(controller.holeOut()).toMatchObject({ terminal: true, terminalMethod: 'CUP_MARK' });
    expect(holeStatus(repo.list('r'))).toEqual({ status: 'COMPLETE', terminalMethod: 'CUP_MARK', strokes: 1 });
    expect(controller.cameraObservation()!.terminal).toBe(true);
    const undone = controller.undo();
    expect(undone?.deletedAt).not.toBeNull();
    expect(controller.snapshot().shots).toHaveLength(0);
    expect(repo.list('r')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(controller.undo()).toBeNull();
  });
  it('ignores taps while paused or mid-capture and syncs through the queue idempotently', async () => {
    const sent: string[] = [];
    const { controller, sync } = build({ upsertAnchors: async anchors => { sent.push(...(anchors as { id: string }[]).map(a => a.id)); return { acceptedIds: (anchors as { id: string }[]).map(a => a.id) }; } });
    controller.pause();
    expect(await controller.markBall()).toBeNull();
    controller.resume();
    controller.pushSample(sample(-190, 6, 99_900));
    const first = controller.markBall();
    expect(await controller.markBall()).toBeNull();
    await vi.advanceTimersByTimeAsync(750);
    const anchor = await first;
    await sync.flush();
    await sync.flush();
    expect(sent).toEqual([anchor!.id]);
    expect(controller.snapshot().syncPending).toBe(0);
  });
});
