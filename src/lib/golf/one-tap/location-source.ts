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
  getCurrentPosition?(success: (position: GeolocationPosition) => void, error?: (error: GeolocationPositionError) => void, options?: PositionOptions): void;
}
/** A fix time this far from the arrival clock is not a time on our clock:
 * WebKit has reported `position.timestamp` in microseconds (2026-09-17, the
 * preview under Playwright's WebKit: every tap read GPS_UNAVAILABLE because
 * no sample sat inside the window), and a phone's clock can be set wrong.
 * The receiver's fix precedes its arrival by well under a minute, so the
 * arrival time is the honest fallback. */
export const FIX_CLOCK_TOLERANCE_MS = 60_000;
export function sampleFromPosition(position: GeolocationPosition, nowMs = Date.now()): LocationSample {
  const c = position.coords;
  const reported = position.timestamp;
  const timestampMs = Number.isFinite(reported) && Math.abs(reported - nowMs) <= FIX_CLOCK_TOLERANCE_MS ? reported : nowMs;
  return { timestampMs, longitude: c.longitude, latitude: c.latitude,
    altitudeM: c.altitude ?? null, horizontalAccuracyM: c.accuracy, verticalAccuracyM: c.altitudeAccuracy ?? null,
    speedMps: c.speed ?? null, headingDegrees: c.heading ?? null, source: 'device' };
}

/** Master design §67: `navigation` runs while the course screen is open;
 * `capture` is the short burst around a tap. The web Geolocation API inside
 * the mobile shell has no energy tiers, so both watch at high accuracy with
 * no cached fixes; capture additionally asks for one fresh fix at once and
 * gives up sooner, so a tap never waits on a stale watch. */
export type LocationWatchMode = 'navigation' | 'capture';
export type LocationStatus = 'idle' | 'watching' | 'paused' | 'reacquiring' | 'denied' | 'unavailable' | 'timeout';
export const WATCH_OPTIONS: Readonly<Record<LocationWatchMode, PositionOptions>> = Object.freeze({
  navigation: { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
  capture: { enableHighAccuracy: true, maximumAge: 0, timeout: 8_000 },
});
export interface DeviceLocationSource extends LocationSource {
  readonly kind: 'device';
  status(): LocationStatus;
  subscribeStatus(listener: (status: LocationStatus) => void): () => void;
  setMode(mode: LocationWatchMode): void;
  mode(): LocationWatchMode;
  /** §67 "app backgrounded": drop the watch; `resume` reacquires and reports
   * `reacquiring` until the first new fix, so the UI can say Locating… instead
   * of pretending the path continued. */
  pause(): void;
  resume(): void;
}
/** The platform watcher, highest accuracy, no cached fixes. A denial stops
 * the watch and reports `denied`; a timeout or an unavailable fix keeps the
 * watch and reports the state, and the controller reports GPS_UNAVAILABLE on
 * the next tap instead of inventing a position. */
export function deviceLocationSource(geolocation: GeolocationLike | null | undefined = typeof navigator === 'undefined' ? null : navigator.geolocation,
  onError?: (error: GeolocationPositionError) => void): DeviceLocationSource | null {
  if (!geolocation) return null;
  const listeners = new Set<(sample: LocationSample) => void>(), statusListeners = new Set<(status: LocationStatus) => void>();
  let watchId: number | null = null, status: LocationStatus = 'idle', mode: LocationWatchMode = 'navigation', paused = false;
  const setStatus = (next: LocationStatus) => { if (status === next) return; status = next; for (const l of statusListeners) l(next); };
  const onFix = (position: GeolocationPosition) => {
    // A fix from a cleared watch (paused, unsubscribed) never becomes a sample.
    if (paused || watchId == null) return;
    const sample = sampleFromPosition(position);
    for (const l of listeners) l(sample);
    if (status !== 'paused') setStatus('watching');
  };
  const onErr = (error: GeolocationPositionError) => {
    onError?.(error);
    if (error.code === 1) { clear(); setStatus('denied'); }
    else if (error.code === 2) setStatus('unavailable');
    else setStatus('timeout');
  };
  const clear = () => { if (watchId != null) { geolocation.clearWatch(watchId); watchId = null; } };
  const watch = () => { clear(); watchId = geolocation.watchPosition(onFix, onErr, WATCH_OPTIONS[mode]); };
  return {
    kind: 'device',
    status: () => status,
    mode: () => mode,
    subscribeStatus(listener) { statusListeners.add(listener); return () => { statusListeners.delete(listener); }; },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && !paused) { watch(); setStatus('watching'); }
      return () => { listeners.delete(listener); if (!listeners.size) { clear(); setStatus('idle'); } };
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      if (watchId == null || paused) return;
      watch();
      // A tap wants a fresh fix now, not the next scheduled one.
      if (next === 'capture') geolocation.getCurrentPosition?.(onFix, onErr, WATCH_OPTIONS.capture);
    },
    pause() { if (paused) return; paused = true; clear(); setStatus('paused'); },
    resume() {
      if (!paused) return;
      paused = false;
      if (!listeners.size) { setStatus('idle'); return; }
      setStatus('reacquiring'); watch();
    },
  };
}
export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown';
interface PermissionsLike { query(descriptor: { name: 'geolocation' }): Promise<{ state: string }> }
/** §8.2 without a native bridge: the Permissions API says granted / prompt /
 * denied where the WebView exposes it; otherwise `unknown`, and the first
 * watch is the prompt. Reduced accuracy cannot be read from the web API, so a
 * weak-location state is judged from the fixes' reported accuracy instead. */
export async function queryLocationPermission(permissions: PermissionsLike | null | undefined = typeof navigator === 'undefined' ? null : (navigator as { permissions?: PermissionsLike }).permissions): Promise<LocationPermission> {
  if (!permissions?.query) return 'unknown';
  try {
    const { state } = await permissions.query({ name: 'geolocation' });
    return state === 'granted' || state === 'prompt' || state === 'denied' ? state : 'unknown';
  } catch { return 'unknown'; }
}
interface DocumentLike { visibilityState: string; addEventListener(type: 'visibilitychange', listener: () => void): void; removeEventListener(type: 'visibilitychange', listener: () => void): void }
/** §67: no background location in V1. Hidden pauses the watch; visible
 * resumes and reacquires. Returns the unbind. */
export function bindVisibilityLifecycle(source: Pick<DeviceLocationSource, 'pause' | 'resume'>, doc: DocumentLike | null | undefined = typeof document === 'undefined' ? null : document): () => void {
  if (!doc) return () => {};
  const onChange = () => { if (doc.visibilityState === 'hidden') source.pause(); else source.resume(); };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
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
