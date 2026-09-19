import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { OneTapPlayerScreen } from './OneTapPlayerScreen';
import { useOneTapRound } from './use-one-tap-round';
import type { OneTapView } from './use-one-tap';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { enuToWgs84, localOriginFor } from '@/lib/golf/one-tap/geodesy';
import { largestOuterRing, ringCentroid } from '@/lib/golf/one-tap/hole-distances';
import { buildSurfacePartition } from '@/lib/golf/one-tap/lie-classifier';
import type { LocationSample } from '@/lib/golf/one-tap/location-estimator';
import type { LocationSource } from '@/lib/golf/one-tap/location-source';
import type { PointM } from '@/lib/golf/course-geometry/types';

/** Task 16 — Competition Mode on the screen: distance and direction stay,
 * elevation (the only advice V1 offers) disappears, the caption says so,
 * and the ••• sheet carries the Local Rule caveat with the round setting. */
const HOLE = 'cacapon-07';
const origin = localOriginFor(pilotPackage);
const partition = buildSurfacePartition(pilotPackage, HOLE);
const terrain = parseTerrainMesh(JSON.parse(readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/cacapon-07-terrain.json'), 'utf8')), pilotPackage);
const fairway = ringCentroid(largestOuterRing(partition.surfaces.find(s => s.lieClass === 'fairway')!.feature)!);
function manualSource() {
  const listeners = new Set<(s: LocationSample) => void>();
  return { kind: 'synthetic' as const, subscribe(listener: (s: LocationSample) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    at([e, n]: PointM, tMs: number) { const [longitude, latitude] = enuToWgs84([e, n, 0], origin); for (const l of listeners) l({ timestampMs: tMs, longitude, latitude, altitudeM: null, horizontalAccuracyM: 3, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' }); } } satisfies LocationSource & { at(p: PointM, t: number): void };
}
function Harness({ roundType, source, onView }: { roundType: 'practice' | 'tournament'; source: LocationSource; onView?: (v: OneTapView) => void }) {
  const round = useOneTapRound({ roundId: `r-${roundType}`, pkg: pilotPackage, holeKeys: [HOLE], location: source, storage: null, roundType });
  return <OneTapPlayerScreen roundId={`r-${roundType}`} pkg={pilotPackage} holeKey={HOLE} terrain={terrain} location={source} storage={null} round={round} onView={onView} reducedMotion />;
}
const readout = () => document.querySelector('[data-slot="one-tap-distances"]')!;
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));

describe('One-Tap Competition Mode', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    if (!window.matchMedia) Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('practice shows elevation to the green from the terrain; competition shows distance only and says so', () => {
    let latest: OneTapView | null = null;
    const source = manualSource();
    const { unmount } = render(<Harness roundType="practice" source={source} onView={v => { latest = v; }} />);
    act(() => { source.at(fairway, 1_000_500); });
    expect(readout().getAttribute('data-play-mode')).toBe('practice');
    expect(latest!.policy).toMatchObject({ mode: 'practice', distances: true, direction: true, elevationDelta: true });
    expect(typeof latest!.advice.elevationDeltaM).toBe('number');
    const feet = Math.round(latest!.advice.elevationDeltaM! * 3.28084);
    expect(!!document.querySelector('[data-slot="one-tap-elevation"]')).toBe(Math.abs(feet) >= 1);
    expect(document.querySelector('[data-slot="one-tap-competition"]')).toBeNull();
    expect(document.querySelector('[data-distance="C"]')).not.toBeNull();
    unmount();

    const tournament = manualSource();
    render(<Harness roundType="tournament" source={tournament} onView={v => { latest = v; }} />);
    act(() => { tournament.at(fairway, 1_000_500); });
    expect(readout().getAttribute('data-play-mode')).toBe('competition');
    expect(latest!.policy).toMatchObject({ mode: 'competition', distances: true, direction: true, elevationDelta: false, playsLike: false, clubRecommendation: false, targetLineAdvice: false });
    expect(latest!.advice).toEqual({ elevationDeltaM: null, playsLikeM: null, club: null, line: null });
    expect(document.querySelector('[data-slot="one-tap-elevation"]')).toBeNull();
    expect(document.querySelector('[data-slot="one-tap-competition"]')).not.toBeNull();
    // Distance and direction are still there.
    expect(document.querySelector('[data-distance="C"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="one-tap-mark"]')).not.toBeNull();
  });

  it('the ••• sheet carries the Local Rule caveat: a practice round toggles, a tournament round is locked on', () => {
    const source = manualSource();
    const { unmount } = render(<Harness roundType="practice" source={source} />);
    openMenu();
    fireEvent.click(document.querySelector('[data-menu-item="mode"]')!);
    const sheet = document.querySelector('[data-sheet="mode"]')!;
    expect(sheet.getAttribute('data-play-mode')).toBe('practice');
    expect(sheet.getAttribute('data-locked')).toBe('false');
    expect(sheet.textContent).toMatch(/Local Rule/);
    expect(sheet.textContent).toMatch(/Committee/);
    fireEvent.click(document.querySelector('[data-slot="one-tap-mode-toggle"]')!);
    expect(document.querySelector('[data-sheet="mode"]')).toBeNull();
    expect(readout().getAttribute('data-play-mode')).toBe('competition');
    openMenu();
    expect(document.querySelector('[data-menu-item="mode"]')!.textContent).toContain('Competition Mode · on');
    unmount();

    render(<Harness roundType="tournament" source={manualSource()} />);
    openMenu();
    fireEvent.click(document.querySelector('[data-menu-item="mode"]')!);
    const locked = document.querySelector('[data-sheet="mode"]')!;
    expect(locked.getAttribute('data-locked')).toBe('true');
    expect(locked.querySelector('[data-slot="one-tap-mode-toggle"]')).toBeNull();
    expect(locked.querySelector('[data-slot="one-tap-mode-note"]')!.textContent).toMatch(/tournament and qualifier/);
  });
});
