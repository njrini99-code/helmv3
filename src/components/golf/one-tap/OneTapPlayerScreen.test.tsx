import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { OneTapPlayerScreen } from './OneTapPlayerScreen';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { enuToWgs84, localOriginFor } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { buildSurfacePartition, distanceToBoundary, exactPointInPartition, type LieClass } from '@/lib/golf/one-tap/lie-classifier';
import type { LocationSample } from '@/lib/golf/one-tap/location-estimator';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import type { PointM } from '@/lib/golf/course-geometry/types';

const HOLE = 'cacapon-07';
const origin = localOriginFor(pilotPackage);
const partition = buildSurfacePartition(pilotPackage, HOLE);
/** A point that is unambiguously on the named surface: its centroid when that
 * reads as the surface, otherwise the first grid point well inside it. */
function pointOn(lie: LieClass): PointM {
  const surface = partition.surfaces.find(s => s.lieClass === lie)!, ring = largestOuterRing(surface.feature)!;
  const inside = (p: PointM) => exactPointInPartition(partition, p).lieClass === lie && distanceToBoundary(p, surface.feature) > 4;
  const centre = ringCentroid(ring);
  if (inside(centre)) return centre;
  const [minX, minY, maxX, maxY] = surface.bounds;
  for (let y = minY; y <= maxY; y += 3) for (let x = minX; x <= maxX; x += 3) if (inside([x, y])) return [x, y];
  throw new Error(`no interior point on `);
}
/** A hand-driven location source: the test is the phone. */
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
const state = () => document.querySelector('[data-slot="one-tap-screen"]')!.getAttribute('data-one-tap-state');
const markers = () => Array.from(document.querySelectorAll('[data-annotation="marked-positions"] [data-marked-position]')).map(n => n.getAttribute('data-marker-kind'));

describe('One-Tap player screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('is the course itself: stage presentation with the HUD over it and MARK BALL beneath, no card chrome', () => {
    render(<OneTapPlayerScreen roundId="r1" pkg={pilotPackage} holeKey={HOLE} terrain={null} location={manualSource()} storage={null} reducedMotion />);
    expect(document.querySelector('[data-presentation="stage"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Expand course view|Open green in 3D/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(document.querySelector('[data-slot="stage-footer"] [data-slot="one-tap-mark"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="one-tap-status"]')!.textContent).toBe('Ready');
    expect(document.querySelector('[data-slot="one-tap-gps"]')!.textContent).toBe('No GPS');
    expect(document.querySelector('[data-slot="one-tap-distances"]')!.textContent).toContain('Waiting for a GPS fix');
    expect(state()).toBe('HOLE_READY');
  });

  it('marks the ball where the phone is: provisional at the tap, final after 750 ms, distances and lie from real data, undo inside the window', async () => {
    const phone = manualSource();
    render(<OneTapPlayerScreen roundId="r2" pkg={pilotPackage} holeKey={HOLE} terrain={null} location={phone} storage={null} reducedMotion />);
    const tee = pointOn('tee');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 1_000_000 + t); });
    expect(document.querySelector('[data-slot="one-tap-gps"]')!.textContent).toBe('GPS ±3 m');
    const readout = document.querySelector('[data-slot="one-tap-distances"]')!;
    expect(readout.getAttribute('data-basis')).toBe('live_fix');
    expect(readout.textContent).toMatch(/F\d+C\d+B\d+yd to green · ±\d+ yd · from where you stand/);
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    expect(state()).toBe('CAPTURE_PENDING');
    expect(markers()).toEqual(['provisional', 'player']);
    act(() => { phone.at(tee, 1_000_300); });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(state()).toBe('ANCHOR_SAVED');
    expect(markers()).toEqual(['ball', 'player']);
    // §5: the mark is the BALL; YOU is the live device standing on it, so its label yields until the golfer walks off.
    expect([...document.querySelectorAll('[data-marker-label]')].map(n => n.textContent)).toEqual(['BALL']);
    expect(document.querySelector('[data-marker-kind="player"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="one-tap-status"]')!.textContent).toBe('Marked · 1 to sync');
    expect(document.querySelector('[data-slot="one-tap-lie"]')!.textContent).toMatch(/^(Tee|Near tee edge|Likely tee)/);
    expect(document.querySelector('[data-slot="one-tap-undo"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="one-tap-holed"]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-slot="one-tap-undo"]')!);
    expect(markers()).toEqual(['player']);
    expect(state()).toBe('HOLE_READY');
    expect(document.querySelector('[data-slot="one-tap-undo"]')).toBeNull();
  });

  it('joins consecutive marks as the derived shot, keeps the whole hole framed while the player is far from the green and never marks without a fix', async () => {
    const phone = manualSource();
    const views: string[] = [];
    render(<OneTapPlayerScreen roundId="r3" pkg={pilotPackage} holeKey={HOLE} terrain={null} location={phone} storage={null} reducedMotion onView={v => { views.push(v.cameraState); }} />);
    const tee = pointOn('tee'), fairway = pointOn('fairway');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 1_000_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    // PLAYER_FOLLOW after a tee shot maps onto the tee state: the mark at the
    // player's feet stays in frame instead of being cropped by the approach area.
    expect(document.querySelector('[data-slot="one-tap-screen"]')!.getAttribute('data-camera-mode')).toBe('PLAYER_FOLLOW');
    expect(document.querySelector('[data-slot="one-tap-screen"]')!.getAttribute('data-camera-state')).toBe('tee');
    expect(views.at(-1)).toBe('tee');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(document.querySelector('[data-slot="one-tap-undo"]')).toBeNull();
    act(() => { vi.setSystemTime(1_060_000); for (let t = -1500; t <= 0; t += 500) phone.at(fairway, 1_060_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(markers()).toEqual(['anchor', 'ball', 'player']);
    expect(document.querySelectorAll('[data-marked-link]').length).toBe(1);
    expect(document.querySelector('[data-slot="one-tap-lie"]')!.textContent).toMatch(/^(Fairway|Likely fairway)/);
    // No fix inside the window: the tap reports GPS_UNAVAILABLE instead of inventing a position.
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); vi.setSystemTime(1_200_000); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(state()).toBe('GPS_UNAVAILABLE');
    expect(document.querySelector('[data-slot="one-tap-status"]')!.textContent).toMatch(/^No GPS fix/);
    expect(markers()).toEqual(['anchor', 'ball', 'player']);
  });

  it('follows the player: mark + green framed together, a gesture hands over the camera, Recenter refits, the green frames whole', async () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.setPointerCapture ??= () => {}; proto.releasePointerCapture ??= () => {}; proto.hasPointerCapture ??= () => false;
    const phone = manualSource();
    render(<OneTapPlayerScreen roundId="r4" pkg={pilotPackage} holeKey={HOLE} terrain={null} location={phone} storage={null} reducedMotion />);
    const root = () => document.querySelector('[data-slot="one-tap-screen"]')!;
    expect(root().getAttribute('data-camera-framing')).toBe('');
    const tee = pointOn('tee'), green = pointOn('green');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 1_000_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(root().getAttribute('data-camera-framing')).toBe('ball_to_green');
    fireEvent.pointerDown(document.querySelector('[data-slot="course-drawing"]')!, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
    expect(root().getAttribute('data-camera-mode')).toBe('MANUAL');
    expect(root().getAttribute('data-camera-framing')).toBe('');
    fireEvent.click(document.querySelector('[data-slot="one-tap-recenter"]')!);
    expect(root().getAttribute('data-camera-mode')).toBe('PLAYER_FOLLOW');
    expect(root().getAttribute('data-camera-framing')).toBe('ball_to_green');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    act(() => { vi.setSystemTime(1_060_000); for (let t = -1500; t <= 0; t += 500) phone.at(green, 1_060_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(document.querySelector('[data-slot="one-tap-lie"]')!.textContent).toMatch(/^(Green|Likely green)/);
    expect(root().getAttribute('data-camera-framing')).toBe('whole_green');
  });
});
