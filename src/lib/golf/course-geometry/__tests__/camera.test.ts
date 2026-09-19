import { describe, expect, it } from 'vitest';
import { contextCamera, contextPoints, entryView, puttingFocusCamera, puttingPlanCamera } from '../camera';
import { toScreen, fromScreen } from '../project';
import { displayOutline, boundaryDistance, DISPLAY_EDGE_LIMIT_M } from '../display-outline';
import { ringArea, simpleRing } from '../spatial';
import { addInteractivePreviewTrajectories, pilotScene, pilotShots } from '@/test/fixtures/course-geometry/pilot';

it('enlarges the green complex, keeping a single physical frame and immutable evidence', () => {
  const scene = pilotScene('cacapon-07');
  const original = structuredClone(scene);
  const overview = contextCamera(scene, 356, 160, 'hole');
  const detail = contextCamera(scene, 356, 160, 'green');
  expect(detail.scale).toBeGreaterThan(overview.scale * 3);
  for (const view of ['hole', 'approach', 'green'] as const) {
    const camera = contextCamera(scene, 356, 160, view);
    for (const f of scene.features) for (const component of f.parts) for (const ring of component) {
      for (const p of ring) {
        const restored = fromScreen(toScreen(p, camera), camera);
        expect(Math.hypot(restored[0] - p[0], restored[1] - p[1])).toBeLessThan(1e-8);
      }
    }
  }
  expect(scene).toEqual(original);
});
it('ignores legacy derived length and all entered numbers when choosing the physical camera', () => {
  const scene = pilotScene('cacapon-07');
  const before = contextCamera(scene, 324, 310, 'green');
  scene.events[0]!.evidence.legacyLength.valueM = 9999;
  scene.events[0]!.evidence.after.valueM = 1;
  scene.events.reverse();
  expect(contextCamera(scene, 324, 310, 'green')).toEqual(before);
});
it('defaults from committed shot type, including a separate putting frame', () => {
  expect(['tee', 'approach', 'around_green', 'putting'].map(entryView)).toEqual(['hole', 'approach', 'green', 'putting']);
});
it('keeps the whole-green fit independent from earlier illustrative flights', () => {
  const source = pilotScene('cacapon-07', false);
  const withFlights = addInteractivePreviewTrajectories(source, pilotShots);
  expect(contextPoints(withFlights, 'green')).toEqual(contextPoints(source, 'green'));
  expect(contextCamera(withFlights, 390, 380, 'green')).toEqual(contextCamera(source, 390, 380, 'green'));
  expect(contextPoints(withFlights, 'approach').length).toBeGreaterThan(contextPoints(source, 'approach').length);
});
it('uses an explicit displayed roll for Focus putt and retains whole-green fitting without one', () => {
  const scene = pilotScene('cacapon-07', false);
  const pin = scene.target.estimate!.positionM;
  scene.illustrativePuttingTracks = [{ key: 'focus-roll', shotNumber: 4, kind: 'surface_roll', source: 'interactive_preview_fixture', pointsM: [[pin[0] - 4, pin[1] + 2], [pin[0] - 2, pin[1] + 1], pin] }];
  const whole = puttingPlanCamera(scene, 390, 272);
  const focus = puttingFocusCamera(scene, 390, 272, 4);
  expect(focus.scale).toBeGreaterThan(whole.scale);
  const withoutRoll = structuredClone(scene);
  withoutRoll.illustrativePuttingTracks = withoutRoll.illustrativePuttingTracks?.filter(track => track.kind !== 'surface_roll');
  expect(puttingFocusCamera(withoutRoll, 390, 272, 4)).toEqual(puttingPlanCamera(withoutRoll, 390, 272));
});
it('fits the compact putting plan to the canonical green before remote bunker context', () => {
  const scene = pilotScene('cacapon-07', false);
  const complex = contextCamera(scene, 390, 272, 'green');
  const plan = puttingPlanCamera(scene, 390, 272);
  expect(plan.scale).toBeGreaterThan(complex.scale);
  const green = scene.features.find(feature => feature.id === scene.hole.greenFeatureId)!;
  for (const point of green.parts.flat(2)) {
    const [x, y] = toScreen(point, plan);
    expect(x).toBeGreaterThanOrEqual(20);
    expect(x).toBeLessThanOrEqual(370);
    expect(y).toBeGreaterThanOrEqual(20);
    expect(y).toBeLessThanOrEqual(252);
  }
});
describe('source-backed display-edge cleanup', () => {
  it('retains all components/rings with bounded displacement and area across the pilot', () => {
    let changed = 0;
    for (let i = 1; i <= 18; i++) {
      const scene = pilotScene(`cacapon-${String(i).padStart(2, '0')}`, false);
      for (const f of scene.features.filter(f => ['fairway', 'green', 'bunker'].includes(f.kind))) {
        const original = structuredClone(f);
        const display = displayOutline(f);
        expect(display.parts.length).toBe(f.parts.length);
        display.parts.forEach((component, ci) => {
          expect(component.length).toBe(f.parts[ci]!.length);
          component.forEach((ring, ri) => {
            const canonical = f.parts[ci]![ri]!;
            expect(simpleRing(ring)).toBe(true);
            expect(Math.abs(ringArea(ring) / ringArea(canonical) - 1)).toBeLessThanOrEqual(.015);
            for (const p of ring) expect(boundaryDistance(p, canonical)).toBeLessThanOrEqual(DISPLAY_EDGE_LIMIT_M);
            for (const p of canonical) expect(boundaryDistance(p, ring)).toBeLessThanOrEqual(DISPLAY_EDGE_LIMIT_M);
          });
        });
        if (display !== f) changed++;
        expect(f).toEqual(original);
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
});
