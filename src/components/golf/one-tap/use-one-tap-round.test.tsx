import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { OneTapPlayerScreen } from './OneTapPlayerScreen';
import { useOneTapRound, ROUND_STORAGE_PREFIX } from './use-one-tap-round';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { enuToWgs84, localOriginFor } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { HOLE_COMPLETION_FADE_MS, NEXT_TEE_RULE } from '@/lib/golf/one-tap/hole-lifecycle';
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
    expect(JSON.parse(storage.map.get(ROUND_STORAGE_PREFIX + 'round')!)).toMatchObject({ holeIndex: 1 });
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
    // §80: an inferred close never invents a cup — the hole reports MISSING_CUP
    // (and, with only a green mark, MISSING_START) and the card waits for Review.
    expect(result.current.completion).toMatchObject({ holeKey: holeKeys[index], inferred: true, clean: false, shots: 0, terminalMethod: 'NEXT_TEE_INFERRED' });
    expect(result.current.completion!.report.flags).toEqual(['MISSING_CUP', 'MISSING_START']);
    expect(result.current.repo.list('round').filter(a => a.holeKey === holeKeys[index])).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(HOLE_COMPLETION_FADE_MS * 3); });
    expect(result.current.completion).not.toBeNull();
    // Leaving the tee resets the dwell: a walk-through never closes a hole.
    act(() => result.current.takeBackInferred());
    expect(result.current).toMatchObject({ holeIndex: index, status: 'OPEN', terminalMethod: null, inferredFrom: null, completion: null });
    act(() => { phone.at(nextTee, 2_030_000); phone.at(green, 2_035_000); phone.at(nextTee, 2_040_000); phone.at(nextTee, 2_040_000 + NEXT_TEE_RULE.dwellMs - 1000); });
    expect(result.current.status).toBe('OPEN');
    expect(result.current.holeIndex).toBe(index);
  });

  it('adds a penalty to the score without a shot segment, resolves it with an ordinary drop mark, and skips or changes holes as round state (§58, §79)', () => {
    const phone = manualSource();
    const storage = memoryStorage();
    const { result } = renderHook(() => useOneTapRound({ roundId: 'round-pen', pkg: pilotPackage, holeKeys, location: phone, storage }));
    const tee = pointOn(holeKeys[0]!, 'tee');
    act(() => result.current.repo.upsert(greenAnchor(holeKeys[0]!, tee, { id: 'tee-mark', roundId: 'round-pen', tapTimestamp: '2026-09-16T12:00:00.000Z', liePosterior: [{ featureId: null, lieClass: 'tee', p: 1 }], primaryLie: 'tee' })));
    vi.setSystemTime(Date.parse('2026-09-16T12:10:00.000Z'));
    act(() => result.current.addPenalty('penalty_area'));
    expect(result.current).toMatchObject({ strokes: 0, penaltyStrokes: 1, score: 1, unresolvedPenalties: 1 });
    expect(result.current.penalties).toHaveLength(1);
    expect(result.current.penalties[0]).toMatchObject({ kind: 'penalty_area', strokes: 1, relatedAnchorId: 'tee-mark', holeKey: holeKeys[0], syncState: 'QUEUED' });
    expect(result.current.integrity.flags).toEqual(['PENALTY_UNRESOLVED']);
    // No anchor was created or moved by the penalty.
    expect(result.current.repo.list('round-pen').map(a => a.id)).toEqual(['tee-mark']);
    // The drop is the next ordinary mark: one more shot segment, penalty resolved.
    act(() => result.current.repo.upsert(greenAnchor(holeKeys[0]!, pointOn(holeKeys[0]!, 'fairway'), { id: 'drop-mark', roundId: 'round-pen', sequence: 1, tapTimestamp: '2026-09-16T12:20:00.000Z', liePosterior: [{ featureId: null, lieClass: 'fairway', p: 1 }], primaryLie: 'fairway' })));
    expect(result.current).toMatchObject({ strokes: 1, penaltyStrokes: 1, score: 2, unresolvedPenalties: 0 });
    expect(result.current.integrity.flags).toEqual([]);
    expect(result.current.repo.get('drop-mark')).toMatchObject({ provisional: false, terminal: false, terminalMethod: null });
    // Persisted on the device with the anchors; a two-stroke penalty adds two; removal is a tombstone.
    expect(new (Object.getPrototypeOf(result.current.repo).constructor)(storage, ['round-pen'], { courseId: 'synthetic-course', siteId: 'synthetic' }).list('round-pen')).toHaveLength(2);
    act(() => result.current.addPenalty('other', 2));
    expect(result.current).toMatchObject({ penaltyStrokes: 3, score: 4 });
    act(() => result.current.removeLastPenalty());
    expect(result.current).toMatchObject({ penaltyStrokes: 1, score: 2 });
    expect(JSON.parse(storage.map.get('golfhelm-one-tap-penalties:round-pen')!)).toHaveLength(2);
    // Skip hole: round state, no score, no integrity flags on the hole left behind; a mark after the skip plays it again.
    act(() => result.current.goToHole(2));
    expect(result.current.holeIndex).toBe(2);
    act(() => result.current.skipHole());
    expect(result.current.holeIndex).toBe(3);
    expect(result.current.scorecard[2]).toMatchObject({ skipped: true, status: 'OPEN', score: 0 });
    expect(result.current.scorecard[2]!.integrity.flags).toEqual([]);
    expect(JSON.parse(storage.map.get(ROUND_STORAGE_PREFIX + 'round-pen')!)).toMatchObject({ holeIndex: 3, skipped: { [holeKeys[2]!]: expect.any(String) } });
    act(() => result.current.goToHole(2));
    act(() => result.current.repo.upsert(greenAnchor(holeKeys[2]!, pointOn(holeKeys[2]!, 'tee'), { id: 'late-tee', roundId: 'round-pen', tapTimestamp: '2026-09-16T13:00:00.000Z', liePosterior: [{ featureId: null, lieClass: 'tee', p: 1 }], primaryLie: 'tee' })));
    expect(result.current.scorecard[2]!.skipped).toBe(false);
    // Review hole on demand: the card shows the open hole's verdict and stays until closed.
    act(() => result.current.openReview());
    expect(result.current.completion).toMatchObject({ holeKey: holeKeys[2], review: true, clean: true, shots: 0 });
    act(() => { vi.advanceTimersByTime(HOLE_COMPLETION_FADE_MS * 2); });
    expect(result.current.completion).not.toBeNull();
    act(() => result.current.dismissCompletion());
    expect(result.current.completion).toBeNull();
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
    // §12: zero shots is not a chip.
    expect(document.querySelector('[data-slot="one-tap-shots"]')).toBeNull();
    const green = pointOn(holeKeys[0]!, 'green');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(green, 2_000_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-holed"]')!);
    expect(screen().getAttribute('data-hole-status')).toBe('COMPLETE');
    expect(document.querySelector('[data-slot="one-tap-shots"]')!.textContent).toBe('Holed · 0 shots');
    expect(document.querySelector('[data-slot="one-tap-mark"]')).toBeNull();
    // §19 problem hole: a cup mark with no tee mark is flagged, and Review names it.
    const card = () => document.querySelector('[data-slot="one-tap-hole-complete"]');
    expect(card()!.getAttribute('data-integrity')).toBe('MISSING_START');
    expect(card()!.textContent).toContain('Hole 1 · check 1 item');
    expect(document.querySelector('[data-slot="one-tap-review-panel"]')).toBeNull();
    fireEvent.click(document.querySelector('[data-slot="one-tap-review"]')!);
    expect(document.querySelector('[data-slot="one-tap-review-panel"] [data-flag="MISSING_START"]')!.textContent).toContain('No tee mark');
    expect(document.querySelector('[data-slot="one-tap-review-back"]')!.textContent).toBe('Reopen hole');
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLE_COMPLETION_FADE_MS * 2); });
    expect(card()).not.toBeNull();
    fireEvent.click(document.querySelector('[data-slot="one-tap-next-hole"]')!);
    expect(card()).toBeNull();
    expect(screen().getAttribute('data-hole-key')).toBe(holeKeys[1]);
    expect(screen().getAttribute('data-hole-status')).toBe('OPEN');
    expect(document.querySelector('[data-slot="one-tap-mark"]')).not.toBeNull();
    // The next hole starts with no marks; YOU stays on the course.
    expect(document.querySelectorAll('[data-marked-position]:not([data-marker-kind="player"])').length).toBe(0);
  });

  it('shows a clean completion for a tee-to-cup hole and fades it after two seconds (§19), again after a reopen', async () => {
    const phone = manualSource();
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    function Harness() {
      const round = useOneTapRound({ roundId: 'round-clean', pkg: pilotPackage, holeKeys, location: phone, storage: null });
      return <OneTapPlayerScreen roundId="round-clean" pkg={pilotPackage} holeKey={round.holeKey} terrain={null} location={phone} storage={null} reducedMotion round={round} />;
    }
    render(<Harness />);
    const screen = () => document.querySelector('[data-slot="one-tap-screen"]')!, card = () => document.querySelector('[data-slot="one-tap-hole-complete"]');
    const tee = pointOn(holeKeys[0]!, 'tee'), green = pointOn(holeKeys[0]!, 'green');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 2_000_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    act(() => { vi.setSystemTime(2_060_000); for (let t = -1500; t <= 0; t += 500) phone.at(green, 2_060_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(card()).toBeNull();
    fireEvent.click(document.querySelector('[data-slot="one-tap-holed"]')!);
    expect(screen().getAttribute('data-hole-status')).toBe('COMPLETE');
    expect(card()!.getAttribute('data-integrity')).toBe('CLEAN');
    expect(card()!.textContent).toBe('Hole 1 · 1 shot · complete ✓');
    expect(document.querySelector('[data-slot="one-tap-review"]')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLE_COMPLETION_FADE_MS - 100); });
    expect(card()).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(card()).toBeNull();
    expect(screen().getAttribute('data-hole-status')).toBe('COMPLETE');
    // Reopen (a mistaken hole-out), then hole out again: a fresh clean card
    // that fades on its own, the tee mark still on record.
    fireEvent.click(document.querySelector('[data-slot="one-tap-reopen"]')!);
    expect(screen().getAttribute('data-hole-status')).toBe('OPEN');
    fireEvent.click(document.querySelector('[data-slot="one-tap-holed"]')!);
    expect(card()!.getAttribute('data-integrity')).toBe('CLEAN');
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLE_COMPLETION_FADE_MS + 100); });
    expect(card()).toBeNull();
  });

  it('keeps the exceptions in the ••• menu: penalty sheet, delete last mark, pause, review, skip and change hole (§79)', async () => {
    const phone = manualSource();
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
    function Harness() {
      const round = useOneTapRound({ roundId: 'round-menu', pkg: pilotPackage, holeKeys, location: phone, storage: null });
      return <OneTapPlayerScreen roundId="round-menu" pkg={pilotPackage} holeKey={round.holeKey} terrain={null} location={phone} storage={null} reducedMotion round={round} />;
    }
    render(<Harness />);
    const screen = () => document.querySelector('[data-slot="one-tap-screen"]')!;
    const more = () => document.querySelector<HTMLButtonElement>('button[aria-label="More"]')!;
    const item = (key: string) => document.querySelector<HTMLButtonElement>(`[data-menu-item="${key}"]`);
    // Nothing of this sits on the primary screen.
    expect(document.querySelector('[data-menu-item]')).toBeNull();
    fireEvent.click(more());
    expect([...document.querySelectorAll('[data-menu-item]')].map(b => b.getAttribute('data-menu-item'))).toEqual(['penalty', 'delete-last', 'review', 'change-hole', 'skip', 'pause']);
    expect(item('delete-last')!.disabled).toBe(true);
    // Penalty / drop: a separate score event, then the drop is an ordinary mark.
    fireEvent.click(item('penalty')!);
    expect(document.querySelector('[data-menu-item]')).toBeNull();
    expect(document.querySelector('[data-sheet="penalty"]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-penalty-kind="penalty_area"]')!);
    expect(document.querySelector('[data-sheet="penalty"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-penalty"]')!.textContent).toBe('+1 penalty');
    expect(document.querySelector('[data-slot="one-tap-shots"]')).toBeNull();
    const tee = pointOn(holeKeys[0]!, 'tee');
    act(() => { for (let t = -1500; t <= 0; t += 500) phone.at(tee, 2_000_000 + t); });
    fireEvent.click(document.querySelector('[data-slot="one-tap-mark"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(document.querySelectorAll('[data-marked-position]:not([data-marker-kind="player"])').length).toBe(1);
    // Delete last mark: a tombstone at any age.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    fireEvent.click(more());
    expect(item('delete-last')!.disabled).toBe(false);
    fireEvent.click(item('delete-last')!);
    expect(document.querySelectorAll('[data-marked-position]:not([data-marker-kind="player"])').length).toBe(0);
    // Pause tracking: the chip appears and MARK BALL waits.
    fireEvent.click(more());
    fireEvent.click(item('pause')!);
    expect(document.querySelector('[data-slot="one-tap-paused"]')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[data-slot="one-tap-mark"]')!.disabled).toBe(true);
    fireEvent.click(more());
    expect(item('pause')!.textContent).toBe('Resume tracking');
    fireEvent.click(item('pause')!);
    expect(document.querySelector('[data-slot="one-tap-paused"]')).toBeNull();
    // Review hole on demand: the open hole's verdict, closed by the golfer.
    fireEvent.click(more());
    fireEvent.click(item('review')!);
    const card = document.querySelector('[data-slot="one-tap-hole-complete"]')!;
    expect(card.getAttribute('data-review')).toBe('true');
    expect(card.textContent).toContain('Hole 1 · 0 shots · +1 penalty · check 1 item');
    expect(card.querySelector('[data-flag="PENALTY_UNRESOLVED"]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-slot="one-tap-review-keep"]')!);
    expect(document.querySelector('[data-slot="one-tap-hole-complete"]')).toBeNull();
    // Skip hole moves on; Change hole comes back.
    fireEvent.click(more());
    fireEvent.click(item('skip')!);
    expect(screen().getAttribute('data-hole-key')).toBe(holeKeys[1]);
    fireEvent.click(more());
    fireEvent.click(item('change-hole')!);
    expect(document.querySelector('[data-sheet="hole"]')).not.toBeNull();
    expect(document.querySelector('[data-hole-index="0"]')!.textContent).toContain('skipped');
    fireEvent.click(document.querySelector('[data-hole-index="0"]')!);
    expect(document.querySelector('[data-sheet="hole"]')).toBeNull();
    expect(screen().getAttribute('data-hole-key')).toBe(holeKeys[0]);
  });
});
