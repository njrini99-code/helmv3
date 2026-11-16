import { describe, expect, it } from 'vitest';
import { huddleRange } from '../Huddle';

// The chart's box, as Huddle.tsx draws it: 320 × 256, plot from (36, 16) to (308, 220).
const at = (v: { x: number; y: number }, r: { lo: number; hi: number }) => ({
  x: 36 + ((v.x - r.lo) / (r.hi - r.lo)) * 272,
  y: 16 + ((r.hi - v.y) / (r.hi - r.lo)) * 204,
});

describe('the Huddle keeps every coin’s 44 tap circle inside the drawing (TEAM-1)', () => {
  it.each([
    [[{ x: 0.1, y: 0.05 }]],
    [[{ x: 3.4, y: 3.3 }, { x: -2.2, y: -1.9 }]],
    [[{ x: 1.9, y: -4.6 }, { x: -4.4, y: 2.35 }]],
    [[{ x: 0.2, y: 4.85 }, { x: -6.1, y: -6.2 }]],
  ])('%j', (points) => {
    const r = huddleRange(points);
    for (const p of points) {
      const c = at(p, r);
      expect(c.x + 22).toBeLessThanOrEqual(320);
      expect(c.y - 22).toBeGreaterThanOrEqual(0);
      expect(c.x - 22).toBeGreaterThanOrEqual(0);
      expect(c.y + 22).toBeLessThanOrEqual(256);
    }
  });

  it('keeps the default window when nothing is near an edge', () => {
    expect(huddleRange([{ x: -0.6, y: -0.9 }])).toEqual({ lo: -1.8, hi: 0.2 });
  });
});
