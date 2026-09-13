import { describe, expect, it } from 'vitest';
import { fitShadowBounds } from '../shadow-bounds';
import type { Point3M } from '../terrain';

describe('fixed directional shadow bounds', () => {
  it('includes full receiving and crown extents in light space', () => {
    const points: Point3M[] = [];
    for (const x of [-30, 90]) for (const y of [-50, 370]) for (const z of [263, 305]) points.push([x, y, z]);
    const fit = fitShadowBounds(points, [-.6, -.4, .7]);
    const right: Point3M = [fit.up[1] * fit.axis[2] - fit.up[2] * fit.axis[1], fit.up[2] * fit.axis[0] - fit.up[0] * fit.axis[2], fit.up[0] * fit.axis[1] - fit.up[1] * fit.axis[0]];
    for (const p of points) {
      const relative = p.map((v, i) => v - fit.center[i]!);
      const dot = (axis: Point3M) => relative.reduce((sum, v, i) => sum + v * axis[i]!, 0);
      expect(Math.abs(dot(right))).toBeLessThan(fit.width / 2);
      expect(Math.abs(dot(fit.up))).toBeLessThan(fit.height / 2);
      expect(Math.abs(dot(fit.axis))).toBeLessThan(fit.depth / 2 + .1);
    }
  });
  it('rejects unsupported empty bounds and degenerate sun direction', () => {
    expect(() => fitShadowBounds([], [1, 1, 1])).toThrow();
    expect(() => fitShadowBounds([[0, 0, 0]], [0, 0, 1])).toThrow();
  });
});
