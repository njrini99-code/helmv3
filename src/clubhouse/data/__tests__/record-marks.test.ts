import { describe, expect, it } from 'vitest';
import { recordMarks, sameTees, type ChMarkRound } from '../record-marks';

const SEASON = '2026-08-01';
let seq = 0;
const r = (total: number, over: Partial<ChMarkRound> = {}): ChMarkRound => ({
  id: `r${seq++}`,
  date: '2026-09-15',
  holesPlayed: 18,
  total,
  front: null,
  back: null,
  putts: null,
  courseGroup: 'finley',
  ...over,
});
const marks = (round: ChMarkRound, history: ChMarkRound[]) => recordMarks(round, history, { seasonStart: SEASON, courseName: 'Finley' }).map((m) => m.label);

describe('recordMarks (P-7)', () => {
  it('needs a set of three, and a career low hides the season low', () => {
    const now = r(70);
    expect(marks(now, [r(74)])).toEqual([]);
    expect(marks(now, [r(74), r(76, { date: '2025-09-01' })])).toEqual(['Career low', 'Best at Finley']);
  });

  it('season low when an older season had a lower round; a tie says so', () => {
    const now = r(72);
    const history = [r(70, { date: '2025-05-01', courseGroup: 'marsh' }), r(75), r(76), r(78, { courseGroup: 'marsh' })];
    expect(marks(now, history)).toEqual(['Season low', 'Best at Finley']);
    expect(marks(r(75), [r(70, { date: '2025-05-01', courseGroup: 'marsh' }), r(75), r(78), r(79)])).toEqual(['Ties season low', 'Ties best at Finley']);
  });

  it('never compares a nine-hole round with eighteen, and 2nd best needs five', () => {
    expect(marks(r(36, { holesPlayed: 9 }), [r(70), r(71), r(72)])).toEqual([]);
    const fiveSet = [r(70, { courseGroup: 'marsh' }), r(75, { courseGroup: 'marsh' }), r(76, { courseGroup: 'marsh' }), r(77, { courseGroup: 'marsh' })];
    expect(marks(r(72, { courseGroup: null }), fiveSet)).toEqual(['2nd best this season']);
  });

  it('putts and nines this season, at most two marks', () => {
    const now = r(80, { putts: 27, back: 34, front: 46 });
    const history = [r(70, { putts: 31, back: 36, front: 34 }), r(72, { putts: 30, back: 35, front: 37 }), r(74, { putts: 0, back: 37, front: 37 })];
    expect(marks(now, history)).toEqual(['Fewest putts this season · 27', 'Best back nine this season · 34']);
  });

  it('a later, lower round takes the chip away (measured against the current history)', () => {
    const now = r(70);
    expect(marks(now, [r(74), r(76), r(69, { date: '2026-10-20' })])).toEqual([]);
  });
});

describe('sameTees', () => {
  it('matches by tee id, else by the tee name', () => {
    expect(sameTees({ teeId: 'a', tees: 'Blue' }, { teeId: 'b', tees: 'Blue' })).toBe(false);
    expect(sameTees({ teeId: null, tees: ' blue ' }, { teeId: 'b', tees: 'Blue' })).toBe(true);
    expect(sameTees({ teeId: null, tees: null }, { teeId: null, tees: '' })).toBe(false);
  });
});
