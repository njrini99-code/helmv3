import { describe, expect, it } from 'vitest';
import { slotPositions, spreadLabels } from '../Line';

/**
 * The Ask trend's dates under the plot (P013, the 2026-10-28 polish pass): on a phone column the in-thread chart wrote
 * "Sep 12Sep 19Sep 26Sep 27" with the names run together. `spreadLabels` picks the names that fit the measured width
 * and never lets two touch.
 */
const CHAR = 6.6;
const GAP = 8;

/** The points' x as Line draws them for a bare spread line (4px each side). */
const xsFor = (n: number, width: number) => slotPositions(n).map((s) => 4 + s * (width - 8));
const dates = (n: number) => Array.from({ length: n }, (_, i) => `Sep ${10 + i * 3}`);

function overlaps(picked: Array<{ i: number; x: number }>, labels: string[]) {
  return picked.some((p, k) => {
    if (k === 0) return false;
    const prev = picked[k - 1]!;
    return p.x - (labels[p.i]!.length * CHAR) / 2 - (prev.x + (labels[prev.i]!.length * CHAR) / 2) < GAP;
  });
}

describe('spreadLabels (Ask trend dates)', () => {
  it('writes every date when they fit (a desktop column)', () => {
    const labels = ['Sep 12', 'Sep 19', 'Sep 26', 'Sep 27'];
    expect(spreadLabels(xsFor(4, 600), labels, 600).map((p) => p.i)).toEqual([0, 1, 2, 3]);
  });

  it('thins to every other date, ending on the newest, when all four would run together', () => {
    const labels = ['Sep 12', 'Sep 19', 'Sep 26', 'Sep 27'];
    const picked = spreadLabels(xsFor(4, 160), labels, 160);
    expect(picked.map((p) => p.i)).toEqual([0, 3]);
    expect(overlaps(picked, labels)).toBe(false);
  });

  it('keeps alternate dates when they fit and the full set does not', () => {
    const labels = dates(6);
    const picked = spreadLabels(xsFor(6, 250), labels, 250);
    expect(picked.map((p) => p.i)).toEqual([0, 2, 5]);
    expect(overlaps(picked, labels)).toBe(false);
  });

  it('falls back to the newest date alone when even first and last would touch', () => {
    const labels = ['Sep 12', 'Sep 27'];
    expect(spreadLabels(xsFor(2, 80), labels, 80).map((p) => p.i)).toEqual([1]);
  });

  it('past six points, keeps first, middle and last when they fit', () => {
    expect(spreadLabels(xsFor(9, 340), dates(9), 340).map((p) => p.i)).toEqual([0, 4, 8]);
  });

  it('never overlaps, always names the newest, and keeps every name inside the plot', () => {
    for (let n = 1; n <= 12; n += 1) {
      for (let width = 60; width <= 720; width += 7) {
        const labels = dates(n);
        const picked = spreadLabels(xsFor(n, width), labels, width);
        expect(picked.length).toBeGreaterThan(0);
        expect(picked[picked.length - 1]!.i).toBe(n - 1);
        expect(overlaps(picked, labels)).toBe(false);
        for (const p of picked) {
          const half = (labels[p.i]!.length * CHAR) / 2;
          if (half * 2 < width) {
            expect(p.x - half).toBeGreaterThanOrEqual(0);
            expect(p.x + half).toBeLessThanOrEqual(width);
          }
        }
        // In order, left to right.
        expect([...picked].sort((a, b) => a.i - b.i)).toEqual(picked);
      }
    }
  });

  it('is empty for no points', () => {
    expect(spreadLabels([], [], 300)).toEqual([]);
  });
});
