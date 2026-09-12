import { expect, it } from 'vitest';
import { canopySymbols } from '../canopy';
import { contextCamera } from '../camera';
import { boundaryDistance } from '../display-outline';
import { inFeature } from '../spatial';
import { pilotScene } from '@/test/fixtures/course-geometry/pilot';

it('keeps decorative crowns inside reviewed groups and away from playing surfaces', () => {
  const scene = pilotScene('cacapon-07');
  const original = structuredClone(scene);
  const groups = scene.features.filter(f => f.kind === 'woods');
  expect(groups.length).toBeGreaterThan(0);
  for (const group of groups) {
    const points = canopySymbols(group, scene);
    expect(points.length).toBeLessThanOrEqual(220);
    for (const point of points) {
      expect(inFeature(point, group)).toBe(true);
      for (const f of scene.features.filter(f => f.kind !== 'woods' && f.kind !== 'route')) {
        expect(inFeature(point, f)).toBe(false);
        for (const ring of f.parts.flat()) expect(boundaryDistance(point, ring)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(canopySymbols({ ...group, reviewed: false }, scene)).toEqual([]);
  }
  expect(scene).toEqual(original);
});

it('adding vegetation cannot shrink the hole camera or invent a shot anchor', () => {
  const scene = pilotScene('cacapon-07');
  for (const view of ['hole', 'approach', 'green'] as const) {
    expect(contextCamera(scene, 356, 160, view)).toEqual(contextCamera({ ...scene, features: scene.features.filter(f => f.kind !== 'woods') }, 356, 160, view));
  }
  expect(scene.events.every(e => e.anchorM === null)).toBe(true);
});
