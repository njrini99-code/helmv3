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
    // §11/§70: healthy play shows nothing in the corner; before the first fix the only chip is Locating….
    expect(document.querySelector('[data-slot="one-tap-sync"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-toast"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-shots"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-location"]')!.textContent).toBe('Locating…');
    expect(document.querySelector('[data-slot="one-tap-distances"]')!.textContent).toContain('Waiting for a GPS fix');
    expect(state()).toBe('HOLE_READY');
    // On the tee the first mark is "Start hole"; Putt made waits for the green.
    expect(document.querySelector('[data-slot="one-tap-actions"]')!.getAttribute('data-stage')).toBe('tee');
    expect(document.querySelector('[data-slot="one-tap-mark"]')!.textContent).toBe('Start hole');
    expect(document.querySelector('[data-slot="one-tap-putt-made"]')).toBeNull();
  });

  it('names a reduced-precision fix for what it is: the chip carries the radius, the readout the setting that fixes it', () => {
    // Peek'n Peak 2026-09-17: Precise Location off on the 9th green read "Not at the course yet".
    const phone = manualSource();
    render(<OneTapPlayerScreen roundId="r-approx" pkg={pilotPackage} holeKey={HOLE} terrain={null} location={phone} storage={null} reducedMotion />);
    const tee = pointOn('tee');
    act(() => { phone.at([tee[0] + 400, tee[1]], 1_000_000, 3200); });
    const chip = document.querySelector('[data-slot="one-tap-location"]')!;
    expect(chip.textContent).toBe('Location approximate ±3.2 km');
    expect(chip.getAttribute('data-quality')).toBe('approximate');
    expect(document.querySelector('[data-slot="one-tap-distances"]')!.textContent).toContain('turn on Precise Location');
    expect(markers()).toEqual([]);
    // Precise Location on: real fixes take over, the chip goes quiet.
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 1_000_000 + t); });
    expect(document.querySelector('[data-slot="one-tap-location"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-distances"]')!.getAttribute('data-basis')).toBe('live_fix');
  });

  it('marks the ball where the phone is: provisional at the tap, final after 750 ms, distances and lie from real data, undo inside the window', async () => {
    const phone = manualSource();
    render(<OneTapPlayerScreen roundId="r2" pkg={pilotPackage} holeKey={HOLE} terrain={null} location={phone} storage={null} reducedMotion />);
    const tee = pointOn('tee');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 1_000_000 + t); });
    expect(document.querySelector('[data-slot="one-tap-location"]')).toBeNull();
    const readout = document.querySelector('[data-slot="one-tap-distances"]')!;
    expect(readout.getAttribute('data-basis')).toBe('live_fix');
    // §15: the approach reads F/C/B from where the golfer stands.
    expect(readout.getAttribute('data-readout-mode')).toBe('approach');
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
    // §13: "✓ Saved … Undo" for the undo window; a queued sync is not a chip (§70).
    expect(document.querySelector('[data-slot="one-tap-toast"]')!.getAttribute('data-kind')).toBe('saved');
    expect(document.querySelector('[data-slot="one-tap-toast"]')!.textContent).toContain('✓ Saved');
    expect(document.querySelector('[data-slot="one-tap-sync"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-lie"]')!.textContent).toMatch(/^(Tee|Near tee edge|Likely tee)/);
    expect(document.querySelector('[data-slot="one-tap-undo"]')).not.toBeNull();
    // §14: no Putt made from the tee; after the first mark the button reads Mark ball.
    expect(document.querySelector('[data-slot="one-tap-putt-made"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-actions"]')!.getAttribute('data-stage')).toBe('play');
    expect(document.querySelector('[data-slot="one-tap-mark"]')!.textContent).toBe('Mark ball');
    fireEvent.click(document.querySelector('[data-slot="one-tap-undo"]')!);
    expect(markers()).toEqual(['player']);
    expect(state()).toBe('HOLE_READY');
    expect(document.querySelector('[data-slot="one-tap-undo"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-mark"]')!.textContent).toBe('Start hole');
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
    expect(document.querySelector('[data-slot="one-tap-toast"]')!.getAttribute('data-kind')).toBe('no_fix');
    expect(document.querySelector('[data-slot="one-tap-toast"]')!.textContent).toBe('No location · not saved');
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
    // §14: on the green Putt made joins Mark ball.
    expect(document.querySelector('[data-slot="one-tap-actions"]')!.getAttribute('data-stage')).toBe('green');
    expect(document.querySelector('[data-slot="one-tap-mark"]')!.textContent).toBe('Mark ball');
    expect(document.querySelector('[data-slot="one-tap-putt-made"]')!.textContent).toBe('Putt made');
    expect(root().getAttribute('data-camera-framing')).toBe('whole_green');
    // §15–16: standing on the green switches the readout to ON GREEN — no F/C/B,
    // the centre with honest uncertainty, and the pin is never pretended.
    const readout = document.querySelector('[data-slot="one-tap-distances"]')!;
    expect(readout.getAttribute('data-readout-mode')).toBe('on_green');
    expect(readout.textContent).not.toMatch(/F\d+C\d+B\d+/);
    expect(readout.textContent).toContain('On green');
    expect(readout.textContent).toContain('pin not marked');
    expect(readout.textContent).toMatch(/Center \d+ yd · ±\d+ yd|Short putt · position approximate/);
  });
});
