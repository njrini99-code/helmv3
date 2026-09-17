/**
 * HoleSceneFrame — the phone's orbit, tilt and pinch (on-course ask,
 * 2026-09-17: "moving my finger around and going the whole 360 and zoom").
 *
 * Without a WebGL runtime every camera update commits straight to state, so
 * the drawing's `data-camera-*` attributes are the pose after each event.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { HoleSceneFrame } from './HoleSceneFrame';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import course from '@/test/fixtures/course-geometry/cacapon.json';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';

// No WebGL in jsdom: the runtime would report the terrain unavailable and
// turn the orbit off. The gestures under test live in the frame, not the canvas.
vi.mock('./CourseHoleScene', async () => {
  const actual = await vi.importActual<typeof import('./CourseHoleScene')>('./CourseHoleScene');
  return { ...actual, CourseHoleScene: () => <div data-testid="course-scene" /> };
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
afterEach(cleanup);

function mount() {
  render(<HoleSceneFrame scene={scene} context="entry" presentation="stage" />);
  const drawing = document.querySelector<HTMLElement>('[data-slot="course-drawing"][aria-label]')!;
  expect(drawing).not.toBeNull();
  const pose = () => ({ yaw: Number(drawing.getAttribute('data-camera-yaw')), pitch: Number(drawing.getAttribute('data-camera-pitch')), zoom: Number(drawing.getAttribute('data-camera-zoom')) });
  const down = (id: number, x: number, y: number) => act(() => { fireEvent.pointerDown(drawing, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, isPrimary: id === 1 }); });
  const move = (id: number, x: number, y: number) => act(() => { fireEvent.pointerMove(drawing, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y }); });
  const up = (id: number, x: number, y: number) => act(() => { fireEvent.pointerUp(drawing, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y }); });
  // Moves coalesce onto the next frame; settle it before reading the pose.
  const frame = () => act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  return { pose, down, move, up, frame };
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
