import { expect, it } from 'vitest';
import { allocateCrowns, canopySymbols, evenSubset } from '../canopy';
import type { PointM } from '../types';
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
    expect(points.length).toBeLessThanOrEqual(600);
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

it('shares a crown budget across groups and keeps a wide forest patterned instead of bare', () => {
  const groups = [Array.from({ length: 900 }, (_, i) => i), Array.from({ length: 100 }, (_, i) => 1000 + i), [2000, 2001]];
  const shared = allocateCrowns(groups, 300);
  expect(shared.map(g => g.length)).toEqual([269, 30, 1]);
  // An even spread reaches the far end of the first group, not only its first rows.
  expect(shared[0]!.at(-1)).toBeGreaterThan(880);
  const nearest = allocateCrowns(groups, 300, item => -item);
  expect(nearest[0]!.slice(0, 3)).toEqual([899, 898, 897]);
  expect(evenSubset([1, 2, 3], 5)).toEqual([1, 2, 3]);
  // A single 600m x 600m reviewed mass would exceed the 6000-cell pattern at
  // 9m; it widens its spacing rather than dropping out.
  const scene = pilotScene('cacapon-07');
  const ring: PointM[] = [[-300, -300], [300, -300], [300, 300], [-300, 300], [-300, -300]];
  const mass = { ...scene.features.find(f => f.kind === 'woods')!, id: 'wide-mass', parts: [[ring]] };
  const points = canopySymbols(mass, { ...scene, features: [mass] });
  expect(points.length).toBeGreaterThan(200);
  expect(points.length).toBeLessThanOrEqual(600);
  const xs = points.map(p => p[0]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
});
