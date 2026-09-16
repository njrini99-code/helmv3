import { describe, expect, it, vi } from 'vitest';
import { bindVisibilityLifecycle, deviceLocationSource, queryLocationPermission, routeLength, sampleFromPosition, syntheticWalker } from '../location-source';
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

describe('device location source — shell lifecycle (§67, §8.2)', () => {
  type Success = (p: GeolocationPosition) => void; type Failure = (e: GeolocationPositionError) => void;
  function geo() {
    const watches: { ok: Success; err?: Failure; options?: PositionOptions }[] = [];
    const g = {
      watchPosition: vi.fn((ok: Success, err?: Failure, options?: PositionOptions) => { watches.push({ ok, err, options }); return watches.length; }),
      clearWatch: vi.fn(), getCurrentPosition: vi.fn(),
    };
    return { g, watches, latest: () => watches.at(-1)! };
  }
  const fix = (accuracy = 4) => ({ timestamp: 1, coords: { longitude: -79.7, latitude: 42.1, accuracy, altitude: null, altitudeAccuracy: null, speed: null, heading: null } }) as unknown as GeolocationPosition;
  it('capture mode re-watches without cached fixes and asks for one fresh fix at once; navigation restores the longer timeout', () => {
    const { g, watches, latest } = geo();
    const source = deviceLocationSource(g)!;
    const statuses: string[] = [];
    source.subscribeStatus(s => statuses.push(s));
    const off = source.subscribe(() => {});
    expect(source.mode()).toBe('navigation');
    expect(latest().options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    source.setMode('capture');
    expect(g.clearWatch).toHaveBeenCalledWith(1);
    expect(watches).toHaveLength(2);
    expect(latest().options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0, timeout: 8_000 });
    expect(g.getCurrentPosition).toHaveBeenCalledTimes(1);
    source.setMode('capture');
    expect(watches).toHaveLength(2);
    source.setMode('navigation');
    expect(latest().options!.timeout).toBe(15_000);
    expect(g.getCurrentPosition).toHaveBeenCalledTimes(1);
    off();
    expect(source.status()).toBe('idle');
    expect(statuses).toEqual(['watching', 'idle']);
  });
  it('pauses when the app hides (watch dropped, no fixes), reacquires on resume and is watching again after the first new fix', () => {
    const { g, watches, latest } = geo();
    const source = deviceLocationSource(g)!;
    const seen: LocationSample[] = [], statuses: string[] = [];
    source.subscribeStatus(s => statuses.push(s));
    source.subscribe(s => seen.push(s));
    latest().ok(fix());
    expect(seen).toHaveLength(1);
    const doc = { visibilityState: 'visible', listeners: new Set<() => void>(), addEventListener(_: string, l: () => void) { this.listeners.add(l); }, removeEventListener(_: string, l: () => void) { this.listeners.delete(l); } };
    const unbind = bindVisibilityLifecycle(source, doc);
    doc.visibilityState = 'hidden'; for (const l of doc.listeners) l();
    expect(source.status()).toBe('paused');
    expect(g.clearWatch).toHaveBeenCalledWith(1);
    watches[0]!.ok(fix()); // a late fix from the cleared watch never becomes a sample
    expect(seen).toHaveLength(1);
    doc.visibilityState = 'visible'; for (const l of doc.listeners) l();
    expect(source.status()).toBe('reacquiring');
    expect(watches).toHaveLength(2);
    latest().ok(fix());
    expect(seen).toHaveLength(2);
    expect(source.status()).toBe('watching');
    expect(statuses).toEqual(['watching', 'paused', 'reacquiring', 'watching']);
    unbind();
    expect(doc.listeners.size).toBe(0);
    expect(bindVisibilityLifecycle(source, null)).toBeTypeOf('function');
  });
  it('reports denied and stops the watch; timeout and unavailable keep watching and report the state', () => {
    const { g, latest } = geo();
    const errors: number[] = [];
    const source = deviceLocationSource(g, e => errors.push(e.code))!;
    source.subscribe(() => {});
    latest().err!({ code: 3, message: 'timeout' } as GeolocationPositionError);
    expect(source.status()).toBe('timeout');
    latest().err!({ code: 2, message: 'unavailable' } as GeolocationPositionError);
    expect(source.status()).toBe('unavailable');
    expect(g.clearWatch).not.toHaveBeenCalled();
    latest().ok(fix());
    expect(source.status()).toBe('watching');
    latest().err!({ code: 1, message: 'denied' } as GeolocationPositionError);
    expect(source.status()).toBe('denied');
    expect(g.clearWatch).toHaveBeenCalledWith(1);
    expect(errors).toEqual([3, 2, 1]);
  });
  it('maps the Permissions API to granted / prompt / denied and falls back to unknown', async () => {
    expect(await queryLocationPermission({ query: async () => ({ state: 'granted' }) })).toBe('granted');
    expect(await queryLocationPermission({ query: async () => ({ state: 'prompt' }) })).toBe('prompt');
    expect(await queryLocationPermission({ query: async () => ({ state: 'denied' }) })).toBe('denied');
    expect(await queryLocationPermission({ query: async () => ({ state: 'weird' }) })).toBe('unknown');
    expect(await queryLocationPermission({ query: async () => { throw new TypeError('unsupported'); } })).toBe('unknown');
    expect(await queryLocationPermission(null)).toBe('unknown');
  });
});
