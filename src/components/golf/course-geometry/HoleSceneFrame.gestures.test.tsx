/**
 * HoleSceneFrame — the phone's orbit, tilt and pinch (on-course ask,
 * 2026-09-17: "moving my finger around and going the whole 360 and zoom").
 *
 * Without a WebGL runtime every camera update commits straight to state, so
 * the drawing's `data-camera-*` attributes are the pose after each event.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { HoleSceneFrame } from './HoleSceneFrame';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh, terrainHeight, type Point3M } from '@/lib/golf/course-geometry/terrain';
import type { TerrainRuntimeController } from '@/lib/golf/course-geometry/runtime-controller';
import type { SceneMarkers } from '@/lib/golf/course-geometry/scene-markers';
import course from '@/test/fixtures/course-geometry/cacapon.json';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

// No WebGL in jsdom: the runtime would report the terrain unavailable and
// turn the orbit off. The gestures under test live in the frame, not the canvas.
// A test that needs the runtime's read-only pick installs a fake through the
// same `runtimeRef` seam the canvas uses; the markers the frame hands the
// scene are recorded for the ruler assertions.
const harness = vi.hoisted(() => ({ runtime: false, pickAt: null as Point3M | null, picks: [] as [number, number][], markers: undefined as SceneMarkers | null | undefined }));
vi.mock('./CourseHoleScene', async () => {
  const actual = await vi.importActual<typeof import('./CourseHoleScene')>('./CourseHoleScene');
  const { useEffect } = await vi.importActual<typeof import('react')>('react');
  function CourseHoleScene({ runtimeRef, markers }: { runtimeRef?: RefObject<TerrainRuntimeController | null>; markers?: SceneMarkers | null }) {
    harness.markers = markers;
    useEffect(() => {
      if (!harness.runtime || !runtimeRef) return;
      runtimeRef.current = { setCamera() {}, pick(x, y) { harness.picks.push([x, y]); return harness.pickAt; } };
      return () => { runtimeRef.current = null; };
    }, [runtimeRef]);
    return <div data-testid="course-scene" />;
  }
  return { ...actual, CourseHoleScene };
});

const pkg = parseGeometryPackage(course);
const mesh = parseTerrainMesh(source, pkg);
const scene = buildHoleScene(pkg, 'cacapon-07', [], mesh);

beforeAll(() => {
  // jsdom has neither PointerEvent nor pointer capture; the handlers need both.
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; this.pointerType = init.pointerType ?? 'touch'; }
  }
  Object.assign(globalThis, { PointerEvent: PointerEventPolyfill });
  Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; } });
});
afterEach(() => { cleanup(); harness.runtime = false; harness.pickAt = null; harness.picks = []; harness.markers = undefined; });

function mount(markers?: SceneMarkers | null) {
  const view = render(<HoleSceneFrame scene={scene} context="entry" presentation="stage" markers={markers} />);
  const drawing = document.querySelector<HTMLElement>('[data-slot="course-drawing"][aria-label]')!;
  expect(drawing).not.toBeNull();
  const pose = () => ({ yaw: Number(drawing.getAttribute('data-camera-yaw')), pitch: Number(drawing.getAttribute('data-camera-pitch')), zoom: Number(drawing.getAttribute('data-camera-zoom')) });
  const down = (id: number, x: number, y: number) => act(() => { fireEvent.pointerDown(drawing, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, isPrimary: id === 1 }); });
  const move = (id: number, x: number, y: number) => act(() => { fireEvent.pointerMove(drawing, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y }); });
  const up = (id: number, x: number, y: number) => act(() => { fireEvent.pointerUp(drawing, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y }); });
  // Moves coalesce onto the next frame; settle it before reading the pose.
  const frame = () => act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  const tap = async (x: number, y: number) => { await down(1, x, y); await up(1, x, y); await frame(); };
  const rerender = (next?: SceneMarkers | null) => view.rerender(<HoleSceneFrame scene={scene} context="entry" presentation="stage" markers={next} />);
  return { pose, down, move, up, frame, tap, rerender };
}

describe('HoleSceneFrame gestures', () => {
  it('orbits the whole circle: a long drag passes 45°, wraps past 180° and never dead-ends', async () => {
    const { pose, down, move, up, frame } = mount();
    expect(pose()).toMatchObject({ yaw: 0, pitch: 36, zoom: 1 });
    await down(1, 100, 300);
    for (let x = 100; x <= 600; x += 50) { await move(1, x, 300); await frame(); }
    expect(pose().yaw).toBeCloseTo(110, 6); // 500 px × .22°/px, not clamped at 45
    expect(pose().pitch).toBe(36);
    for (let x = 650; x <= 950; x += 50) { await move(1, x, 300); await frame(); }
    expect(pose().yaw).toBeCloseTo(-173, 6); // 850 px → 187°, folded past 180
    await up(1, 950, 300); await frame();
    expect(pose().yaw).toBeCloseTo(-173, 6);
  });
  it('answers a reversal at once after the tilt sat on its limit', async () => {
    const { pose, down, move, up, frame } = mount();
    await down(1, 200, 100);
    for (let y = 100; y <= 900; y += 100) { await move(1, 200, y); await frame(); }
    expect(pose().pitch).toBe(20); // 800 px down would be −176°: clamped at the floor
    await move(1, 200, 850); await frame(); // 50 px back up
    expect(pose().pitch).toBeCloseTo(31, 6); // 20 + 50 × .22, not stuck unwinding the overshoot
    await up(1, 200, 850);
  });
  it('a pinch zooms about its centre and the finger left behind never orbits or taps', async () => {
    const { pose, down, move, up, frame } = mount();
    await down(1, 150, 400); await down(2, 250, 400);
    await move(1, 100, 400); await move(2, 300, 400); await frame();
    expect(pose().zoom).toBeCloseTo(2, 6); // 100 px apart → 200 px
    expect(pose().yaw).toBe(0);
    await up(1, 100, 400); await frame();
    // The remaining finger drifts 80 px as the hand lifts: the camera holds.
    for (let x = 300; x <= 380; x += 20) { await move(2, x, 410); await frame(); }
    expect(pose()).toMatchObject({ zoom: 2, yaw: 0, pitch: 36 });
    await up(2, 380, 410); await frame();
    // A fresh single finger orbits again.
    await down(1, 200, 300); await move(1, 300, 300); await frame();
    expect(pose().yaw).toBeCloseTo(22, 6);
    await up(1, 300, 300);
  });
});

describe('tap-to-measure (on-course ask, 2026-09-17)', () => {
  const tee = scene.features.find(f => f.id === scene.hole.routeFeatureId)!.parts[0]![0]![0]!;
  const target: [number, number] = [tee[0] + 120, tee[1] + 160]; // 200 m from the tee
  const chip = () => document.querySelector<HTMLElement>('[data-slot="tap-measure"]');
  it('a clean single tap lays a ruler from where the player is to the ground under the finger', async () => {
    harness.runtime = true; harness.pickAt = [target[0], target[1], terrainHeight(mesh, target)!];
    const { tap, rerender } = mount(null);
    expect(chip()).toBeNull();
    await tap(180, 260);
    expect(harness.picks).toEqual([[180, 260]]); // the drawing's own pixels, a read-only pick
    expect(chip()).toMatchObject({ dataset: { measureYards: '219', measureBasis: 'tee' } });
    expect(chip()!.textContent).toContain('219 yd');
    expect(chip()!.textContent).toContain('from the tee');
    expect(harness.markers?.markers.at(-1)).toMatchObject({ key: 'tap-measure', kind: 'measure', pointM: target, label: '219 yd' });
    expect(harness.markers?.links.at(-1)).toMatchObject({ key: 'tap-measure-link', fromM: [tee[0], tee[1]], toM: target, dashed: true });
    // YOU arrives 100 m up the hole: the same tap now reads from the player, no new tap needed.
    const you: SceneMarkers = { markers: [{ key: 'player', kind: 'player', pointM: [tee[0] + 60, tee[1] + 80], sigmaM: 3, label: 'YOU' }], links: [] };
    rerender(you);
    expect(chip()).toMatchObject({ dataset: { measureYards: '109', measureBasis: 'you' } });
    expect(chip()!.textContent).toContain('from you');
    expect(harness.markers?.links.at(-1)).toMatchObject({ fromM: you.markers[0]!.pointM, toM: target });
    expect(harness.markers?.markers.map(m => m.key)).toEqual(['player', 'tap-measure']);
  });
  it('a tap on the sky changes nothing; the × and a double tap clear the ruler', async () => {
    harness.runtime = true; harness.pickAt = [target[0], target[1], terrainHeight(mesh, target)!];
    const { tap, down, move, up, frame, pose } = mount(null);
    await tap(180, 260);
    expect(chip()).not.toBeNull();
    harness.pickAt = null;
    await tap(20, 20);
    expect(chip()!.dataset.measureYards).toBe('219');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Clear measurement' })); });
    expect(chip()).toBeNull();
    expect(harness.markers?.markers ?? []).toEqual([]);
    // A drag is not a tap: no ruler.
    harness.pickAt = [target[0], target[1], terrainHeight(mesh, target)!];
    await down(1, 100, 300); await move(1, 200, 300); await frame(); await up(1, 200, 300); await frame();
    expect(chip()).toBeNull();
    expect(pose().yaw).toBeCloseTo(22, 6);
    // A double tap resets the view and takes the ruler with it.
    await tap(180, 260);
    expect(chip()).not.toBeNull();
    await tap(182, 262);
    expect(chip()).toBeNull();
  });
});
