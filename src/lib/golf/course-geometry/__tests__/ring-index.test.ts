import { describe, expect, it } from 'vitest';
import { boundaryDistance } from '../display-outline';
import { featureBoundaryDistance, featureContains, indexContains, indexDistance, indexFeature, indexRing } from '../ring-index';
import { inFeature, inRing } from '../spatial';
import type { LocalFeature, PointM } from '../types';

/** Deterministic LCG so a failure names its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
/** A jagged star polygon: many edges, re-entrant, spanning `radius` metres. */
function star(random: () => number, centre: PointM, radius: number, spokes: number, close: boolean): PointM[] {
  const ring: PointM[] = [];
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2, r = radius * (.35 + .65 * random());
    ring.push([centre[0] + Math.cos(angle) * r, centre[1] + Math.sin(angle) * r]);
  }
  if (close) ring.push([ring[0]![0], ring[0]![1]]);
  return ring;
}
/** Points where the answers are delicate: on vertices, along edges, on the
 * box, plus a uniform scatter over and around the box. */
function probes(random: () => number, ring: readonly PointM[], count: number): PointM[] {
  const points: PointM[] = [];
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  for (const p of ring) points.push([p[0], p[1]]);
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!, b = ring[i]!, t = random();
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    points.push([a[0] + (b[0] - a[0]) * .5, a[1] + (b[1] - a[1]) * .5]);
  }
  for (const p of ring) { points.push([p[0], minY]); points.push([maxX, p[1]]); points.push([p[0] + 1e-7, p[1]]); points.push([p[0], p[1] - 1e-7]); }
  for (let i = 0; i < count; i++) points.push([minX - 30 + random() * (maxX - minX + 60), minY - 30 + random() * (maxY - minY + 60)]);
  return points;
}

describe('ring index (forest compile)', () => {
  it('answers inRing and boundaryDistance exactly on closed, open and degenerate rings', () => {
    const random = rng(7);
    const rings: PointM[][] = [
      star(random, [0, 0], 120, 400, true), star(random, [50, -30], 15, 9, false), star(random, [0, 0], 800, 1900, true),
      // Duplicate vertices (zero-length edges) and a collinear run.
      [[0, 0], [10, 0], [10, 0], [20, 0], [20, 10], [0, 10], [0, 0]],
      // A sliver thinner than a cell.
      [[0, 0], [300, .2], [300, .4], [0, .6], [0, 0]],
      [[3, 4]], [[3, 4], [3, 4]], [],
    ];
    for (const ring of rings) {
      const index = indexRing(ring);
      for (const p of probes(random, ring, 3000)) {
        expect(indexContains(index, p), `contains ${p}`).toBe(inRing(p, ring));
        expect(indexDistance(index, p), `distance ${p}`).toBe(boundaryDistance(p, ring));
      }
    }
  });

  it('with a cap, is exact below the cap and never below it otherwise', () => {
    const random = rng(11);
    const ring = star(random, [0, 0], 200, 700, true), index = indexRing(ring);
    for (const p of probes(random, ring, 2000)) {
      const truth = boundaryDistance(p, ring);
      for (const cap of [0, 1, 5, truth, truth + 1e-6, 40, Infinity]) {
        const capped = indexDistance(index, p, cap);
        if (truth < cap) expect(capped).toBe(truth); else expect(capped).toBeGreaterThanOrEqual(cap);
      }
    }
  });

  it('answers inFeature exactly for a multipolygon with holes, and the ring minimum for its boundary', () => {
    const random = rng(3);
    const outer = star(random, [0, 0], 150, 300, true), hole = star(random, [10, 5], 30, 40, true), other = star(random, [400, 0], 60, 80, true);
    const feature = { id: 'w', kind: 'woods', type: 'MultiPolygon', parts: [[outer, hole], [other]] } as unknown as LocalFeature;
    const index = indexFeature(feature);
    const rings = [outer, hole, other];
    for (const p of [...probes(random, outer, 2000), ...probes(random, hole, 500), ...probes(random, other, 500)]) {
      expect(featureContains(index, p)).toBe(inFeature(p, feature));
      expect(featureBoundaryDistance(index, p)).toBe(Math.min(...rings.map(ring => boundaryDistance(p, ring))));
    }
    const line = { id: 'l', kind: 'route', type: 'LineString', parts: [[[[0, 0], [10, 10]]]] } as unknown as LocalFeature;
    expect(featureContains(indexFeature(line), [5, 5])).toBe(inFeature([5, 5], line));
  });
});
