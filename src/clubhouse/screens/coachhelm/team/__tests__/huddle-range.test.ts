import { describe, expect, it } from 'vitest';
import { huddleRange, spreadCoins } from '../Huddle';

// The chart's box, as Huddle.tsx draws it: 320 × 262, plot from (36, 16) to (308, 222).
const at = (v: { x: number; y: number }, r: { lo: number; hi: number }) => ({
  x: 36 + ((v.x - r.lo) / (r.hi - r.lo)) * 272,
  y: 16 + ((r.hi - v.y) / (r.hi - r.lo)) * 206,
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
      expect(c.y + 22).toBeLessThanOrEqual(262);
    }
  });

  it('keeps the default window when nothing is near an edge', () => {
    expect(huddleRange([{ x: -0.6, y: -0.9 }])).toEqual({ lo: -1.8, hi: 0.2 });
  });
});

describe('coins that land on one another are drawn apart (L-024)', () => {
  const box = { x0: 0, x1: 320, y0: 0, y1: 262 };
  it('separates two coins on the same figures by a coin’s width', () => {
    const [a, b] = spreadCoins([{ x: 100, y: 100 }, { x: 100, y: 100 }], box);
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(26);
  });
  it('moves a coin at most 14 from its true point and leaves apart coins alone', () => {
    const pts = [{ x: 50, y: 50 }, { x: 52, y: 50 }, { x: 200, y: 150 }];
    const out = spreadCoins(pts, box);
    expect(out[2]).toEqual(pts[2]);
    out.forEach((o, i) => expect(Math.hypot(o.x - pts[i]!.x, o.y - pts[i]!.y)).toBeLessThanOrEqual(14 * Math.SQRT2 + 0.01));
  });
});
