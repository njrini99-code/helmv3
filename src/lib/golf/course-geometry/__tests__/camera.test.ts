import { describe, expect, it } from 'vitest';
import { contextCamera, entryView } from '../camera';
import { toScreen, fromScreen } from '../project';
import { displayOutline, boundaryDistance, DISPLAY_EDGE_LIMIT_M } from '../display-outline';
import { ringArea, simpleRing } from '../spatial';
import { pilotScene } from '@/test/fixtures/course-geometry/pilot';

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
