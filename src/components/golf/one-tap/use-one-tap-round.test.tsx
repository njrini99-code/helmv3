import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { OneTapPlayerScreen } from './OneTapPlayerScreen';
import { useOneTapRound, ROUND_STORAGE_PREFIX } from './use-one-tap-round';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { enuToWgs84, localOriginFor } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { NEXT_TEE_RULE } from '@/lib/golf/one-tap/hole-lifecycle';
import { buildSurfacePartition, distanceToBoundary, exactPointInPartition, type LieClass } from '@/lib/golf/one-tap/lie-classifier';
import type { LocationSample } from '@/lib/golf/one-tap/location-estimator';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import type { ShotAnchor } from '@/lib/golf/one-tap/shot-anchor';
import type { PointM } from '@/lib/golf/course-geometry/types';

const origin = localOriginFor(pilotPackage);
const holeKeys = pilotPackage.holes.map(h => h.key);
function pointOn(holeKey: string, lie: LieClass): PointM {
  const partition = buildSurfacePartition(pilotPackage, holeKey);
  const surface = partition.surfaces.find(s => s.lieClass === lie)!, ring = largestOuterRing(surface.feature)!;
  const inside = (p: PointM) => exactPointInPartition(partition, p).lieClass === lie && distanceToBoundary(p, surface.feature) > 2;
  const centre = ringCentroid(ring);
  if (inside(centre)) return centre;
  const [minX, minY, maxX, maxY] = surface.bounds;
  for (let y = minY; y <= maxY; y += 2) for (let x = minX; x <= maxX; x += 2) if (inside([x, y])) return [x, y];
  throw new Error(`no interior point on ${lie} of ${holeKey}`);
}
/** A pair of consecutive holes whose next tee is far enough from the green for the dwell rule. */
function holePair(): { index: number; green: PointM; nextTee: PointM } {
  for (let i = 0; i < holeKeys.length - 1; i++) {
    try {
      const green = pointOn(holeKeys[i]!, 'green'), nextTee = pointOn(holeKeys[i + 1]!, 'tee');
      if (Math.hypot(green[0] - nextTee[0], green[1] - nextTee[1]) >= NEXT_TEE_RULE.minDistanceFromGreenM + 5) return { index: i, green, nextTee };
    } catch { /* hole without the surface */ }
  }
  throw new Error('no usable hole pair');
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
function greenAnchor(holeKey: string, point: PointM, over: Partial<ShotAnchor> = {}): ShotAnchor {
  return { schemaVersion: 2, id: `anchor-${holeKey}`, roundId: 'round', courseId: 'synthetic-course', siteId: 'synthetic', holeKey, holeId: 1, sequence: 0, tapTimestamp: '2026-09-16T12:00:00.000Z', finalizedTimestamp: '2026-09-16T12:00:01.000Z', provisional: false,
    positionWgs84: [0, 0, null], positionENU: [point[0], point[1], 0], covarianceENU2D: [[4, 0], [0, 4]], sigmaM: 2, reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: 'green', p: .95 }, { featureId: null, lieClass: 'fringe', p: .05 }], primaryLie: 'green', confidence: 'HIGH',
    terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null, geometryVersion: pilotPackage.contentHash, terrainVersion: null,
    terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...over };
}
function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); }, map };
}

describe('One-Tap round', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(2_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the scorecard from the anchors on record and persists the open hole per round', () => {
    const storage = memoryStorage();
    const { result, unmount } = renderHook(() => useOneTapRound({ roundId: 'round', pkg: pilotPackage, holeKeys, location: null, storage }));
    expect(result.current.holeIndex).toBe(0);
    expect(result.current.scorecard).toHaveLength(holeKeys.length);
    expect(result.current.scorecard.every(r => r.strokes === 0 && r.status === 'OPEN')).toBe(true);
    const green = pointOn(holeKeys[0]!, 'green');
    act(() => {
      result.current.repo.upsert(greenAnchor(holeKeys[0]!, green, { id: 'anchor-a0', sequence: 0 }));
      result.current.repo.upsert(greenAnchor(holeKeys[0]!, green, { id: 'anchor-a1', sequence: 1, terminal: true, terminalMethod: 'CUP_MARK' }));
    });
    expect(result.current).toMatchObject({ strokes: 1, status: 'COMPLETE', terminalMethod: 'CUP_MARK' });
    act(() => result.current.nextHole());
    expect(result.current.holeIndex).toBe(1);
    expect(JSON.parse(storage.map.get(ROUND_STORAGE_PREFIX + 'round')!)).toEqual({ holeIndex: 1 });
    unmount();
    const again = renderHook(() => useOneTapRound({ roundId: 'round', pkg: pilotPackage, holeKeys, location: null, storage }));
    expect(again.result.current.holeIndex).toBe(1);
    expect(again.result.current.scorecard[0]).toMatchObject({ strokes: 1, status: 'COMPLETE' });
    act(() => again.result.current.previousHole());
    act(() => again.result.current.reopenHole());
    expect(again.result.current).toMatchObject({ holeIndex: 0, status: 'OPEN', terminalMethod: null });
  });

  it('closes a hole by the next-tee fallback only after the dwell on the next tee, and lets the player take it back', () => {
    const { index, green, nextTee } = holePair();
    const phone = manualSource();
    const storage = memoryStorage();
    storage.setItem(ROUND_STORAGE_PREFIX + 'round', JSON.stringify({ holeIndex: index }));
    const { result } = renderHook(() => useOneTapRound({ roundId: 'round', pkg: pilotPackage, holeKeys, location: phone, storage }));
    expect(result.current.holeKey).toBe(holeKeys[index]);
    act(() => result.current.repo.upsert(greenAnchor(holeKeys[index]!, green)));
    // Standing on the next tee, but not yet for 10 s: nothing closes.
    act(() => { phone.at(nextTee, 2_000_000); phone.at(nextTee, 2_000_000 + NEXT_TEE_RULE.dwellMs - 500); });
    expect(result.current.holeIndex).toBe(index);
    expect(result.current.status).toBe('OPEN');
    act(() => { phone.at(nextTee, 2_000_000 + NEXT_TEE_RULE.dwellMs + 100); });
    expect(result.current.holeIndex).toBe(index + 1);
    expect(result.current.scorecard[index]).toMatchObject({ status: 'COMPLETE', terminalMethod: 'NEXT_TEE_INFERRED', strokes: 0 });
    expect(result.current.inferredFrom).toEqual({ holeKey: holeKeys[index], ordinal: pilotPackage.holes[index]!.ordinal });
    expect(result.current.repo.get(`anchor-${holeKeys[index]}`)?.syncState).toBe('QUEUED');
    // Leaving the tee resets the dwell: a walk-through never closes a hole.
    act(() => result.current.takeBackInferred());
    expect(result.current).toMatchObject({ holeIndex: index, status: 'OPEN', terminalMethod: null, inferredFrom: null });
    act(() => { phone.at(nextTee, 2_030_000); phone.at(green, 2_035_000); phone.at(nextTee, 2_040_000); phone.at(nextTee, 2_040_000 + NEXT_TEE_RULE.dwellMs - 1000); });
    expect(result.current.status).toBe('OPEN');
    expect(result.current.holeIndex).toBe(index);
  });

  it('turns NEXT HOLE into the primary action once the hole is holed out, and moves the screen to the next hole', async () => {
    const phone = manualSource();
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    function Harness() {
      const round = useOneTapRound({ roundId: 'round-ui', pkg: pilotPackage, holeKeys, location: phone, storage: null });
      return <OneTapPlayerScreen roundId="round-ui" pkg={pilotPackage} holeKey={round.holeKey} terrain={null} location={phone} storage={null} reducedMotion round={round} />;
    }
    render(<Harness />);
    const screen = () => document.querySelector('[data-slot="one-tap-screen"]')!;
    expect(screen().getAttribute('data-hole-key')).toBe(holeKeys[0]);
    expect(document.querySelector('[data-slot="one-tap-strokes"]')!.textContent).toBe('0 strokes');
    const green = pointOn(holeKeys[0]!, 'green');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(green, 2_000_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-holed"]')!);
    expect(screen().getAttribute('data-hole-status')).toBe('COMPLETE');
    expect(document.querySelector('[data-slot="one-tap-strokes"]')!.textContent).toBe('Holed · 0');
    expect(document.querySelector('[data-slot="one-tap-mark"]')).toBeNull();
    fireEvent.click(document.querySelector('[data-slot="one-tap-next-hole"]')!);
    expect(screen().getAttribute('data-hole-key')).toBe(holeKeys[1]);
    expect(screen().getAttribute('data-hole-status')).toBe('OPEN');
    expect(document.querySelector('[data-slot="one-tap-mark"]')).not.toBeNull();
    // The next hole starts with no marks; YOU stays on the course.
    expect(document.querySelectorAll('[data-marked-position]:not([data-marker-kind="player"])').length).toBe(0);
  });
});
