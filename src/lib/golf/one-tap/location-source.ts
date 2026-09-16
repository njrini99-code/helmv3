import { enuToWgs84, type LocalOrigin } from './geodesy';
import type { LocationSample } from './location-estimator';
import type { PointM } from '../course-geometry/types';

/** A stream of device fixes for the estimator buffer. Production subscribes
 * to the platform watcher; the lab drives a synthetic walker along the hole
 * route so the same screen, controller and overlay run without a phone. */
export interface LocationSource {
  subscribe(listener: (sample: LocationSample) => void): () => void;
  /** Present on the platform source; null when the platform has no geolocation. */
  readonly kind: 'device' | 'synthetic';
}
interface GeolocationLike {
  watchPosition(success: (position: GeolocationPosition) => void, error?: (error: GeolocationPositionError) => void, options?: PositionOptions): number;
  clearWatch(id: number): void;
}
export function sampleFromPosition(position: GeolocationPosition, nowMs = Date.now()): LocationSample {
  const c = position.coords;
  return { timestampMs: Number.isFinite(position.timestamp) ? position.timestamp : nowMs, longitude: c.longitude, latitude: c.latitude,
    altitudeM: c.altitude ?? null, horizontalAccuracyM: c.accuracy, verticalAccuracyM: c.altitudeAccuracy ?? null,
    speedMps: c.speed ?? null, headingDegrees: c.heading ?? null, source: 'device' };
}
/** The platform watcher, highest accuracy, no cached fixes. An error (denied,
 * unavailable) simply stops samples: the controller then reports
 * GPS_UNAVAILABLE on the next tap instead of inventing a position. */
export function deviceLocationSource(geolocation: GeolocationLike | null | undefined = typeof navigator === 'undefined' ? null : navigator.geolocation,
  onError?: (error: GeolocationPositionError) => void): LocationSource | null {
  if (!geolocation) return null;
  return {
    kind: 'device',
    subscribe(listener) {
      const id = geolocation.watchPosition(position => listener(sampleFromPosition(position)), error => onError?.(error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      return () => geolocation.clearWatch(id);
    },
  };
}

/** Deterministic PRNG (mulberry32) so a lab capture replays identically. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export interface SyntheticWalkerOptions {
  origin: LocalOrigin;
  /** Local-metre polyline the walker follows (the hole route, tee → green). */
  routeM: readonly PointM[];
  /** Fix cadence; phones report about once per second. */
  intervalMs?: number;
  /** Reported horizontal accuracy and the actual scatter applied to fixes. */
  accuracyM?: number;
  seed?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}
export interface SyntheticWalker extends LocationSource {
  /** Move the true position to `metres` along the route (clamped to its length). */
  walkTo(metres: number): void;
  walk(deltaMetres: number): void;
  setAccuracy(metres: number): void;
  /** Stop emitting fixes (a signal loss); `resume` continues at the same place. */
  stop(): void;
  resume(): void;
  positionM(): PointM;
  distanceM(): number;
  emitNow(): LocationSample | null;
  readonly routeLengthM: number;
}
function along(route: readonly PointM[], metres: number): PointM {
  let remaining = Math.max(0, metres);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= length || i === route.length - 1) { const t = length > 0 ? Math.min(1, remaining / length) : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    remaining -= length;
  }
  return route[0] ?? [0, 0];
}
export function routeLength(route: readonly PointM[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  return total;
}
/** Walks the route and emits fixes scattered around the true position with
 * Gaussian noise of the stated accuracy, so the estimator sees realistic
 * scatter and the σ ring shows something honest. */
export function syntheticWalker(options: SyntheticWalkerOptions): SyntheticWalker {
  const { origin, routeM } = options;
  const interval = options.intervalMs ?? 1000, now = options.now ?? (() => Date.now());
  const setI = options.setInterval ?? ((fn, ms) => setInterval(fn, ms)), clearI = options.clearInterval ?? (h => clearInterval(h as ReturnType<typeof setInterval>));
  const random = mulberry32(options.seed ?? 7);
  const gaussian = () => { const u = Math.max(random(), 1e-12), v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const listeners = new Set<(sample: LocationSample) => void>();
  let distance = 0, accuracy = options.accuracyM ?? 3, stopped = false, handle: unknown = null;
  const length = routeLength(routeM);
  const emit = (): LocationSample | null => {
    if (stopped) return null;
    const truth = along(routeM, distance);
    const scatter = accuracy * .5;
    const e = truth[0] + gaussian() * scatter, n = truth[1] + gaussian() * scatter;
    const [lon, lat] = enuToWgs84([e, n, 0], origin);
    const sample: LocationSample = { timestampMs: now(), longitude: lon, latitude: lat, altitudeM: null, horizontalAccuracyM: accuracy * (0.85 + random() * .3),
      verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' };
    for (const l of listeners) l(sample);
    return sample;
  };
  const start = () => { if (handle == null) handle = setI(() => { emit(); }, interval); };
  const halt = () => { if (handle != null) { clearI(handle); handle = null; } };
  return {
    kind: 'synthetic', routeLengthM: length,
    subscribe(listener) { listeners.add(listener); start(); return () => { listeners.delete(listener); if (!listeners.size) halt(); }; },
    walkTo(metres) { distance = Math.max(0, Math.min(length, metres)); },
    walk(delta) { distance = Math.max(0, Math.min(length, distance + delta)); },
    setAccuracy(metres) { accuracy = Math.max(.5, metres); },
    stop() { stopped = true; },
    resume() { stopped = false; },
    positionM: () => along(routeM, distance),
    distanceM: () => distance,
    emitNow: emit,
  };
}
