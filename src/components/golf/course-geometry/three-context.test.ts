import { describe, expect, it } from 'vitest';
import { roundCorners } from './three-context';

describe('context ribbon corner fillets', () => {
  it('rounds sharp bends within the fillet reach and keeps gentle bends and end points exact', () => {
    const line: [number, number][] = [[0, 0], [20, 0], [20, 20], [21, 40]];
    const out = roundCorners(line, 2);
    expect(out[0]).toEqual([0, 0]); expect(out[out.length - 1]).toEqual([21, 40]);
    // The right angle at (20, 0) is replaced by a fillet that never passes through the corner …
    expect(out.some(([x, y]) => x === 20 && y === 0)).toBe(false);
    // … and stays within 2 m of it; the gentle bend at (20, 20) is kept as is.
    const nearCorner = out.filter(([x, y]) => Math.hypot(x - 20, y - 0) <= 2.0001);
    expect(nearCorner.length).toBeGreaterThanOrEqual(5);
    expect(out.some(([x, y]) => x === 20 && y === 20)).toBe(true);
    // Consecutive directions never reverse, so a strip built on it cannot fold.
    for (let i = 2; i < out.length; i++) {
      const [ax, ay] = out[i - 2]!, [bx, by] = out[i - 1]!, [cx, cy] = out[i]!;
      expect((bx - ax) * (cx - bx) + (by - ay) * (cy - by)).toBeGreaterThanOrEqual(0);
    }
    // Two-point lines are untouched.
    expect(roundCorners([[0, 0], [5, 5]], 2)).toEqual([[0, 0], [5, 5]]);
  });
});
