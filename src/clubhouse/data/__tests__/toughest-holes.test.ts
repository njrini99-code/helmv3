import { describe, expect, it } from 'vitest';
import { courseKeyOf, toughestHoles, type ChHoleRow } from '../stats-figures';

const h = (n: number, par: number, score: number, r: string): ChHoleRow => ({ round_id: r, hole_number: n, par, score });

describe('toughestHoles ranks each course on its own', () => {
  // Braeden, September: hole 8 is a par 4 at Bryan Park and a par 3 at The Cardinal.
  const course: Record<string, { key: string; name: string } | null> = {
    bp1: { key: 'bryan park players', name: 'Bryan Park Players' },
    bp2: { key: 'bryan park players', name: 'Bryan Park Players' },
    bp3: { key: 'bryan park players', name: 'Bryan Park Players' },
    tc1: { key: 'the cardinal', name: 'The Cardinal' },
    tc2: { key: 'the cardinal', name: 'The Cardinal' },
    tc3: { key: 'the cardinal', name: 'The Cardinal' },
    none: null,
  };
  const courseOf = (roundId: string) => course[roundId] ?? null;

  it('gives the same hole number at two courses two entries, each with its own par', () => {
    const rows = [h(8, 4, 4, 'bp1'), h(8, 4, 5, 'bp2'), h(8, 4, 6, 'bp3'), h(8, 3, 9, 'tc1'), h(8, 3, 3, 'tc2'), h(8, 3, 4, 'tc3')];
    const t = toughestHoles(rows, courseOf);
    expect(t.holes).toEqual([
      { hole: 8, course: 'The Cardinal', par: 3, avgToPar: 2.33, plays: 3, doublePlus: 1 },
      { hole: 8, course: 'Bryan Park Players', par: 4, avgToPar: 1, plays: 3, doublePlus: 1 },
    ]);
  });

  it('applies the play floor per course and hole', () => {
    const rows = [h(5, 4, 8, 'bp1'), h(5, 4, 8, 'bp2'), h(5, 4, 8, 'tc1')];
    expect(toughestHoles(rows, courseOf)).toMatchObject({ holes: [], belowFloor: true });
  });

  it('leaves out a round with no course without throwing', () => {
    const rows = [h(1, 4, 9, 'none'), h(1, 4, 5, 'tc1'), h(1, 4, 5, 'tc2'), h(1, 4, 5, 'tc3')];
    expect(toughestHoles(rows, courseOf).holes).toEqual([{ hole: 1, course: 'The Cardinal', par: 4, avgToPar: 1, plays: 3, doublePlus: 0 }]);
  });
});

describe('courseKeyOf', () => {
  it('uses the course id when the round has one', () => {
    expect(courseKeyOf({ course_id: 'c-1', course_name: 'Forest Oaks CC' })).toEqual({ key: 'c-1', name: 'Forest Oaks CC' });
  });
  it('folds free-text names that differ only by a club suffix, case or spacing', () => {
    expect(courseKeyOf({ course_id: null, course_name: 'Forest Oaks CC' })?.key).toBe(courseKeyOf({ course_id: null, course_name: '  forest  oaks ' })?.key);
    expect(courseKeyOf({ course_id: null, course_name: 'Williamsburg Golf Club' })?.key).toBe(courseKeyOf({ course_id: null, course_name: 'Williamsburg' })?.key);
  });
  it('has no key when the round names no course', () => {
    expect(courseKeyOf({ course_id: null, course_name: null })).toBeNull();
    expect(courseKeyOf({ course_id: null, course_name: '   ' })).toBeNull();
  });
});
