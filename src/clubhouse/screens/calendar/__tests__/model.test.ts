import { describe, expect, it } from 'vitest';
import { layoutLanes, overlapLines, type ChCalEvent, type ChCalOverlap } from '../model';

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

/** The phone day row says what a flagged event overlaps, in words. */
describe('Calendar · overlapLines', () => {
  const ev = (id: string, title: string) => ({ id, title }) as ChCalEvent;
  const over = (eventId: string, withId: string, who = 'p1'): ChCalOverlap => ({ id: `${eventId}:${withId}:${who}`, eventId, withId, who, from: 16, to: 17 });
  const events = [ev('one', '1:1 with Jonah'), ev('short', 'Short-game block'), ev('econ', 'ECON 101'), ev('stat', 'STAT 201')];
  const lines = (o: ChCalOverlap[]) => Object.fromEntries(overlapLines(o, events, (e) => e.title));

  it('names the other event; two are joined, more are counted, and a name is said once', () => {
    expect(lines([over('one', 'short')])).toEqual({ one: 'Overlaps Short-game block' });
    expect(lines([over('one', 'short'), over('one', 'econ')])).toEqual({ one: 'Overlaps Short-game block and ECON 101' });
    expect(lines([over('one', 'short'), over('one', 'econ'), over('one', 'stat')])).toEqual({ one: 'Overlaps Short-game block and 2 more' });
    // Two players clash with the same event: it is named once.
    expect(lines([over('one', 'short', 'p1'), over('one', 'short', 'p2')])).toEqual({ one: 'Overlaps Short-game block' });
  });

  it('an event that is not loaded is still words, and an event with no overlap has no line', () => {
    expect(lines([over('one', 'gone')])).toEqual({ one: 'Overlaps another event' });
    expect(overlapLines([], events, (e) => e.title).size).toBe(0);
  });
});
