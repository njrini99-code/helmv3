import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOneTap } from './use-one-tap';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { enuToWgs84, localOriginFor } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { buildSurfacePartition, distanceToBoundary, exactPointInPartition, type LieClass } from '@/lib/golf/one-tap/lie-classifier';
import type { LocationSample } from '@/lib/golf/one-tap/location-estimator';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import { QUALITY_CONFIG } from '@/lib/golf/one-tap/location-quality';
import { PLAYER_MARKER_KEY } from '@/lib/golf/one-tap/scene-markers';
import type { PointM } from '@/lib/golf/course-geometry/types';

const origin = localOriginFor(pilotPackage);
const holeKey = pilotPackage.holes[0]!.key;
function pointOn(lie: LieClass): PointM {
  const partition = buildSurfacePartition(pilotPackage, holeKey);
  const surface = partition.surfaces.find(s => s.lieClass === lie)!, ring = largestOuterRing(surface.feature)!;
  const inside = (p: PointM) => exactPointInPartition(partition, p).lieClass === lie && distanceToBoundary(p, surface.feature) > 2;
  const centre = ringCentroid(ring);
  if (inside(centre)) return centre;
  const [minX, minY, maxX, maxY] = surface.bounds;
  for (let y = minY; y <= maxY; y += 2) for (let x = minX; x <= maxX; x += 2) if (inside([x, y])) return [x, y];
  throw new Error(`no interior point on ${lie}`);
}
function manualSource() {
  const listeners = new Set<(s: LocationSample) => void>();
  const source: LocationSource & { at(point: PointM, tMs: number, accuracyM?: number): void } = {
    kind: 'synthetic',
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    at([e, n], tMs, accuracyM = 3) {
      const [longitude, latitude] = enuToWgs84([e, n, 0], origin);
      const sample: LocationSample = { timestampMs: tMs, longitude, latitude, altitudeM: null, horizontalAccuracyM: accuracyM, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' };
      for (const l of listeners) l(sample);
    },
  };
  return source;
}

describe('useOneTap: YOU is not BALL (§5, §37)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(500_000); });
  afterEach(() => { vi.useRealTimers(); });
  it('marks the ball where the phone was and leaves it there while YOU walks on, eased and never linked', async () => {
    const source = manualSource(), tee = pointOn('tee');
    const { result } = renderHook(() => useOneTap({ roundId: 'r', pkg: pilotPackage, holeKey, terrain: null, location: source, storage: null, now: () => Date.now() }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    for (let t = -1500; t <= 0; t += 500) act(() => { source.at(tee, Date.now() + t); });
    expect(result.current.player?.positionENU[0]).toBeCloseTo(tee[0], 6);
    const you = () => result.current.markers.markers.find(m => m.key === PLAYER_MARKER_KEY)!;
    expect(you()).toMatchObject({ kind: 'player', label: 'YOU', sigmaM: 3, dimmed: false });
    act(() => { result.current.markBall(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    const ball = () => result.current.markers.markers.find(m => m.kind === 'ball')!;
    expect(ball()).toMatchObject({ label: 'BALL' });
    const ballAt = ball().pointM;
    expect(Math.hypot(ballAt[0] - tee[0], ballAt[1] - tee[1])).toBeLessThan(.5);
    // The golfer walks 20 m east: YOU eases there over the time constant, BALL does not move.
    const away: PointM = [tee[0] + 20, tee[1]];
    act(() => { source.at(away, Date.now(), 5); });
    expect(result.current.player!.targetENU[0]).toBeCloseTo(away[0], 6);
    const start = you().pointM[0];
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const mid = you().pointM[0];
    expect(mid).toBeGreaterThan(start + 3);
    expect(mid).toBeLessThan(away[0] - 3);
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(you().pointM[0]).toBeCloseTo(away[0], 3);
    expect(ball().pointM).toEqual(ballAt);
    expect(result.current.markers.links).toEqual([]);
    expect(result.current.snapshot.shots).toEqual([]);
    // No fix for longer than the stale window: YOU dims where it last was.
    expect(you().dimmed).toBe(true);
    act(() => { source.at(away, Date.now(), 5); });
    expect(you().dimmed).toBe(false);
    void QUALITY_CONFIG;
  });
  it('a fix from outside the course frame (the drive in, a coarse first cell fix) renders honestly instead of crashing the round', async () => {
    // Peek'n Peak, 2026-09-17 14:07 EDT: the first fix after "Allow" landed
    // beyond the 5 km local frame and the conversion threw inside a render,
    // which took the whole round page down to "Failed to load round entry".
    const source = manualSource(), tee = pointOn('tee');
    const { result } = renderHook(() => useOneTap({ roundId: 'r', pkg: pilotPackage, holeKey, terrain: null, location: source, storage: null, now: () => Date.now() }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const far: PointM = [tee[0] + 15_000, tee[1]];
    expect(() => act(() => { source.at(far, Date.now(), 1500); })).not.toThrow();
    expect(result.current.player).toBeNull();
    expect(result.current.markers.markers.find(m => m.key === PLAYER_MARKER_KEY)).toBeUndefined();
    expect(result.current.locationQuality).toBe('off_course');
    expect(result.current.distancesBasis).toBeNull();
    // A tap out there marks nothing and reports no usable fix rather than a mark at the origin.
    act(() => { result.current.markBall(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.snapshot.anchors).toEqual([]);
    expect(result.current.snapshot.state).toBe('GPS_UNAVAILABLE');
    // Arriving at the tee: the same round, no reload, YOU appears.
    for (let t = -1500; t <= 0; t += 500) act(() => { source.at(tee, Date.now() + t); });
    expect(result.current.locationQuality).toBe('good');
    expect(result.current.player?.positionENU[0]).toBeCloseTo(tee[0], 6);
  });
});
