import { describe, expect, it } from 'vitest';
import { layoutLanes } from '../model';

/** A26: the week grid's cascade starts from the lanes; three events over one another take three. */
describe('Calendar · layoutLanes', () => {
  it('three overlapping events take three lanes', () => {
    const ev = (id: string, start: number, end: number) => ({ id, start, end });
    const out = layoutLanes([ev('a', 9, 12), ev('b', 10, 11), ev('c', 10.5, 13)]);
    expect(out.map((l) => [l.e.id, l.lane, l.lanes])).toEqual([
      ['a', 0, 3],
      ['b', 1, 3],
      ['c', 2, 3],
    ]);
  });
});
