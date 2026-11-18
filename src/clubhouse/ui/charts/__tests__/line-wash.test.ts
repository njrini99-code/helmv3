import { describe, expect, it } from 'vitest';
import { linePath, washOf } from '../Line';

/** The shared line's wash (stats and charts audit 2026-11-15, CH-23): a segment with a negative coordinate keeps its area. */
describe('washOf · signed coordinates (CH-23)', () => {
  it('a value above the plot (a negative y) keeps its segment’s wash', () => {
    const path = linePath([3, 9, 5], (i) => 10 + i * 20, (v) => 40 - v * 6);
    expect(path).toBe('M10.0,22.0 L30.0,-14.0 L50.0,10.0');
    expect(washOf(path, '60')).toBe('M10.0,60 L10.0,22.0 L30.0,-14.0 L50.0,10.0 L50.0,60 Z');
  });

  it('a broken line closes each run on its own', () => {
    const path = linePath([3, null, -2, 4], (i) => i * 10, (v) => -v);
    expect(washOf(path, '0')).toBe('M0.0,0 L0.0,-3.0 L0.0,0 Z M20.0,0 L20.0,2.0 L30.0,-4.0 L30.0,0 Z');
  });
});
