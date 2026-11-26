import { describe, expect, it } from 'vitest';
import { curve } from '../curve';

const plot = { width: 300, height: 100, padTop: 6, padBottom: 4 };

function numbers(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe('curve', () => {
  it('returns empty paths for no values', () => {
    expect(curve([], plot)).toEqual({ line: '', area: '', points: [] });
  });

  it('never puts a control point under the axis or over the top pad, even between zeros and a spike', () => {
    const { line } = curve([0, 0, 90, 0, 0, 100, 0], plot);
    const ys = numbers(line).filter((_, i) => i % 2 === 1);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(6);
      expect(y).toBeLessThanOrEqual(96);
    }
  });

  it('spans the full width and closes the area along the bottom', () => {
    const { points, area } = curve([1, 2, 3], plot);
    expect(points[0]![0]).toBe(0);
    expect(points[2]![0]).toBe(300);
    expect(area.endsWith('L300,100 L0,100 Z')).toBe(true);
  });

  it('treats negative and non-finite values as zero', () => {
    const { points } = curve([-5, Number.NaN, 10], plot);
    expect(points[0]![1]).toBe(96);
    expect(points[1]![1]).toBe(96);
    expect(points[2]![1]).toBe(6);
  });

  it('draws a single value as a flat line', () => {
    expect(curve([4], plot).line).toBe('M0,6 L300,6');
  });

  it('scales to a given max so two charts can share an axis', () => {
    const { points } = curve([5, 10], plot, 20);
    expect(points[1]![1]).toBe(51);
  });
});
