import { describe, expect, it } from 'vitest';
import { clampRadius, placeLabels, scaleToBox } from '../chart-geometry';

describe('clampRadius', () => {
  const spec = { min: 10, max: 28, full: 2 };
  it("holds staging's real figures inside the hole (TEAM-1)", () => {
    for (const v of [-3.9, 2.5, 1.9, 0, -300]) expect(clampRadius(v, spec)).toBeLessThanOrEqual(28);
    expect(clampRadius(-3.9, spec)).toBe(28);
  });
  it('rests at the minimum with no figure', () => {
    for (const v of [0, null, undefined, Number.NaN]) expect(clampRadius(v, spec)).toBe(10);
  });
  it('grows with the value and ignores its sign', () => {
    expect(clampRadius(0.5, spec)).toBeLessThan(clampRadius(1, spec));
    expect(clampRadius(-1, spec)).toBe(clampRadius(1, spec));
  });
});

describe('scaleToBox', () => {
  it('stays in the box past either end of the domain', () => {
    expect(scaleToBox(-9, [-1, 1], 100)).toBe(0);
    expect(scaleToBox(9, [-1, 1], 100)).toBe(100);
    expect(scaleToBox(0, [-1, 1], 100)).toBe(50);
  });
  it('lands in the middle on a flat domain or a bad value', () => {
    expect(scaleToBox(3, [3, 3], 100)).toBe(50);
    expect(scaleToBox(Number.NaN, [0, 1], 100)).toBe(50);
  });
});

describe('placeLabels', () => {
  const box = { x: 0, y: 0, w: 330, h: 400 };
  const inside = (l: { x: number; y: number; w: number; h: number }) => l.x >= 0 && l.y >= 0 && l.x + l.w <= 330 && l.y + l.h <= 400;
  it('keeps a long label off the right edge (TEAM-3)', () => {
    const [l] = placeLabels([{ id: 'sg', x: 300, y: 134, r: 20, w: 118, h: 16 }], box);
    expect(inside(l!)).toBe(true);
    expect(l!.anchor).toBe('end');
    expect(l!.fits).toBe(true);
  });
  it('keeps labels off every mark and each other', () => {
    const marks = [
      { id: 'a', x: 160, y: 76, r: 28, w: 60, h: 16 },
      { id: 'b', x: 198, y: 134, r: 20, w: 118, h: 16 },
      { id: 'c', x: 150, y: 250, r: 24, w: 60, h: 16 },
    ];
    const placed = placeLabels(marks, box);
    expect(placed.every((l) => l.fits && inside(l))).toBe(true);
  });
  it('keeps a label off an obstacle, such as a coin', () => {
    const coin = { x: 120, y: 100, w: 22, h: 22 };
    const [l] = placeLabels([{ id: 'a', x: 100, y: 110, r: 10, w: 60, h: 16 }], box, 6, [coin]);
    expect(l!.fits).toBe(true);
    expect(l!.x + l!.w <= coin.x || l!.x >= coin.x + coin.w || l!.y + l!.h <= coin.y || l!.y >= coin.y + coin.h).toBe(true);
  });
  it("says so when nothing is clear, and still stays in the box", () => {
    const [l] = placeLabels([{ id: 'a', x: 20, y: 20, r: 20, w: 40, h: 40 }], { x: 0, y: 0, w: 40, h: 40 });
    expect(l!.fits).toBe(false);
    expect(l!.x).toBeGreaterThanOrEqual(0);
  });
});
