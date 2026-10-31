import { describe, expect, it } from 'vitest';
import { shotPath } from '../hole-geometry';

describe('shotPath (the course view’s shot animation)', () => {
  it('a full shot bows: one quadratic curve from where it was hit to where it landed', () => {
    expect(shotPath({ x: 100, y: 700 }, { x: 100, y: 0 }, false)).toBe('M100,700 Q200,350 100,0');
  });

  it('a putt rolls straight', () => {
    expect(shotPath({ x: 10, y: 20 }, { x: 30, y: 40 }, true)).toBe('M10,20 L30,40');
  });

  it('a shot that did not move is a point, not a curve', () => {
    expect(shotPath({ x: 5, y: 5 }, { x: 5, y: 5 }, false)).toBe('M5,5 L5,5');
  });
});
