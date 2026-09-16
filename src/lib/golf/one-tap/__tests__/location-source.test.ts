import { describe, expect, it, vi } from 'vitest';
import { deviceLocationSource, routeLength, sampleFromPosition, syntheticWalker } from '../location-source';
import { localOriginFor, wgs84ToEnu } from '../geodesy';
import type { LocationSample } from '../location-estimator';

const origin = localOriginFor({ originWgs84: [-79.744, 42.06], projection: 'wgs84-local-enu-v1' });
const route = [[0, 0], [100, 0], [100, 50]] as const;
function timers() {
  const handles: { fn: () => void; ms: number }[] = [];
  return { handles, setInterval: (fn: () => void, ms: number) => { handles.push({ fn, ms }); return handles.length; }, clearInterval: vi.fn() };
}
function enu(sample: LocationSample): [number, number] { const p = wgs84ToEnu([sample.longitude, sample.latitude, null], origin); return [p[0], p[1]]; }

describe('synthetic walker', () => {
  it('walks the route, clamps to its length and scatters fixes around the truth by the stated accuracy', () => {
    const t = timers();
    const walker = syntheticWalker({ origin, routeM: route, accuracyM: 3, seed: 3, now: () => 5000, ...t });
    expect(walker.routeLengthM).toBe(150);
    expect(routeLength(route)).toBe(150);
    const first = walker.emitNow()!;
    expect(first.source).toBe('synthetic');
    expect(first.timestampMs).toBe(5000);
    expect(Math.hypot(...enu(first))).toBeLessThan(8);
    expect(first.horizontalAccuracyM).toBeGreaterThan(2);
    expect(first.horizontalAccuracyM).toBeLessThan(4);
    walker.walkTo(1e9);
    expect(walker.distanceM()).toBe(150);
    expect(walker.positionM()).toEqual([100, 50]);
    walker.walk(-50);
    expect(walker.positionM()).toEqual([100, 0]);
    const [e, n] = enu(walker.emitNow()!);
    expect(Math.hypot(e - 100, n)).toBeLessThan(8);
  });
  it('emits on the interval to every listener, stops on signal loss and releases the interval with the last listener', () => {
    const t = timers();
    const walker = syntheticWalker({ origin, routeM: route, intervalMs: 250, seed: 1, ...t });
    const seen: LocationSample[] = [];
    const off = walker.subscribe(s => seen.push(s));
    expect(t.handles).toHaveLength(1);
    expect(t.handles[0]!.ms).toBe(250);
    t.handles[0]!.fn();
    expect(seen).toHaveLength(1);
    walker.stop();
    t.handles[0]!.fn();
    expect(walker.emitNow()).toBeNull();
    expect(seen).toHaveLength(1);
    walker.resume();
    t.handles[0]!.fn();
    expect(seen).toHaveLength(2);
    off();
    expect(t.clearInterval).toHaveBeenCalledTimes(1);
  });
  it('replays identically for the same seed', () => {
    const make = () => syntheticWalker({ origin, routeM: route, seed: 42, now: () => 1, ...timers() });
    const a = make(), b = make();
    expect(a.emitNow()).toEqual(b.emitNow());
    expect(a.emitNow()).toEqual(b.emitNow());
  });
});

describe('device location source', () => {
  it('is absent without platform geolocation', () => { expect(deviceLocationSource(null)).toBeNull(); });
  it('watches at high accuracy, maps positions to samples and clears the watch on unsubscribe', () => {
    let success: ((p: GeolocationPosition) => void) | null = null;
    const geo = { watchPosition: vi.fn((ok: (p: GeolocationPosition) => void, _error?: (e: GeolocationPositionError) => void, _options?: PositionOptions) => { success = ok; return 9; }), clearWatch: vi.fn() };
    const source = deviceLocationSource(geo)!;
    expect(source.kind).toBe('device');
    const seen: LocationSample[] = [];
    const off = source.subscribe(s => seen.push(s));
    expect(geo.watchPosition.mock.calls[0]![2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    const position = { timestamp: 123, coords: { longitude: -79.7, latitude: 42.1, accuracy: 4, altitude: 300, altitudeAccuracy: 6, speed: null, heading: 90 } } as unknown as GeolocationPosition;
    success!(position);
    expect(seen[0]).toMatchObject({ timestampMs: 123, longitude: -79.7, latitude: 42.1, horizontalAccuracyM: 4, altitudeM: 300, verticalAccuracyM: 6, speedMps: null, headingDegrees: 90, source: 'device' });
    off();
    expect(geo.clearWatch).toHaveBeenCalledWith(9);
    expect(sampleFromPosition({ timestamp: NaN, coords: { longitude: 1, latitude: 2, accuracy: 5, altitude: null, altitudeAccuracy: null, speed: null, heading: null } } as unknown as GeolocationPosition, 77).timestampMs).toBe(77);
  });
});
