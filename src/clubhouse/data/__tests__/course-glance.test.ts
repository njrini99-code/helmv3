import { describe, expect, it } from 'vitest';
import { courseGlances, glanceFor, type ChGlanceRow } from '../course-glance';

let seq = 0;
const row = (total: number, over: Partial<ChGlanceRow> = {}): ChGlanceRow => ({ id: `r${seq++}`, course_id: null, course_name: 'Finley GC', round_date: '2026-10-03', holes_played: 18, total_score: total, front_nine: 36, back_nine: total - 36, total_putts: null, notes: null, ...over });

describe('courseGlances (P-7 4.6)', () => {
  it('sums each course as the course page does, with the last round and its note', () => {
    const g = courseGlances([row(76, { notes: ' commit on the 7 tee ' }), row(70, { round_date: '2026-03-14', course_name: 'finley gc' }), row(80, { course_name: 'Marsh' })]);
    expect(g['n-finley%20gc']).toEqual({ key: 'n-finley%20gc', rounds: 2, average: 73, best: 70, last: { score: 76, date: '2026-10-03', note: 'commit on the 7 tee' } });
    expect(g['n-marsh']!.average).toBeNull();
    expect(glanceFor(g, { courseId: null, courseName: 'Finley GC' })!.rounds).toBe(2);
    expect(glanceFor(g, { courseId: null, courseName: 'Pinehurst' })).toBeNull();
  });

  it('a library course is found by its id, and a name-only round joins it', () => {
    const id = '0b3c6a1e-1111-4222-8333-944455556666';
    const g = courseGlances([row(74, { course_id: id }), row(72)]);
    expect(glanceFor(g, { courseId: id, courseName: 'Finley GC' })!.rounds).toBe(2);
  });
});
