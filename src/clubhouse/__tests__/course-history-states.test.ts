import { describe, expect, it } from 'vitest';
import { toCourseHistory, type ChCourseListRow } from '../data/course-page-shape';

/** P-7 course page states the catalog names (rounds.md). */
describe('course history states', () => {
  const row = (over: Partial<ChCourseListRow> = {}): ChCourseListRow => ({
    id: 'a', course_id: null, course_name: 'Finley GC', course_city: null, course_state: null, tee_id: null, tees_played: null, round_date: '2026-09-01', round_type: null,
    holes_played: 18, total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, notes: null, ...over,
  });
  const base = { holes: null, library: null, coachNote: null, window: 'all' as const, seasonStart: '2026-08-01', who: null };

  it('CH-11330: a course this viewer has no rounds at, or a key that is not one, is "No rounds here"', () => {
    expect(toCourseHistory({ ...base, rawKey: 'n-pinehurst', list: [row()] })).toEqual({ kind: 'notFound' });
    expect(toCourseHistory({ ...base, rawKey: 'not-a-key', list: [row()] })).toEqual({ kind: 'notFound' });
    expect(toCourseHistory({ ...base, rawKey: 'n-finley%20gc', list: [] })).toEqual({ kind: 'notFound' });
    expect(toCourseHistory({ ...base, rawKey: 'n-finley%20gc', list: [row()] }).kind).toBe('ok');
  });

  it('CH-11333: a course with no hole scores has no holes to map, and says why, not that it failed', () => {
    const res = toCourseHistory({ ...base, holes: new Map(), rawKey: 'n-finley%20gc', list: [row({ front_nine: null, back_nine: null })] });
    expect(res.kind === 'ok' && { holes: res.data.holes.length, failed: res.data.holesError }).toEqual({ holes: 0, failed: false });
    const failed = toCourseHistory({ ...base, holes: null, rawKey: 'n-finley%20gc', list: [row()] });
    expect(failed.kind === 'ok' && failed.data.holesError).toBe(true);
  });
});
